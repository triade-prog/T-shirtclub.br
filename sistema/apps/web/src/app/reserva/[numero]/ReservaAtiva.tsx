"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { Aviso, Botao, Selo, Sobretitulo, cx } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";
import { calcularRelogio, formatarTempo } from "@/lib/reserva";
import { BlocoPix } from "./BlocoPix";
import { Entrega } from "./Entrega";
import { ENTREGA, guardado, guardar, useRepetir, type Reserva } from "./util";

const ESPERA_RESERVA_MS = 5000;

export function ReservaAtiva({ numero, numeroLoja }: { numero: number; numeroLoja: string }) {
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [problema, setProblema] = useState<"SEM_SESSAO" | "NAO_ACHOU" | "FORA_DO_AR" | null>(null);
  const [desvio, setDesvio] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const idRef = useRef<string | null>(null);

  const lerReserva = useCallback(async () => {
    let id = idRef.current ?? guardado(`tc-reserva-${numero}`);
    if (!id) {
      const lista = await chamarApi<{ reservas: { id: string; numero: number }[] }>("v1/me/reservations");
      if (!lista.ok) return setProblema(lista.codigo === "UNAUTHORIZED" || lista.codigo === "PHONE_VERIFICATION_REQUIRED" ? "SEM_SESSAO" : "FORA_DO_AR");
      id = lista.dados.reservas.find((r) => r.numero === numero)?.id ?? null;
      if (!id) return setProblema("NAO_ACHOU");
      guardar(`tc-reserva-${numero}`, id);
    }
    idRef.current = id;
    const r = await chamarApi<Reserva>(`v1/reservations/${id}`);
    if (!r.ok) return setProblema(r.codigo === "UNAUTHORIZED" ? "SEM_SESSAO" : r.codigo === "NOT_FOUND" ? "NAO_ACHOU" : "FORA_DO_AR");
    setProblema(null);
    setReserva(r.dados);
    setDesvio(Date.parse(r.dados.agora) - Date.now());
  }, [numero]);

  // Primeira leitura (depois do await, como as consultas seguintes).
  useEffect(() => { void (async () => { await lerReserva(); })(); }, [lerReserva]);

  const ativa = reserva?.status === "RESERVADO";
  // Pago: a entrega muda pelo painel (frete calculado, pronto, enviado); confere com calma.
  const pago = reserva?.status === "PAGAMENTO_CONFIRMADO";
  useRepetir(() => void lerReserva(), ativa ? ESPERA_RESERVA_MS : 20_000, ativa || pago);
  useRepetir(() => setAgora(Date.now()), 1000, ativa);

  if (problema) return <Problema tipo={problema} />;
  if (!reserva) {
    return (
      <Moldura numero={numero}>
        <p role="status" className="m-0 text-tinta-suave">Abrindo sua reserva…</p>
      </Moldura>
    );
  }

  if (reserva.status === "EXPIRADO") return <Expirada reserva={reserva} />;
  if (reserva.limitada) return <Limitada reserva={reserva} />;
  if (reserva.status === "PAGAMENTO_CONFIRMADO" || reserva.status === "ENTREGUE") return <Entrega reserva={reserva} numeroLoja={numeroLoja} aoMudar={() => void lerReserva()} />;

  const relogio = calcularRelogio(reserva.criadaEm, reserva.expiraEm, reserva.toleranciaAte, agora + desvio);

  return (
    <Moldura numero={numero} selo="Reservado">
      <Cronometro relogio={relogio} expiraEm={reserva.expiraEm} />

      {relogio.fase === "PRAZO"
        ? <Aviso tipo="marca" titulo="Suas peças estão guardadas para você.">
            <p className="m-0 mt-1 text-sm">Quando faltarem 5 minutos, você recebe um lembrete no WhatsApp.</p>
          </Aviso>
        : <Aviso tipo="atencao" titulo="O prazo para pagar acabou. Estamos conferindo seu pagamento.">
            <p className="m-0 mt-1 text-sm">Se você já pagou, espere nesta tela: a confirmação pode levar alguns minutos. Não dá para gerar um PIX novo.</p>
          </Aviso>}

      {/* PIX (tela 7): "Copiar código PIX" é a ação principal no celular */}
      <BlocoPix
        reservaId={reserva.id}
        finalidade="PRODUTOS"
        titulo="Pagar com PIX"
        valorCentavos={reserva.totalCentavos}
        podeGerar={relogio.fase === "PRAZO"}
        aoAprovar={() => void lerReserva()}
      />

      <Pedido reserva={reserva} />
      <Cancelamento reserva={reserva} aoPedir={lerReserva} />
    </Moldura>
  );
}

