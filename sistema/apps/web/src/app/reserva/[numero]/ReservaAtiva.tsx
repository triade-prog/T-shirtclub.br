"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatarReais, type CodigoErro } from "@tshirtclub/domain";
import { Aviso, Botao, Selo, Sobretitulo, cx } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";
import { calcularRelogio, formatarTempo } from "@/lib/reserva";

type StatusReserva = "RESERVADO" | "PAGAMENTO_CONFIRMADO" | "ENTREGUE" | "EXPIRADO";
interface Reserva {
  id: string;
  numero: number;
  status: StatusReserva;
  motivoEncerramento?: "PRAZO_ESGOTADO" | "CANCELAMENTO_APROVADO" | null;
  entrega?: "RETIRADA" | "MOTOBOY" | "ENVIO";
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  criadaEm: string;
  expiraEm: string;
  toleranciaAte: string | null;
  expiradaEm?: string | null;
  itens?: { produtoId: string; nome: string; qtd: number; totalCentavos: number }[];
  descontos?: { tipo: string; valorCentavos: number; rotulo: string | null }[];
  cancelamento?: { status: "PENDENTE" | "APROVADA" | "RECUSADA" | "PREJUDICADA" } | null;
  agora: string;
  limitada?: boolean;
}
interface Pagamento {
  id: string;
  forma: "PIX" | "CARTAO";
  status: "CRIADO" | "PENDENTE" | "APROVADO" | "RECUSADO" | "CANCELADO" | "FALHOU" | "EM_ANALISE" | "ESTORNADO";
  valorCentavos: number;
  pix?: { copiaECola: string; qrBase64?: string | null; expiraEm?: string | null };
}

const ENTREGA = { RETIRADA: "Retirar na loja", MOTOBOY: "Entrega local (motoboy)", ENVIO: "Envio para outra cidade" } as const;
const ESPERA_RESERVA_MS = 5000;
const ESPERA_PAGAMENTO_MS = 3000; // seção 08: a tela consulta a cada 3 s com o pagamento pendente

function guardado(chave: string): string | null {
  try { return sessionStorage.getItem(chave); } catch { return null; }
}
function guardar(chave: string, valor: string) {
  try { sessionStorage.setItem(chave, valor); } catch { /* sem armazenamento: a tela refaz a busca */ }
}

/** Repete `fn` a cada `ms` com a aba visível (e na volta para a aba). */
function useRepetir(fn: () => void, ms: number, ligado: boolean) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    if (!ligado) return;
    const passo = () => { if (document.visibilityState === "visible") ref.current(); };
    const id = setInterval(passo, ms);
    document.addEventListener("visibilitychange", passo);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", passo); };
  }, [ms, ligado]);
}

