"use client";

import { useState } from "react";
import { chamarApi, dataHora, mensagemDeErro } from "@/lib/api";
import { Icone } from "./Casca";
import { Aviso, Botao, Campo } from "./ui";

// Aviso de WhatsApp desconectado e alertas do sistema (F11), no Início e na Operação.

export interface Alerta { id: string; tipo: string; mensagem: string; abertoEm: string; ocorrencias?: number }

export function AvisoWhatsApp() {
  return (
    <div style={{ marginBottom: 18 }}>
      <Aviso tipo="error" titulo="O WhatsApp da loja está desconectado.">
        <p>Sem ele, as clientes não recebem código nem avisos. Reconecte pelo celular da loja.</p>
      </Aviso>
    </div>
  );
}

export function Alertas({ alertas, aoResolver }: { alertas: Alerta[]; aoResolver: () => void }) {
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function resolver(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
    if (motivo.length < 3) return setErro("Escreva o que foi feito (pelo menos 3 letras).");
    setOcupado(true);
    const r = await chamarApi(`v1/admin/alerts/${id}/resolve`, { motivo });
    setOcupado(false);
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    setErro(null);
    setResolvendo(null);
    aoResolver();
  }

  return (
    <article className="card span2">
      <h2>Alertas do sistema {alertas.length > 0 && <span className="pop" style={{ color: "var(--pink-dark)" }}>({alertas.length})</span>}</h2>
      {alertas.length === 0 ? <p className="muted" style={{ fontSize: 11, margin: 0 }}>Nenhum alerta aberto.</p> : (
        <div className="list">
          {alertas.map((a) => (
            <div key={a.id}>
              <div className="alert-row">
                <div className="copy">
                  <div className="alert-icon"><Icone><path d="M12 4 3 20h18Z" /><path d="M12 9v4M12 17h.01" /></Icone></div>
                  <div><b>{a.mensagem}</b><p>Desde {dataHora(a.abertoEm)}{a.ocorrencias && a.ocorrencias > 1 ? ` · ${a.ocorrencias} vezes` : ""}</p></div>
                </div>
                {resolvendo !== a.id && <Botao variante="citron" onClick={() => { setResolvendo(a.id); setErro(null); }}>Resolver</Botao>}
              </div>
              {resolvendo === a.id && (
                <form onSubmit={(e) => resolver(e, a.id)} className="decision">
                  <Campo multilinha name="motivo" rotulo="O que foi feito?" maxLength={500} erro={erro ?? undefined} />
                  <div className="actions">
                    <Botao type="submit" variante="citron" carregando={ocupado}>Marcar como resolvido</Botao>
                    <Botao variante="link" onClick={() => setResolvendo(null)}>Voltar</Botao>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
