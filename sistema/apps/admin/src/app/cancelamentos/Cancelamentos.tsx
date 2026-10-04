"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { dataHora, horario, telefone } from "@/lib/api";
import { DecisaoCancelamento } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Cancelamentos (tela 07 da V4): pendentes primeiro, decisão com motivo. O Histórico (0600, pedido
// da loja: "não consta o cancelamento que foi feito") junta os pedidos das clientes já decididos e
// os cancelamentos feitos pela loja na tela da reserva, com o motivo, quem cancelou e o estorno.

interface Pedido {
  id: string; status: string; observacao?: string; solicitadoEm: string; decididoEm?: string; motivoDecisao?: string;
  reserva: { id: string; numero: number; status: string; nome: string; telefone: string; totalCentavos: number; expiraEm: string };
}

interface DaLoja {
  id: string; canceladaEm: string; canceladaPor?: string; motivo?: string; pago: boolean; estornoCentavos?: number; porForaCentavos?: number;
  reserva: { id: string; numero: number; nome: string; telefone: string; totalCentavos: number };
}

type Item = { tipo: "cliente"; em: string; p: Pedido } | { tipo: "loja"; em: string; c: DaLoja };

export function Cancelamentos() {
  // Sem pedido pendente, a tela abre no Histórico (03/10: a loja abriu, viu "Nenhum pedido
  // esperando decisão" e achou que o cancelamento feito não estava lá). A aba escolhida vale.
  const [escolha, setEscolha] = useState<"PENDENTE" | "TODOS" | null>(null);
  const pend = useDados<Pedido[]>("v1/admin/cancellation-requests?status=PENDENTE");
  const filtro = escolha ?? (pend.dados?.length === 0 ? "TODOS" : "PENDENTE");
  const todos = useDados<Pedido[]>(filtro === "TODOS" ? "v1/admin/cancellation-requests?status=TODOS" : null);
  const daLoja = useDados<DaLoja[]>("v1/admin/store-cancellations");
  const pendentes = pend.dados?.length ?? 0;
  const recarregar = () => { void pend.recarregar(); void todos.recarregar(); void daLoja.recarregar(); };
  // Histórico: os pedidos das clientes e os cancelamentos da loja, do mais recente ao mais antigo
  const historico: Item[] | null = todos.dados && daLoja.dados
    ? [...todos.dados.map((p) => ({ tipo: "cliente" as const, em: p.decididoEm ?? p.solicitadoEm, p })),
       ...daLoja.dados.map((c) => ({ tipo: "loja" as const, em: c.canceladaEm, c }))].sort((a, b) => b.em.localeCompare(a.em))
    : null;

  return (
    <Casca kicker="ATENDIMENTO" titulo="Cancelamentos" sub="Pedidos das clientes que esperam a decisão da loja e o histórico de tudo o que foi cancelado, inclusive pela loja.">
      <div className="tabs" role="group" aria-label="Filtrar pedidos">
        <button type="button" className={`tab${filtro === "PENDENTE" ? " active" : ""}`} aria-pressed={filtro === "PENDENTE"} onClick={() => setEscolha("PENDENTE")}>
          Pendentes {pendentes > 0 && <span className="n">{pendentes}</span>}
        </button>
        <button type="button" className={`tab${filtro === "TODOS" ? " active" : ""}`} aria-pressed={filtro === "TODOS"} onClick={() => setEscolha("TODOS")}>
          Histórico
        </button>
      </div>
      {filtro === "TODOS" ? (!historico ? <Carregando erro={todos.erro ?? daLoja.erro} /> : historico.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>Nenhum cancelamento ainda.</p>
      ) : (
        <div className="list">
          {historico.map((i) => i.tipo === "loja" ? <CartaoDaLoja key={`loja-${i.c.id}`} c={i.c} /> : <CartaoPedido key={i.p.id} p={i.p} aoDecidir={recarregar} />)}
        </div>
      )) : !pend.dados ? <Carregando erro={pend.erro} /> : pend.dados.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Nenhum pedido esperando decisão. <button type="button" className="btn-link" onClick={() => setEscolha("TODOS")}>Ver o histórico</button>
        </p>
      ) : (
        <div className="list">
          {pend.dados.map((p) => <CartaoPedido key={p.id} p={p} aoDecidir={recarregar} />)}
        </div>
      )}
    </Casca>
  );
}

