"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { horario } from "@/lib/api";
import { Alertas, AvisoWhatsApp, type Alerta } from "../_painel/Alertas";
import { Casca, Icone } from "../_painel/Casca";
import { Carregando } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useRepetir } from "../_painel/useRepetir";

// Operação (Kanban do dia, protótipo 09 da V4): as reservas pelo próximo passo, em 5
// colunas vindas do banco (admin_operation_board, 0350). Sem arrastar: pagamento,
// expiração, cancelamento e entrega têm regras próprias, e o botão do cartão leva à tela
// da ação válida para aquele estado.

type Coluna = "AGUARDANDO" | "ACAO" | "PAGO" | "ENTREGA" | "CONCLUIDO";
type Motivo = "CANCELAMENTO" | "PAGAMENTO_EM_ANALISE" | "CONTESTACAO" | "FRETE_VENCIDO";
type Entrega = "RETIRADA" | "MOTOBOY" | "ENVIO";

interface Cartao {
  id: string;
  numero: number;
  status: "RESERVADO" | "PAGAMENTO_CONFIRMADO" | "ENTREGUE" | "EXPIRADO";
  nome: string;
  telefone: string;
  totalCentavos: number;
  pecas?: number;
  expiraEm?: string;
  substatus?: string;
  entrega?: Entrega;
  club?: boolean;
  hoje?: boolean;
  motivos?: Motivo[];
  notaCancelamento?: string;
  freteAte?: string;
  pagaEm?: string;
  entregueEm?: string;
}

interface Quadro {
  agora: string;
  resumo: { ativas: number; precisamDeAcao: number; pagas: number; fretePendente: number };
  totais: Partial<Record<Coluna, number>>;
  colunas: Record<Coluna, Cartao[]>;
  whatsapp: { conectado: boolean };
}

const COLUNAS: { id: Coluna; kicker: string; titulo: string; nota: string }[] = [
  { id: "AGUARDANDO", kicker: "Etapa 01", titulo: "Aguardando pagamento", nota: "Reserva válida e estoque separado até o prazo." },
  { id: "ACAO", kicker: "Prioridade", titulo: "Precisa de ação", nota: "Pendências que dependem da equipe antes do fluxo continuar." },
  { id: "PAGO", kicker: "Etapa 02", titulo: "Pagamento confirmado", nota: "Pedido pago. Próximo passo: definir a entrega e o frete." },
  { id: "ENTREGA", kicker: "Etapa 03", titulo: "Preparação e entrega", nota: "Preparação, retirada, motoboy e postagem." },
  { id: "CONCLUIDO", kicker: "Final", titulo: "Concluídos", nota: "Entregues ou retirados hoje." },
];

type Filtro = "TODOS" | "ACAO" | "RETIRADA" | "ENTREGA" | "HOJE";
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "TODOS", texto: "Todos" },
  { id: "ACAO", texto: "Precisa de ação" },
  { id: "RETIRADA", texto: "Retirada" },
  { id: "ENTREGA", texto: "Motoboy / envio" },
  { id: "HOJE", texto: "Hoje" },
];

const MOTIVO: Record<Motivo, { texto: string; href: string }> = {
  CANCELAMENTO: { texto: "Cancelamento", href: "/cancelamentos" },
  PAGAMENTO_EM_ANALISE: { texto: "Pagamento em análise", href: "/pagamentos" },
  CONTESTACAO: { texto: "Contestação", href: "/contestacoes" },
  FRETE_VENCIDO: { texto: "Frete vencido", href: "/entregas?substatus=FRETE_VENCIDO" },
};

const ENTREGA: Record<Entrega, string> = { RETIRADA: "Retirada", MOTOBOY: "Motoboy", ENVIO: "Envio" };

/** O próximo passo de um pedido pago, em palavras da loja. */
const PASSO: Record<string, string> = {
  AGUARDANDO_MODALIDADE: "Cliente escolher a entrega",
  AGUARDANDO_CALCULO_FRETE: "Calcular frete",
  AGUARDANDO_PAGAMENTO_FRETE: "Cliente pagar o frete",
  EM_PREPARACAO: "Preparar o pedido",
  PRONTO_PARA_RETIRADA: "Aguardando a retirada",
  SAIU_PARA_ENTREGA: "Saiu para entrega",
  ENVIADO: "Enviado",
};

const precisaDeAcao = (c: Cartao, coluna: Coluna) => coluna === "ACAO" || c.substatus === "AGUARDANDO_CALCULO_FRETE";
const soDigitos = (t: string) => t.replace(/\D/g, "");

