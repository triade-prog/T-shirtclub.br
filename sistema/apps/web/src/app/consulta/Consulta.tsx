"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { formatarReais, textoErro } from "@tshirtclub/domain";
import { Aviso, Botao, Campo, Selo, Sobretitulo, cx } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";
import { guardar } from "@/lib/navegador";
import { CodigoWhatsApp, type ConsultaCriada } from "../_verificacao/CodigoWhatsApp";
import { CHAVE_TURNSTILE, Turnstile } from "../reserva/Turnstile";

// Com a sessão do telefone (depois de um código), a lista aparece direto; sem ela, a cliente
// informa o WhatsApp, passa pelo Turnstile e confirma com o código. O site nunca lista
// reservas só com o número informado (G13).

interface Resumo {
  id: string;
  numero: number;
  status: "RESERVADO" | "PAGAMENTO_CONFIRMADO" | "ENTREGUE" | "EXPIRADO";
  motivoEncerramento?: "PRAZO_ESGOTADO" | "CANCELAMENTO_APROVADO";
  totalCentavos: number;
  pecas?: number;
  expiraEm?: string;
  substatus?: string;
  modalidade?: string;
  cancelamentoPendente?: boolean;
}

const ROTULO: Record<Resumo["status"], string> = {
  RESERVADO: "Reservado",
  PAGAMENTO_CONFIRMADO: "Pago",
  ENTREGUE: "Entregue",
  EXPIRADO: "Expirado",
};

const SUBSTATUS: Record<string, string> = {
  AGUARDANDO_MODALIDADE: "Escolher a entrega",
  AGUARDANDO_CALCULO_FRETE: "Loja calculando o frete",
  AGUARDANDO_PAGAMENTO_FRETE: "Frete para pagar",
  FRETE_VENCIDO: "Prazo do frete vencido",
  EM_PREPARACAO: "Em preparação",
  PRONTO_PARA_RETIRADA: "Pronto para retirada",
  SAIU_PARA_ENTREGA: "Saiu para entrega",
  ENVIADO: "Enviado",
};

function acao(r: Resumo): string {
  if (r.status === "RESERVADO") return r.expiraEm ? `Pague até ${horario(r.expiraEm)} · Pagar →` : "Pagar →";
  if (r.status === "PAGAMENTO_CONFIRMADO") return `${SUBSTATUS[r.substatus ?? "AGUARDANDO_MODALIDADE"] ?? "Pago"} · Ver pedido →`;
  if (r.status === "ENTREGUE") return "Concluído · Ver pedido →";
  return r.motivoEncerramento === "CANCELAMENTO_APROVADO" ? "Cancelamento aprovado" : "Prazo esgotado";
}

