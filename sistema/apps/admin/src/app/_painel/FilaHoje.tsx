"use client";

import { dataHora } from "@/lib/api";

// As mensagens do WhatsApp hoje, na tela do WhatsApp: o total enviado (fila + respostas na
// própria conversa, como o código e "minha reserva", que não passam pela fila), na fila e falhas.

export interface FilaWhatsApp {
  pendentes: number; enviadasHoje: number; respostasHoje?: number; falhasHoje: number; descartadasHoje: number; maisAntigaPendente: string | null;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export function FilaHoje({ fila }: { fila: FilaWhatsApp }) {
  const total = fila.enviadasHoje + fila.pendentes + fila.falhasHoje;
  const pct = total ? Math.round((fila.enviadasHoje / total) * 100) : 100;
  return (
    <article className="card">
      <h2>Mensagens de WhatsApp hoje</h2>
      <div className="whatsapp">
        <div className="wa-ring" data-n={fila.enviadasHoje} aria-hidden="true"
          style={{ background: `conic-gradient(var(--green) 0 ${pct}%,#dce4cc ${pct}% 100%)` }} />
        <div className="wa-copy">
          <b>{fila.enviadasHoje} {plural(fila.enviadasHoje, "enviada", "enviadas")}</b>
          {fila.respostasHoje ? <p>{fila.respostasHoje} {plural(fila.respostasHoje, "resposta", "respostas")} na conversa (código, minha reserva e outras).</p> : null}
          <p>
            {fila.pendentes} na fila{fila.falhasHoje ? ` · ${fila.falhasHoje} com falha` : ""}
            {fila.descartadasHoje ? ` · ${fila.descartadasHoje} ${plural(fila.descartadasHoje, "descartada (vencida)", "descartadas (vencidas)")}` : ""}.
          </p>
          {fila.maisAntigaPendente && <p>A mais antiga na fila é de {dataHora(fila.maisAntigaPendente)}.</p>}
        </div>
      </div>
    </article>
  );
}
