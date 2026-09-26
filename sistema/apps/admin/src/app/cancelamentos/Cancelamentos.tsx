"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { Aviso, cx } from "@tshirtclub/ui";
import { dataHora, horario, telefone } from "@/lib/api";
import { DecisaoCancelamento } from "../_painel/acoes";
import { Caixa, Casca } from "../_painel/Casca";
import { useDados } from "../_painel/useDados";

interface Pedido {
  id: string; status: string; observacao?: string; solicitadoEm: string; decididoEm?: string; motivoDecisao?: string;
  reserva: { id: string; numero: number; status: string; nome: string; telefone: string; totalCentavos: number; expiraEm: string };
}

const FILTROS = [["PENDENTE", "Pendentes"], ["TODOS", "Todos"]] as const;

export function Cancelamentos() {
  const [filtro, setFiltro] = useState<"PENDENTE" | "TODOS">("PENDENTE");
  const { dados, erro, recarregar } = useDados<Pedido[]>(`v1/admin/cancellation-requests?status=${filtro}`);

  return (
    <Casca titulo="Cancelamentos">
      <div role="group" aria-label="Filtrar" className="flex gap-2">
        {FILTROS.map(([v, rotulo]) => (
          <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
            className={cx("min-h-11 rounded-pilula border-2 border-tinta px-4 text-sm font-semibold", filtro === v ? "bg-citrino text-no-citrino" : "bg-branco")}>
            {rotulo}
          </button>
        ))}
      </div>
      {erro && <Aviso tipo="erro" titulo={erro} />}
      {!dados ? <p role="status" className="m-0 text-tinta-suave">Carregando…</p> : dados.length === 0 ? (
        <p className="m-0 text-tinta-suave">{filtro === "PENDENTE" ? "Nenhum pedido esperando decisão." : "Nenhum pedido de cancelamento."}</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {dados.map((p) => (
            <li key={p.id}>
              <Caixa>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/reservas/${p.reserva.id}`} className="font-display text-xl font-extrabold underline decoration-rosa decoration-2 underline-offset-2">#{p.reserva.numero}</Link>
                  <span className="text-sm text-tinta-suave">Pedido em {dataHora(p.solicitadoEm)}</span>
                </div>
                <p className="m-0 text-[15px]"><b>{p.reserva.nome}</b> · {telefone(p.reserva.telefone)} · {formatarReais(p.reserva.totalCentavos)}</p>
                <p className="m-0 text-[15px]">{p.observacao ? `“${p.observacao}”` : "Sem motivo informado."}</p>
                {p.status === "PENDENTE" ? (
                  <>
                    {p.reserva.status === "RESERVADO" && <p className="m-0 text-sm text-tinta-suave">A reserva expira às {horario(p.reserva.expiraEm)} se nada for decidido.</p>}
                    <DecisaoCancelamento pedidoId={p.id} aoDecidir={() => void recarregar()} />
                  </>
                ) : (
                  <p className="m-0 text-sm text-tinta-suave">
                    {p.status === "APROVADA" ? "Aprovado" : p.status === "RECUSADA" ? "Recusado" : "Sem efeito (a reserva terminou antes)"}
                    {p.decididoEm ? ` em ${dataHora(p.decididoEm)}` : ""}{p.motivoDecisao ? `: ${p.motivoDecisao}` : ""}.
                  </p>
                )}
              </Caixa>
            </li>
          ))}
        </ul>
      )}
    </Casca>
  );
}