export function ReservaAtiva({ numero }: { numero: number }) {
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const [problema, setProblema] = useState<"SEM_SESSAO" | "NAO_ACHOU" | "FORA_DO_AR" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
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

  const lerPagamento = useCallback(async (pid: string) => {
    const id = idRef.current;
    if (!id) return;
    const r = await chamarApi<Pagamento>(`v1/reservations/${id}/payments/${pid}`);
    if (r.ok) {
      setPagamento(r.dados);
      if (r.dados.status === "APROVADO") void lerReserva();
    }
  }, [lerReserva]);

  // Primeira leitura: a reserva e, se já havia um PIX gerado neste navegador, ele.
  useEffect(() => {
    void (async () => {
      await lerReserva();
      const id = idRef.current;
      const pid = id && guardado(`tc-pix-${id}`);
      if (pid) await lerPagamento(pid);
    })();
  }, [lerReserva, lerPagamento]);

  const ativa = reserva?.status === "RESERVADO";
  const pendente = pagamento?.status === "CRIADO" || pagamento?.status === "PENDENTE";
  useRepetir(() => void lerReserva(), ESPERA_RESERVA_MS, ativa);
  useRepetir(() => { if (pagamento) void lerPagamento(pagamento.id); }, ESPERA_PAGAMENTO_MS, ativa && pendente);
  useRepetir(() => setAgora(Date.now()), 1000, ativa);

  async function gerarPix() {
    const id = idRef.current;
    if (!id) return;
    setGerando(true);
    setErro(null);
    const r = await chamarApi<{ pagamento: Pagamento }>(`v1/reservations/${id}/payments`, { forma: "PIX" }, "POST", { "idempotency-key": crypto.randomUUID() });
    setGerando(false);
    if (r.ok) {
      setPagamento(r.dados.pagamento);
      guardar(`tc-pix-${id}`, r.dados.pagamento.id);
      return;
    }
    // Já havia um PIX em andamento (outra aba, recarregou): mostra o mesmo.
    if (r.codigo === "PAYMENT_IN_PROGRESS" && typeof r.detalhes.pagamentoId === "string") {
      guardar(`tc-pix-${id}`, r.detalhes.pagamentoId);
      return void lerPagamento(r.detalhes.pagamentoId);
    }
    setErro(mensagemDeErro(r.codigo as CodigoErro, r.detalhes));
    void lerReserva();
  }

  async function copiar() {
    if (!pagamento?.pix) return;
    try {
      await navigator.clipboard.writeText(pagamento.pix.copiaECola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 4000);
    } catch {
      // Sem permissão da área de transferência: seleciona o código para copiar à mão.
      const el = document.getElementById("codigo-pix");
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  }

  if (problema) return <Problema tipo={problema} />;
  if (!reserva) {
    return (
      <Moldura numero={numero}>
        <p role="status" className="m-0 text-tinta-suave">Abrindo sua reserva…</p>
      </Moldura>
    );
  }

  if (reserva.status === "EXPIRADO") return <Expirada reserva={reserva} />;
  if (reserva.status === "PAGAMENTO_CONFIRMADO" || reserva.status === "ENTREGUE") return <Paga reserva={reserva} forma={pagamento?.forma} />;

  const relogio = calcularRelogio(reserva.criadaEm, reserva.expiraEm, reserva.toleranciaAte, agora + desvio);
  const recusado = pagamento && ["RECUSADO", "CANCELADO", "FALHOU"].includes(pagamento.status);

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

      {erro && <div role="alert"><Aviso tipo="erro" titulo={erro} /></div>}

      {/* PIX (tela 7): "Copiar código PIX" é a ação principal no celular */}
      <section aria-labelledby="titulo-pix" className="grid gap-4 rounded-[22px] border-2 border-tinta bg-papel p-5 shadow-[6px_6px_0_var(--tc-citrino)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-pix" className="m-0 font-editorial text-2xl font-bold tracking-[-0.035em]">Pagar com PIX</h2>
          <p className="m-0 text-sm">Total <b className="font-display text-2xl font-extrabold">{formatarReais(reserva.totalCentavos)}</b></p>
        </div>

        {pagamento?.pix && !recusado ? (
          <>
            <Botao cheio onClick={copiar} icone={copiado ? <Check aria-hidden="true" className="size-5" /> : <Copy aria-hidden="true" className="size-5" strokeWidth={1.8} />}>
              {copiado ? "Código copiado" : "Copiar código PIX"}
            </Botao>
            <p className="sr-only" role="status">{copiado ? "Código PIX copiado." : ""}</p>
            <ol className="m-0 grid gap-1.5 pl-5 text-[15px]">
              <li>Abra o app do seu banco.</li>
              <li>Escolha <b>Pix › Pix copia e cola</b>.</li>
              <li>Cole o código e confirme. Esta tela atualiza sozinha.</li>
            </ol>
            <details className="rounded-campo border border-linha px-3.5 py-2.5">
              <summary className="cursor-pointer text-sm font-semibold">Está no computador? Mostrar o QR code</summary>
              <div className="grid justify-items-center gap-3 pt-3">
                {pagamento.pix.qrBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem em data: vinda do Mercado Pago
                  <img src={`data:image/png;base64,${pagamento.pix.qrBase64}`} alt="QR code do PIX desta reserva" width={220} height={220} className="rounded-campo border-2 border-tinta" />
                )}
                <p id="codigo-pix" className="m-0 w-full break-all rounded-campo bg-algodao p-3 font-mono text-xs">{pagamento.pix.copiaECola}</p>
              </div>
            </details>
            <p className="m-0 text-sm text-tinta-suave" role="status">
              {pagamento.status === "EM_ANALISE" ? "Seu pagamento está em análise com a loja." : "Esperando o pagamento…"}
            </p>
          </>
        ) : (
          <>
            {recusado && <Aviso tipo="atencao" titulo="Este PIX não foi concluído. Gere outro código para pagar." />}
            <Botao cheio carregando={gerando} disabled={relogio.fase !== "PRAZO"} onClick={gerarPix}>Gerar código PIX</Botao>
            <p className="m-0 text-xs text-tinta-suave">A forma escolhida na primeira cobrança fica fixa para esta reserva.</p>
          </>
        )}
      </section>

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

function Paga({ reserva, forma }: { reserva: Reserva; forma?: "PIX" | "CARTAO" }) {
  const entregue = reserva.status === "ENTREGUE";
  const passos = [
    { texto: "Pago", estado: "feito" },
    { texto: "Escolher a entrega", estado: entregue ? "feito" : "agora" },
    { texto: "Em preparação", estado: entregue ? "feito" : "depois" },
    { texto: "Entregue", estado: entregue ? "feito" : "depois" },
  ] as const;
  return (
    <section className="mx-auto grid w-full max-w-xl gap-5 px-3.5 pb-12 pt-8 md:pt-12">
      <span className="-rotate-2 justify-self-start rounded-selo border-2 border-tinta bg-verde-broto px-3 py-1.5 font-display text-lg font-extrabold text-verde-escuro shadow-adesivo-sm">
        {entregue ? "Entregue!" : "Pago!"}
      </span>
      <h1 className="m-0 font-display text-[34px] font-extrabold leading-[0.95] tracking-[-0.04em]">Suas peças são suas.</h1>
      <p className="m-0 text-tinta-suave">
        Pedido #{reserva.numero} · {formatarReais(reserva.totalCentavos)}{forma ? ` no ${forma === "PIX" ? "PIX" : "cartão"}` : ""}.
        {!entregue && " Agora falta só escolher como receber."}
      </p>
      <ol className="m-0 grid list-none gap-3 p-0">
        {passos.map((p, i) => (
          <li key={p.texto} className="flex items-center gap-3" aria-current={p.estado === "agora" ? "step" : undefined}>
            <span aria-hidden="true" className={cx(
              "grid size-9 place-items-center rounded-full border-2 border-tinta font-display text-sm font-extrabold",
              p.estado === "feito" ? "bg-rosa text-no-rosa" : p.estado === "agora" ? "bg-citrino text-no-citrino" : "bg-papel text-tinta-suave",
            )}>{p.estado === "feito" ? "✓" : i + 1}</span>
            <span className={cx(p.estado === "agora" && "font-bold", p.estado === "depois" && "text-tinta-suave")}>
              {p.texto}<span className="sr-only">{p.estado === "feito" ? ": feito" : p.estado === "agora" ? ": agora" : ""}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
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
