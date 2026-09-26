"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { dataHora, horario, telefone } from "@/lib/api";
import { DecisaoCancelamento } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Cancelamentos (tela 07 da V4): pendentes primeiro, decisão com motivo.

interface Pedido {
  id: string; status: string; observacao?: string; solicitadoEm: string; decididoEm?: string; motivoDecisao?: string;
  reserva: { id: string; numero: number; status: string; nome: string; telefone: string; totalCentavos: number; expiraEm: string };
}

export function Cancelamentos() {
  const [filtro, setFiltro] = useState<"PENDENTE" | "TODOS">("PENDENTE");
  const { dados, erro, recarregar } = useDados<Pedido[]>(`v1/admin/cancellation-requests?status=${filtro}`);
  const pendentes = filtro === "PENDENTE" ? dados?.length ?? 0 : dados?.filter((p) => p.status === "PENDENTE").length ?? 0;

  return (
    <Casca kicker="ATENDIMENTO" titulo="Cancelamentos" sub="Pedidos que exigem decisão da loja antes do prazo da reserva.">
      <div className="tabs" role="group" aria-label="Filtrar pedidos">
        <button type="button" className={`tab${filtro === "PENDENTE" ? " active" : ""}`} aria-pressed={filtro === "PENDENTE"} onClick={() => setFiltro("PENDENTE")}>
          Pendentes {pendentes > 0 && <span className="n">{pendentes}</span>}
        </button>
        <button type="button" className={`tab${filtro === "TODOS" ? " active" : ""}`} aria-pressed={filtro === "TODOS"} onClick={() => setFiltro("TODOS")}>Todos</button>
      </div>
      {!dados ? <Carregando erro={erro} /> : dados.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>{filtro === "PENDENTE" ? "Nenhum pedido esperando decisão." : "Nenhum pedido de cancelamento."}</p>
      ) : (
        <div className="list">
          {dados.map((p) => (
            <section key={p.id} className="card" aria-label={`Pedido da reserva #${p.reserva.numero}`}
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
                ? <DecisaoCancelamento pedidoId={p.id} reservaId={p.reserva.id} aoDecidir={() => void recarregar()} />
                : <div className="actions" style={{ marginTop: 16 }}><Link className="btn btn-ghost" href={`/reservas/${p.reserva.id}`}>Abrir reserva</Link></div>}
            </section>
          ))}
        </div>
      )}
    </Casca>
  );
}