function CartaoPedido({ p, aoDecidir }: { p: Pedido; aoDecidir: () => void }) {
  return (
    <section className="card" aria-label={`Pedido da reserva #${p.reserva.numero}`}
      style={p.status === "PENDENTE" ? { background: "linear-gradient(135deg,#fff,var(--pink-soft))" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <Link href={`/reservas/${p.reserva.id}`} className="pop" style={{ fontSize: 22 }}>#{p.reserva.numero}</Link>
          <p style={{ fontSize: 12, fontWeight: 700, margin: "3px 0 0" }}>{p.reserva.nome} · {telefone(p.reserva.telefone)} · {formatarReais(p.reserva.totalCentavos)}</p>
        </div>
        {p.status === "PENDENTE" ? <Selo tom="issue">Pedido pendente</Selo>
          : <Selo tom={p.status === "APROVADA" ? "paid" : "expired"}>{p.status === "APROVADA" ? "Aprovado" : p.status === "RECUSADA" ? "Recusado" : "Sem efeito"}</Selo>}
      </div>
      <div className="notice" style={{ marginTop: 16, background: "rgba(255,255,255,.72)" }}>
        <p style={{ fontFamily: "var(--font-fraunces)", fontSize: 22, color: "var(--ink)" }}>{p.observacao ? `“${p.observacao}”` : "Sem motivo informado."}</p>
        {p.status === "PENDENTE"
          ? <p>Pedido em {dataHora(p.solicitadoEm)}.{p.reserva.status === "RESERVADO" && <> A reserva expira às <b>{horario(p.reserva.expiraEm)}</b> se nada for decidido.</>}</p>
          : <p>{p.decididoEm ? `Decidido em ${dataHora(p.decididoEm)}` : "Encerrado"}{p.motivoDecisao ? `: ${p.motivoDecisao}` : ""}.</p>}
      </div>
      {p.status === "PENDENTE"
        ? <DecisaoCancelamento pedidoId={p.id} reservaId={p.reserva.id} aoDecidir={aoDecidir} />
        : <div className="actions" style={{ marginTop: 16 }}><Link className="btn btn-ghost" href={`/reservas/${p.reserva.id}`}>Abrir reserva</Link></div>}
    </section>
  );
}

function CartaoDaLoja({ c }: { c: DaLoja }) {
  return (
    <section className="card" aria-label={`Cancelamento da loja, reserva #${c.reserva.numero}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <Link href={`/reservas/${c.reserva.id}`} className="pop" style={{ fontSize: 22 }}>#{c.reserva.numero}</Link>
          <p style={{ fontSize: 12, fontWeight: 700, margin: "3px 0 0" }}>{c.reserva.nome} · {telefone(c.reserva.telefone)} · {formatarReais(c.reserva.totalCentavos)}</p>
        </div>
        <Selo tom="expired">Cancelado pela loja</Selo>
      </div>
      <div className="notice" style={{ marginTop: 16, background: "rgba(255,255,255,.72)" }}>
        <p style={{ fontFamily: "var(--font-fraunces)", fontSize: 22, color: "var(--ink)" }}>{c.motivo ? `“${c.motivo}”` : "Sem motivo registrado."}</p>
        <p>
          Cancelado em {dataHora(c.canceladaEm)}{c.canceladaPor ? ` por ${c.canceladaPor}` : ""}.{" "}
          {!c.pago ? "Reserva não paga: as peças voltaram ao estoque."
            : c.estornoCentavos ? `Estorno de ${formatarReais(c.estornoCentavos)} no Mercado Pago; as peças voltaram ao estoque.`
            : c.porForaCentavos ? `Venda paga fora do Mercado Pago: devolução de ${formatarReais(c.porForaCentavos)} por fora; as peças voltaram ao estoque.`
            : "Pedido pago: as peças voltaram ao estoque."}
        </p>
      </div>
      <div className="actions" style={{ marginTop: 16 }}><Link className="btn btn-ghost" href={`/reservas/${c.reserva.id}`}>Abrir reserva</Link></div>
    </section>
  );
}
