"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { textoErro } from "@tshirtclub/domain";
import { Aviso, Botao, Campo, Turnstile } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";

const CHAVE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Etapa = "SENHA" | "CODIGO" | "CADASTRAR_AUTENTICADOR";
interface Cadastro { factorId: string; qrCode: string; segredo: string }

/** Só caminhos do próprio painel (nada de redirecionar para fora). */
function destino(): string {
  const v = new URLSearchParams(location.search).get("voltar");
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/entrar") ? v : "/";
}

export function Entrar() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("SENHA");
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pedeDesafio, setPedeDesafio] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const senha = String(f.get("senha") ?? "");
    if (!email || senha.length < 12) return setErro("Confira o e-mail e a senha (a senha tem pelo menos 12 caracteres).");
    if (pedeDesafio && CHAVE_TURNSTILE && !token) return setErro(textoErro("TURNSTILE_REQUIRED").mensagem);
    setOcupado(true);
    setErro(null);
    const r = await chamarApi<{ etapa: Etapa }>("v1/admin/auth/login", { email, senha, ...(token ? { turnstileToken: token } : {}) });
    setOcupado(false);
    setToken(null);
    setVersao((v) => v + 1);
    if (r.ok) {
      if (r.dados.etapa === "CADASTRAR_AUTENTICADOR") return void cadastrar();
      return setEtapa("CODIGO");
    }
    if (r.codigo === "INVALID_CREDENTIALS") {
      if (r.detalhes.turnstile) setPedeDesafio(true);
      return setErro("E-mail ou senha não conferem.");
    }
    if (r.codigo === "TURNSTILE_REQUIRED" || r.codigo === "TURNSTILE_INVALID") setPedeDesafio(true);
    if (r.codigo === "LOGIN_BLOCKED" && typeof r.detalhes.ate === "string") {
      return setErro(`Muitas senhas erradas desta rede. Tente de novo às ${horario(r.detalhes.ate)}. Mandamos um aviso para o e-mail da conta.`);
    }
    setErro(mensagemDeErro(r.codigo, r.detalhes));
  }

  async function cadastrar() {
    const r = await chamarApi<Cadastro>("v1/admin/auth/mfa/enroll", {});
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    setCadastro(r.dados);
    setEtapa("CADASTRAR_AUTENTICADOR");
  }

  async function confirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(codigo)) return setErro("Digite os 6 números do autenticador.");
    setOcupado(true);
    setErro(null);
    const r = await chamarApi("v1/admin/auth/mfa/verify", { codigo, ...(cadastro ? { factorId: cadastro.factorId } : {}) });
    setOcupado(false);
    if (r.ok) return router.replace(destino());
    if (r.codigo === "UNAUTHORIZED") {
      setEtapa("SENHA");
      return setErro("A sessão venceu. Entre de novo com e-mail e senha.");
    }
    setErro(r.codigo === "MFA_INVALID" ? "Código do autenticador errado ou vencido. Use o código que aparece agora no app." : mensagemDeErro(r.codigo, r.detalhes));
  }

  return (
    <section className="mx-auto grid w-full max-w-md gap-5 px-4 pb-12 pt-10">
      <h1 className="tc-titulo m-0 text-[40px]">
        {etapa === "SENHA" ? <>Entrar no <em>painel.</em></> : etapa === "CODIGO" ? <>Código do <em>autenticador.</em></> : <>Cadastre o <em>autenticador.</em></>}
      </h1>
      {erro && <div role="alert"><Aviso tipo="atencao" titulo={erro} /></div>}

      {etapa === "SENHA" && (
        <form onSubmit={entrar} noValidate className="grid gap-4">
          <Campo name="email" rotulo="E-mail" type="email" autoComplete="username" required />
          <Campo name="senha" rotulo="Senha" type="password" autoComplete="current-password" required />
          {pedeDesafio && <Turnstile chave={CHAVE_TURNSTILE} aoResolver={setToken} versao={versao} />}
          <Botao type="submit" cheio carregando={ocupado}>Entrar</Botao>
        </form>
      )}

      {etapa !== "SENHA" && (
        <form onSubmit={confirmar} noValidate className="grid gap-4">
          {etapa === "CADASTRAR_AUTENTICADOR" && cadastro && (
            <div className="grid justify-items-center gap-3 rounded-cartao border-2 border-tinta bg-branco p-4">
              <p className="m-0 text-[15px]">
                O painel pede um autenticador (D12). Abra o Google Authenticator, o 1Password ou outro app de código e leia o QR code.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR em data: vindo do Supabase Auth */}
              <img src={cadastro.qrCode} alt="QR code para cadastrar o autenticador" width={200} height={200} className="bg-white p-2" />
              <p className="m-0 text-sm text-tinta-suave">Sem câmera? Digite esta chave no app: <code className="select-all break-all font-mono">{cadastro.segredo}</code></p>
            </div>
          )}
          <Campo name="codigo" rotulo="Código de 6 números" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000"
            className="font-display text-2xl tracking-[0.3em]" ajuda="O código muda a cada 30 segundos." />
          <Botao type="submit" cheio carregando={ocupado}>{etapa === "CADASTRAR_AUTENTICADOR" ? "Confirmar e entrar" : "Entrar"}</Botao>
        </form>
      )}
    </section>
  );
}
