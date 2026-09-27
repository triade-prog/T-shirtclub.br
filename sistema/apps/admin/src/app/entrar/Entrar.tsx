"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { qrComoDataUrl, textoErro } from "@tshirtclub/domain";
import Image from "next/image";
import { Turnstile } from "@tshirtclub/ui";
import { Aviso, Botao, Campo, CampoCodigo, Seta } from "../_painel/ui";
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

  const senha = etapa === "SENHA";
  return (
    <main className="auth">
      <section className="auth-brand" style={senha ? undefined : { background: "var(--green-soft)" }} aria-hidden="true">
        <div className="auth-logo"><Image src="/marca/logo.webp" alt="" width={190} height={130} priority /></div>
        <div className="auth-message">
          <div className="starbig" style={senha ? undefined : { background: "var(--citron)" }} />
          {senha
            ? <p className="display h2">Tudo do <em>Club.</em><br />num só lugar.</p>
            : <p className="display h2">Mais uma<br /><em style={{ color: "var(--green)" }}>confirmação.</em></p>}
          <p>{senha ? "Reservas, pagamentos, cancelamentos e entregas com a mesma personalidade visual da T-shirt Club." : "Uma etapa curta para proteger o acesso à operação da loja."}</p>
        </div>
        <div className="auth-foot">{senha ? "Painel interno · acesso protegido" : "Autenticação em duas etapas"}</div>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <span className="club-tag tag"><span className="dot" />{senha ? "PAINEL DA LOJA" : "SEGURANÇA"}</span>
          <h1 className="display">
            {senha ? <>Entrar no <em style={{ color: "var(--pink-dark)" }}>painel.</em></>
              : etapa === "CODIGO" ? <>Código do <em style={{ color: "var(--pink-dark)" }}>autenticador.</em></>
              : <>Cadastre o <em style={{ color: "var(--pink-dark)" }}>autenticador.</em></>}
          </h1>
          <p className="intro">
            {senha ? "Use seu acesso administrativo para continuar."
              : etapa === "CODIGO" ? "Digite os 6 números exibidos no seu aplicativo autenticador."
              : "O painel pede um autenticador (D12). Abra o Google Authenticator, o 1Password ou outro app de código e leia o QR code."}
          </p>
          {erro && <div style={{ marginBottom: 15 }}><Aviso tipo="error" titulo={erro} /></div>}

          {senha ? (
            <form className="auth-form" onSubmit={entrar} noValidate>
              <Campo name="email" rotulo="E-mail" type="email" autoComplete="username" placeholder="voce@tshirtclub.br" required />
              <Campo name="senha" rotulo="Senha" type="password" autoComplete="current-password" placeholder="••••••••" required />
              {pedeDesafio && <Turnstile chave={CHAVE_TURNSTILE} aoResolver={setToken} versao={versao} />}
              <Botao type="submit" carregando={ocupado}>Entrar <Seta /></Botao>
            </form>
          ) : (
            <form className="auth-form" onSubmit={confirmar} noValidate>
              {etapa === "CADASTRAR_AUTENTICADOR" && cadastro && (
                <div className="qr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR em data: vindo do Supabase Auth */}
                  <img src={qrComoDataUrl(cadastro.qrCode)} alt="QR code para cadastrar o autenticador" width={200} height={200} />
                  <p className="field-help">Sem câmera? Digite esta chave no app: <code>{cadastro.segredo}</code></p>
                </div>
              )}
              <CampoCodigo rotulo="Código de 6 números" className="otp" ajuda="O código muda a cada 30 segundos." />
              <Botao type="submit" carregando={ocupado}>{etapa === "CADASTRAR_AUTENTICADOR" ? "Confirmar e entrar" : "Entrar"} <Seta /></Botao>
              <Botao variante="ghost" onClick={() => { setEtapa("SENHA"); setCadastro(null); setErro(null); }}>Voltar</Botao>
            </form>
          )}
          {senha && <p className="auth-help">Acesso restrito à equipe T-shirt Club.br.</p>}
        </div>
      </section>
    </main>
  );
}