function passa(c: Cartao, coluna: Coluna, filtro: Filtro, busca: string): boolean {
  if (filtro === "ACAO" && !precisaDeAcao(c, coluna)) return false;
  if (filtro === "RETIRADA" && c.entrega !== "RETIRADA") return false;
  if (filtro === "ENTREGA" && c.entrega !== "MOTOBOY" && c.entrega !== "ENVIO") return false;
  if (filtro === "HOJE" && !c.hoje) return false;
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const digitos = soDigitos(q);
  return c.nome.toLowerCase().includes(q) || (digitos !== "" && (String(c.numero).includes(digitos) || soDigitos(c.telefone).includes(digitos)));
}

/**
 * Hora para os prazos: começa na do banco e anda com o relógio do navegador, corrigido pela
 * diferença entre os dois (um computador com a hora errada não adianta nem atrasa o prazo).
 */
function useRelogio(agoraDoBanco: string | undefined): number {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    if (!agoraDoBanco) return;
    const desvio = new Date(agoraDoBanco).getTime() - Date.now();
    const tique = () => setAgora(Date.now() + desvio);
    const t = setInterval(tique, 15_000);
    return () => clearInterval(t);
  }, [agoraDoBanco]);
  return agora ?? (agoraDoBanco ? new Date(agoraDoBanco).getTime() : 0);
}