function Moldura({ numero, selo, children }: { numero: number; selo?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto grid w-full max-w-xl gap-5 px-3.5 pb-12 pt-8 md:pt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Sobretitulo>Passo 3 de 3</Sobretitulo>
          <h1 className="m-0 mt-2 font-editorial text-[clamp(34px,5vw,48px)] font-bold leading-[0.95] tracking-[-0.05em]">Reserva #{numero}</h1>
        </div>
        {selo && <Selo fundo="citrino">{selo}</Selo>}
      </div>
      {children}
    </section>
  );
}

function Cronometro({ relogio, expiraEm, terminou }: { relogio: ReturnType<typeof calcularRelogio>; expiraEm: string; terminou?: boolean }) {
  const fim = terminou || relogio.fase !== "PRAZO";
  // Leitor de tela (F4.3): o texto só muda aos 5 minutos e no fim, então só fala nessas horas.
  const reta = relogio.restanteMs <= 5 * 60_000;
  return (
    <div className="grid gap-2 rounded-[18px] border-2 border-tinta bg-citrino p-4 text-no-citrino shadow-adesivo-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("font-display text-[44px] font-extrabold leading-none tabular-nums", fim && "text-tinta-suave")} aria-hidden="true">
          {fim ? "00:00" : formatarTempo(relogio.restanteMs)}
        </span>
        <span className="text-sm font-semibold">{fim ? `terminou às ${horario(expiraEm)}` : `guardado até ${horario(expiraEm)}`}</span>
      </div>
      <p className="sr-only" role="timer" aria-live="polite">
        {fim ? "O prazo para pagar terminou." : reta ? `Faltam menos de 5 minutos para pagar, até ${horario(expiraEm)}.` : `Você tem até ${horario(expiraEm)} para pagar.`}
      </p>
      {/* A costura da V4: some da direita para a esquerda */}
      <div className="h-2.5 overflow-hidden rounded-pilula border-[1.5px] border-tinta bg-papel">
        <i className="block h-full bg-rosa transition-[width] duration-1000 ease-linear" style={{ width: `${Math.round(relogio.fracao * 100)}%` }} />
      </div>
    </div>
  );
}