export function Consulta() {
  const [reservas, setReservas] = useState<Resumo[] | null>(null);
  const [precisaCodigo, setPrecisaCodigo] = useState(false);
  const [consulta, setConsulta] = useState<ConsultaCriada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [versaoDesafio, setVersaoDesafio] = useState(0);

  const listar = useCallback(async () => {
    const r = await chamarApi<{ reservas: Resumo[] }>("v1/me/reservations");
    if (r.ok) {
      r.dados.reservas.forEach((x) => guardar(`tc-reserva-${x.numero}`, x.id));
      setReservas(r.dados.reservas);
      setPrecisaCodigo(false);
    } else if (r.codigo === "UNAUTHORIZED" || r.codigo === "PHONE_VERIFICATION_REQUIRED") {
      setPrecisaCodigo(true);
    } else {
      setErro(mensagemDeErro(r.codigo, r.detalhes));
      setPrecisaCodigo(true);
    }
  }, []);

  useEffect(() => { void (async () => { await listar(); })(); }, [listar]);

  async function pedirCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const telefone = String(new FormData(e.currentTarget).get("telefone") ?? "").trim();
    if (telefone.replace(/\D/g, "").length < 10) return setErroTelefone(textoErro("PHONE_INVALID").mensagem);
    if (CHAVE_TURNSTILE && !token) return setErro(textoErro("TURNSTILE_REQUIRED").mensagem);
    setEnviando(true);
    setErro(null);
    setErroTelefone(undefined);
    const r = await chamarApi<ConsultaCriada>("v1/lookup-attempts", { motivo: "CONSULTA", telefone, turnstileToken: token ?? "sem-turnstile" });
    setEnviando(false);
    if (r.ok) return setConsulta(r.dados);
    setToken(null);
    setVersaoDesafio((v) => v + 1);
    const texto = mensagemDeErro(r.codigo, r.detalhes);
    if (["PHONE_INVALID", "NO_WHATSAPP", "PHONE_BLOCKED"].includes(r.codigo)) setErroTelefone(texto);
    else setErro(texto);
  }

  return (
    <section className="grid items-start gap-8 px-3.5 pb-12 pt-8 md:grid-cols-[1.2fr_0.8fr] md:gap-12 md:px-5 md:pt-12">
      <div className="grid gap-5">
        <div>
          <Sobretitulo>Minhas reservas</Sobretitulo>
          <h1 className="m-0 mt-2 font-editorial text-[clamp(36px,5vw,56px)] font-bold leading-[0.95] tracking-[-0.05em]">
            Consultar suas <em className="text-rosa-press">reservas.</em>
          </h1>
        </div>

        {reservas ? (
          <Lista reservas={reservas} />
        ) : !precisaCodigo ? (
          <p role="status" className="m-0 text-tinta-suave">Procurando suas reservas…</p>
        ) : (
          <div className="grid gap-4 rounded-[22px] border-2 border-tinta bg-papel p-5 shadow-[6px_6px_0_var(--tc-citrino)]">
            {erro && <div role="alert"><Aviso tipo="atencao" titulo={erro} /></div>}
            {consulta ? (
              <CodigoWhatsApp consulta={consulta} rotuloConfirmar="Ver minhas reservas" aoVerificar={() => void listar()} />
            ) : (
              <form onSubmit={pedirCodigo} noValidate className="grid gap-4">
                <p className="m-0 text-[15px]">Informe seu WhatsApp. Ele abre com a mensagem pronta para a loja: é só enviar, e o código chega na hora.</p>
                <Campo name="telefone" rotulo="Seu WhatsApp" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" maxLength={20} erro={erroTelefone} />
                <Turnstile aoResolver={setToken} versao={versaoDesafio} />
                <Botao type="submit" cheio carregando={enviando} icone={<MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />}>
                  Receber código no WhatsApp
                </Botao>
              </form>
            )}
            <p className="m-0 text-xs text-tinta-suave">Por segurança, o site só mostra as reservas depois do código enviado ao seu número.</p>
          </div>
        )}
      </div>

      <aside aria-labelledby="pelo-whatsapp" className="grid gap-3 rounded-[22px] border-2 border-tinta bg-rosa-bruma p-5">
        <h2 id="pelo-whatsapp" className="m-0 font-editorial text-2xl font-bold tracking-[-0.035em]">Pelo WhatsApp</h2>
        <p className="m-0 text-[15px]">No WhatsApp da loja, envie <b>“Minha reserva”</b> a qualquer momento. A resposta vem na conversa, sem código, porque ela já sabe o seu número.</p>
        <p className="m-0 text-sm text-tinta-suave">O link da reserva também chega na mensagem de confirmação.</p>
      </aside>
    </section>
  );
}

function Lista({ reservas }: { reservas: Resumo[] }) {
  if (reservas.length === 0) {
    return (
      <div className="grid justify-items-start gap-3">
        <Aviso tipo="info" titulo="Nenhuma reserva neste número ainda." />
        <Link href="/" className="font-bold underline decoration-rosa decoration-2 underline-offset-2">Ver as estampas</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <p className="m-0 text-sm text-tinta-suave" role="status">WhatsApp confirmado. Estas são as reservas do seu número.</p>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {reservas.map((r) => {
          const encerrada = r.status === "EXPIRADO";
          const conteudo = (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 font-display text-2xl font-extrabold">#{r.numero}</h2>
                <Selo fundo={r.status === "RESERVADO" ? "citrino" : r.status === "EXPIRADO" ? "papel" : "rosa"} brilho={false}>{ROTULO[r.status]}</Selo>
              </div>
              <p className="m-0 text-sm text-tinta-suave">
                {r.pecas ? `${r.pecas} ${r.pecas === 1 ? "T-shirt" : "T-shirts"} · ` : ""}{formatarReais(r.totalCentavos)}
                {r.cancelamentoPendente ? " · cancelamento pedido" : ""}
              </p>
              <p className={cx("m-0 text-sm font-bold", encerrada && "font-normal text-tinta-suave")}>{acao(r)}</p>
            </>
          );
          return (
            <li key={r.id}>
              <Link href={`/reserva/${r.numero}`} className={cx(
                "grid gap-2 rounded-[18px] border-2 border-tinta p-4 shadow-adesivo-sm",
                encerrada ? "bg-algodao" : "bg-papel hover:bg-rosa-bruma",
              )}>
                {conteudo}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