export function Operacao() {
  const quadro = useDados<Quadro>("v1/admin/operacao");
  const alertas = useDados<Alerta[]>("v1/admin/alerts");
  useRepetir(() => { void quadro.recarregar(); void alertas.recarregar(); }, 30_000, true);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [busca, setBusca] = useState("");
  const agora = useRelogio(quadro.dados?.agora);
  const q = quadro.dados;

  return (
    <Casca
      kicker="OPERAÇÃO DO CLUB"
      titulo={<>Kanban <em className="kanban-em">do dia.</em></>}
      sub="Reservas, decisões e entregas organizadas pelo próximo passo. O botão de cada cartão leva à ação válida para aquele estado."
      acoes={<Link className="btn btn-ghost" href="/reservas">Ver lista completa</Link>}
    >
      {!q ? <Carregando erro={quadro.erro} /> : (
        <>
          {!q.whatsapp.conectado && <AvisoWhatsApp />}
          {(alertas.dados?.length ?? 0) > 0 && (
            <div className="kanban-alertas">
              <Alertas alertas={alertas.dados ?? []} aoResolver={() => { void alertas.recarregar(); void quadro.recarregar(); }} />
            </div>
          )}

          <div className="quick-summary" aria-label="Resumo da operação">
            <span className="qs"><span className="qs-dot" /><b>{q.resumo.ativas}</b> {q.resumo.ativas === 1 ? "reserva ativa" : "reservas ativas"}</span>
            <span className="qs"><span className="qs-dot yellow" /><b>{q.resumo.precisamDeAcao}</b> {q.resumo.precisamDeAcao === 1 ? "precisa de ação" : "precisam de ação"}</span>
            <span className="qs"><span className="qs-dot green" /><b>{q.resumo.pagas}</b> {q.resumo.pagas === 1 ? "paga" : "pagas"}</span>
            <span className="qs"><span className="qs-dot blue" /><b>{q.resumo.fretePendente}</b> frete pendente</span>
          </div>

          <div className="board-toolbar">
            <label className="board-search">
              <Icone><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Icone>
              <span className="sr-only">Buscar</span>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, telefone ou #reserva" />
            </label>
            <div className="board-filters" role="group" aria-label="Filtrar cartões">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filtro === f.id}
                  className={`filter-chip${filtro === f.id ? " active" : ""}${f.id === "ACAO" ? " attention" : ""}`} onClick={() => setFiltro(f.id)}>
                  {f.texto}
                </button>
              ))}
            </div>
          </div>

          <div className="board-wrap" tabIndex={0} role="region" aria-label="Quadro da operação: role para os lados para ver todas as colunas">
            <div className="kanban">
              {COLUNAS.map((col) => {
                const cartoes = q.colunas[col.id].filter((c) => passa(c, col.id, filtro, busca));
                const total = q.totais[col.id] ?? 0;
                return (
                  <section key={col.id} className="lane" data-lane={col.id} aria-labelledby={`coluna-${col.id}`}>
                    <div className="lane-head">
                      <div><div className="lane-kicker">{col.kicker}</div><h2 className="lane-title" id={`coluna-${col.id}`}>{col.titulo}</h2></div>
                      <span className="lane-count" aria-label={`${total} ${total === 1 ? "pedido" : "pedidos"}`}>{total}</span>
                    </div>
                    <p className="lane-note">{col.nota}</p>
                    <div className="cards-stack">
                      {cartoes.map((c) => <CartaoOperacao key={c.id} c={c} coluna={col.id} agora={agora} />)}
                      {cartoes.length === 0 && <div className="empty-slot">{total > 0 ? "Nada com este filtro." : "Nada por aqui agora."}</div>}
                      {total > q.colunas[col.id].length && (
                        <div className="empty-slot">Mostrando os {q.colunas[col.id].length} mais urgentes. <Link href="/reservas">Ver todos</Link></div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="kanban-footnote">
            <span className="star-mark" aria-hidden="true">✦</span>
            <p><strong>Kanban da operação, sem arrastar cartões.</strong> Pagamento, expiração, cancelamento e entrega têm regras próprias: o pedido muda de coluna quando a ação acontece na tela dele, e o quadro se atualiza sozinho a cada 30 segundos.</p>
          </div>
        </>
      )}
    </Casca>
  );
}

function CartaoOperacao({ c, coluna, agora }: { c: Cartao; coluna: Coluna; agora: number }) {
  const pecas = c.pecas ? `${c.pecas} ${c.pecas === 1 ? "peça" : "peças"}` : null;
  const reserva = `/reservas/${c.id}`;
  const entregas = c.substatus ? `/entregas?substatus=${c.substatus}` : "/entregas";
  const minutos = c.expiraEm ? Math.max(0, Math.ceil((new Date(c.expiraEm).getTime() - agora) / 60_000)) : null;
  const urgente = (coluna === "AGUARDANDO" && minutos !== null && minutos <= 5) || precisaDeAcao(c, coluna);

  let tempo: string;
  if (coluna === "AGUARDANDO") tempo = minutos === null ? "—" : minutos === 0 ? "vencendo" : `${minutos} min`;
  else if (coluna === "CONCLUIDO" && c.entregueEm) tempo = horario(c.entregueEm);
  else if (c.status === "RESERVADO" && c.expiraEm) tempo = `até ${horario(c.expiraEm)}`;
  else if (c.freteAte) tempo = `frete até ${horario(c.freteAte)}`;
  else tempo = c.pagaEm ? horario(c.pagaEm) : "—";

  return (
    <article className={`k-card${urgente ? " urgent" : ""}${coluna === "AGUARDANDO" && c.club ? " pink-edge" : ""}`} aria-labelledby={`cartao-${c.id}`}>
      <div className="k-card-head">
        <div>
          <h3 className="order-no" id={`cartao-${c.id}`}>#{c.numero}</h3>
          <div className="order-name">{c.nome}{pecas ? ` · ${pecas}` : ""}</div>
        </div>
        <span className={`k-time${urgente ? " urgent" : ""}`}>{tempo}</span>
      </div>

      <div className="k-tags">
        {(c.motivos ?? []).map((m) => <span key={m} className="k-tag yellow">{MOTIVO[m].texto}</span>)}
        {c.status === "RESERVADO" && <span className="k-tag pink">Reservado</span>}
        {c.status === "PAGAMENTO_CONFIRMADO" && <span className="k-tag green">Pago</span>}
        {c.status === "ENTREGUE" && <span className="k-tag green">Concluído</span>}
        {c.status === "EXPIRADO" && <span className="k-tag">Encerrada</span>}
        {c.entrega && c.status !== "RESERVADO" && <span className="k-tag blue">{ENTREGA[c.entrega]}</span>}
        {c.club && <span className="k-tag">Club</span>}
      </div>

      {c.notaCancelamento && <div className="k-alert">“{c.notaCancelamento}”{c.status === "RESERVADO" ? " · o prazo da reserva continua correndo enquanto a loja decide." : ""}</div>}
      {!c.notaCancelamento && c.motivos?.includes("CANCELAMENTO") && c.status === "RESERVADO" && (
        <div className="k-alert">O prazo da reserva continua correndo enquanto a loja decide.</div>
      )}

      <dl className="k-meta">
        <dt>Total</dt><dd>{formatarReais(c.totalCentavos)}</dd>
        {coluna === "AGUARDANDO" && c.expiraEm && <><dt>Prazo</dt><dd>até {horario(c.expiraEm)}</dd></>}
        {(coluna === "PAGO" || coluna === "ENTREGA") && c.substatus && <><dt>Próximo passo</dt><dd>{PASSO[c.substatus] ?? c.substatus}</dd></>}
        {coluna === "ACAO" && c.entrega && <><dt>Entrega</dt><dd>{ENTREGA[c.entrega]}</dd></>}
      </dl>

      <div className="k-actions">
        {coluna === "ACAO" && c.motivos?.[0] && <Link className="k-btn citron" href={MOTIVO[c.motivos[0]].href}>Analisar</Link>}
        {coluna === "PAGO" && c.substatus === "AGUARDANDO_CALCULO_FRETE" && <Link className="k-btn primary" href={entregas}>Calcular frete</Link>}
        {coluna === "ENTREGA" && <Link className="k-btn primary" href={entregas}>Abrir logística</Link>}
        <Link className={`k-btn${coluna === "AGUARDANDO" ? " primary" : ""}`} href={reserva}>
          {coluna === "CONCLUIDO" ? "Ver histórico" : coluna === "AGUARDANDO" ? "Abrir reserva" : "Abrir"}
        </Link>
      </div>
    </article>
  );
}