function Pedido({ reserva }: { reserva: Reserva }) {
  return (
    <section aria-labelledby="titulo-pedido" className="grid gap-3 rounded-[22px] border-2 border-tinta bg-rosa-bruma p-5">
      <h2 id="titulo-pedido" className="m-0 font-editorial text-xl font-bold tracking-[-0.035em]">Peças reservadas</h2>
      <ul className="m-0 grid list-none gap-2 p-0 text-sm">
        {(reserva.itens ?? []).map((i) => (
          <li key={i.produtoId} className="flex justify-between gap-3"><span>{i.nome} × {i.qtd}</span><span>{formatarReais(i.totalCentavos)}</span></li>
        ))}
      </ul>
      <dl className="m-0 border-t border-tinta/20 pt-2 text-sm">
        <div className="flex justify-between py-0.5"><dt>Subtotal</dt><dd className="m-0">{formatarReais(reserva.subtotalCentavos)}</dd></div>
        {reserva.descontoCentavos > 0 && (
          <div className="flex justify-between py-0.5 font-bold text-verde-escuro">
            <dt>{reserva.descontos?.[0]?.rotulo ?? "Desconto"}</dt><dd className="m-0">− {formatarReais(reserva.descontoCentavos)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t-2 border-tinta pt-2 font-bold"><dt>Total</dt><dd className="m-0">{formatarReais(reserva.totalCentavos)}</dd></div>
        {reserva.entrega && <div className="flex justify-between pt-2 text-tinta-suave"><dt>Entrega pretendida</dt><dd className="m-0">{ENTREGA[reserva.entrega]}</dd></div>}
      </dl>
      <p className="m-0 text-xs text-tinta-suave">Preço e desconto ficaram fixos quando a reserva foi criada.</p>
    </section>
  );
}

function Cancelamento({ reserva, aoPedir }: { reserva: Reserva; aoPedir: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (reserva.cancelamento?.status === "PENDENTE") {
    return <Aviso tipo="info" titulo="Pedido de cancelamento enviado. A loja vai responder; enquanto isso, o prazo continua correndo." />;
  }
  if (reserva.cancelamento?.status === "RECUSADA") {
    return <Aviso tipo="info" titulo="A loja não aprovou o cancelamento. A reserva continua valendo até o fim do prazo." />;
  }

  async function pedir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const observacao = String(new FormData(e.currentTarget).get("observacao") ?? "").trim();
    setEnviando(true);
    const r = await chamarApi(`v1/reservations/${reserva.id}/cancellation-request`, observacao ? { observacao } : {});
    setEnviando(false);
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    await aoPedir();
  }

  return (
    <div className="grid gap-2">
      {!aberto ? (
        <Botao variante="link" className="justify-self-start" onClick={() => setAberto(true)}>Pedir cancelamento</Botao>
      ) : (
        <form onSubmit={pedir} className="grid gap-3 rounded-[18px] border-2 border-tinta p-4">
          <label htmlFor="observacao" className="text-[15px] font-semibold">Quer contar o motivo? (opcional)</label>
          <textarea id="observacao" name="observacao" maxLength={500} rows={3} className="w-full rounded-campo border-2 border-tinta bg-branco p-3 text-base" />
          {erro && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" variante="contorno" carregando={enviando}>Enviar pedido</Botao>
            <Botao variante="link" onClick={() => setAberto(false)}>Voltar</Botao>
          </div>
        </form>
      )}
      <p className="m-0 text-xs text-tinta-suave">Pedir cancelamento não pausa o prazo. A loja aprova ou recusa.</p>
    </div>
  );
}

function Limitada({ reserva }: { reserva: Reserva }) {
  const texto = reserva.status === "ENTREGUE" ? "Este pedido foi entregue." : "Esta reserva foi encerrada.";
  return (
    <Moldura numero={reserva.numero} selo={reserva.status === "ENTREGUE" ? "Entregue" : "Encerrada"}>
      <p className="m-0 text-[15px]">{texto} Os detalhes ficam guardados por 30 dias pelo link; depois, só com o código no WhatsApp.</p>
      <Link href="/" className="font-bold underline decoration-rosa decoration-2 underline-offset-2">Voltar para a loja</Link>
    </Moldura>
  );
}

function Expirada({ reserva }: { reserva: Reserva }) {
  const cancelada = reserva.motivoEncerramento === "CANCELAMENTO_APROVADO";
  const fim = reserva.expiradaEm ?? reserva.expiraEm;
  return (
    <Moldura numero={reserva.numero} selo="Expirado">
      <Cronometro relogio={{ fase: "FIM", restanteMs: 0, fracao: 0 }} expiraEm={fim} terminou />
      <p className="m-0 text-[15px]">
        {cancelada ? "Seu pedido de cancelamento foi aprovado e as peças voltaram para a loja." : "O pagamento não chegou a tempo e as peças voltaram para a loja."}{" "}
        <b>Nada foi cobrado.</b>
      </p>
      <p className="m-0 text-sm text-tinta-suave">Se ainda quiser, é só reservar de novo. O estoque pode ter mudado.</p>
      <Link href="/" className="inline-flex min-h-13 items-center justify-center rounded-pilula border-2 border-tinta px-6 text-[15px] font-bold shadow-adesivo">
        Voltar para a loja
      </Link>
    </Moldura>
  );
}

function Problema({ tipo }: { tipo: "SEM_SESSAO" | "NAO_ACHOU" | "FORA_DO_AR" }) {
  const textos = {
    SEM_SESSAO: { titulo: "Para ver esta reserva, abra pelo link que enviamos no seu WhatsApp.", texto: "Por segurança, a reserva só abre no aparelho em que ela foi feita ou pelo link dela." },
    NAO_ACHOU: { titulo: "Não encontramos esta reserva no seu número.", texto: "Confira o número da reserva na mensagem do WhatsApp." },
    FORA_DO_AR: { titulo: "Não conseguimos abrir sua reserva agora.", texto: "Tente de novo em instantes. Sua reserva continua valendo, com o mesmo prazo." },
  }[tipo];
  return (
    <section className="mx-auto grid w-full max-w-xl gap-4 px-3.5 pb-12 pt-8 md:pt-12">
      <h1 className="m-0 font-editorial text-[clamp(34px,5vw,48px)] font-bold leading-[0.95] tracking-[-0.05em]">Sua reserva</h1>
      <Aviso tipo="atencao" titulo={textos.titulo}><p className="m-0 mt-1 text-sm">{textos.texto}</p></Aviso>
      <Link href="/" className="font-bold underline decoration-rosa decoration-2 underline-offset-2">Voltar para a loja</Link>
    </section>
  );
}
