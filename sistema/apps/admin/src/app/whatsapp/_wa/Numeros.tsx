"use client";

import { useState } from "react";
import { Abas, Carregando } from "../../_painel/ui";
import { useDados } from "../../_painel/useDados";
import { MOTIVO } from "./rotulos";

// Números do atendimento (0570), de 7 ou 30 dias: quanto a Clubinha resolveu sozinha, os
// chamados por motivo, quanto a equipe demora para assumir e finalizar e as notas.

interface Relatorio {
  dias: number; conversas: number; soClubinha: number; chamados: number; abertos: number;
  porMotivo: Record<"EQUIPE" | "TROCA" | "DUVIDA", number>;
  minutosAteAssumir: number | null; minutosAteFinalizar: number | null; lembretes: number;
  notas: { media: number | null; total: number; porNota: Record<"1" | "2" | "3" | "4" | "5", number> };
}

const tempo = (min: number | null) => (min === null ? "–" : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`);
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export function Numeros() {
  const [dias, setDias] = useState<"7" | "30">("7");
  const { dados: r, erro } = useDados<Relatorio>(`v1/admin/whatsapp/numeros?dias=${dias}`);
  return (
    <section className="card wa-numeros" aria-labelledby="numeros-titulo">
      <div className="wa-numeros-topo">
        <h2 id="numeros-titulo">Números do atendimento</h2>
        <Abas rotulo="Período" valor={dias} aoMudar={setDias} opcoes={[{ valor: "7", texto: "7 dias" }, { valor: "30", texto: "30 dias" }]} />
      </div>
      {!r ? <Carregando erro={erro} /> : (
        <div className="wa-tiles">
          <div className="wa-tile"><b>{r.conversas}</b><span>conversas</span></div>
          <div className="wa-tile"><b>{pct(r.soClubinha, r.conversas)}%</b><span>resolvidas só pela Clubinha ({r.soClubinha})</span></div>
          <div className="wa-tile">
            <b>{r.chamados}</b><span>chamados para a equipe</span>
            <small>{(Object.keys(MOTIVO) as (keyof typeof MOTIVO)[]).map((m) => `${MOTIVO[m]}: ${r.porMotivo[m]}`).join(" · ")}</small>
          </div>
          <div className="wa-tile"><b>{tempo(r.minutosAteAssumir)}</b><span>em média até alguém assumir</span>
            {r.lembretes > 0 && <small>{r.lembretes} {r.lembretes === 1 ? "chamado passou" : "chamados passaram"} do tempo e a Clubinha avisou de novo</small>}</div>
          <div className="wa-tile"><b>{tempo(r.minutosAteFinalizar)}</b><span>em média até finalizar</span></div>
          <div className="wa-tile">
            <b>{r.notas.media === null ? "–" : String(r.notas.media).replace(".", ",")}</b>
            <span>nota média ({r.notas.total} {r.notas.total === 1 ? "nota" : "notas"})</span>
            {r.notas.total > 0 && (
              <ul className="wa-notas" aria-label="Notas por valor">
                {(["5", "4", "3", "2", "1"] as const).map((n) => (
                  <li key={n}>
                    <span>{n}</span>
                    <span className="wa-nota-barra" aria-hidden="true"><span className={`w${Math.round(pct(r.notas.porNota[n], r.notas.total) / 10) * 10}`} /></span>
                    <span>{r.notas.porNota[n]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
