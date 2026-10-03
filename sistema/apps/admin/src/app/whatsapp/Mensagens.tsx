"use client";

import { EXEMPLOS_MENSAGENS, NOTIFICACOES, mensagemWhatsApp, type Modelo, type ParametrosMensagem } from "@tshirtclub/domain";
import { chamarApi } from "@/lib/api";
import { Carregando, Marcar, Selo } from "../_painel/ui";
import { useEnvio } from "../_painel/useEnvio";
import { CascaWhatsapp, useWhatsapp, type ConfigWhatsapp } from "./_wa/CascaWhatsapp";
import { ETAPAS } from "./_wa/rotulos";
import { TextoWhatsApp } from "./_wa/TextoWhatsApp";

// Mensagens automáticas (0570): as notificações para a cliente por etapa da compra, cada uma com
// o texto que ela recebe (exemplo com dados de mentira) e o liga e desliga. As essenciais ficam
// sempre ligadas. Cada mudança vale na hora e vai para a auditoria.

/** O exemplo de cada modelo da linha, na ordem da linha (aprovado e recusado, saiu e enviado). */
function exemplos(id: string): string[] {
  const linha = NOTIFICACOES.find((n) => n.id === id);
  if (!linha) return [];
  return linha.modelos.flatMap((m) => {
    const e = EXEMPLOS_MENSAGENS.find((x) => x.modelo === m);
    return e ? [mensagemWhatsApp(m as Modelo, e.p as ParametrosMensagem[Modelo], 0)] : [];
  });
}

export function Mensagens() {
  return (
    <CascaWhatsapp sub="O que a cliente recebe em cada etapa da compra. As essenciais ficam sempre ligadas.">
      <ListaDeMensagens />
    </CascaWhatsapp>
  );
}

function ListaDeMensagens() {
  const { config, erroConfig, recarregarConfig } = useWhatsapp();
  const { ocupado, erro, enviar } = useEnvio<ConfigWhatsapp>(recarregarConfig);
  if (!config) return <section className="card"><Carregando erro={erroConfig} /></section>;
  const porId = new Map(config.notificacoes.map((n) => [n.id, n]));
  const agrupadas = new Set(ETAPAS.flatMap((e) => e.ids));
  const etapas = [...ETAPAS, { id: "outras", titulo: "Outras", nota: "", ids: config.notificacoes.map((n) => n.id).filter((id) => !agrupadas.has(id)) }]
    .filter((e) => e.ids.some((id) => porId.has(id)));

  return (
    <div className="stack">
      {erro && <p className="field-error" role="alert">{erro}</p>}
      {etapas.map((etapa) => {
        const linhas = etapa.ids.flatMap((id) => porId.get(id) ?? []);
        const ligadas = linhas.filter((n) => n.ligada).length;
        return (
          <section key={etapa.id} className="card" aria-labelledby={`etapa-${etapa.id}`}>
            <div className="wa-etapa-topo">
              <h2 id={`etapa-${etapa.id}`}>{etapa.titulo}</h2>
              <span className="muted">{ligadas} de {linhas.length} {linhas.length === 1 ? "ligada" : "ligadas"}</span>
            </div>
            {etapa.nota && <p className="field-help">{etapa.nota}</p>}
            <ul className="wa-msgs">
              {linhas.map((n) => (
                <li key={n.id} className={`wa-msg${n.ligada ? "" : " desligada"}`}>
                  <div className="notif">
                    <div><b>{n.nome}</b><p>{n.quando}</p></div>
                    {n.essencial ? <Selo tom="paid">Essencial</Selo> : (
                      <Marcar rotulo={n.ligada ? "Ligada" : "Desligada"} aria-label={`Enviar “${n.nome}”`} checked={n.ligada} disabled={ocupado}
                        onChange={(e) => void enviar(chamarApi<ConfigWhatsapp>("v1/admin/settings/whatsapp", { notificacoes: { [n.id]: e.target.checked } }, "PUT"))} />
                    )}
                  </div>
                  {exemplos(n.id).length > 0 && (
                    <details className="wa-previa">
                      <summary>Ver a mensagem<span className="sr-only"> “{n.nome}”</span></summary>
                      <div className="wa-previa-bolhas">
                        {exemplos(n.id).map((t, i) => <div key={i} className="bolha loja"><TextoWhatsApp texto={t} /></div>)}
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="field-help">Nos exemplos, nome, número e horário são de mentira. No envio entram os dados da reserva.</p>
    </div>
  );
}
