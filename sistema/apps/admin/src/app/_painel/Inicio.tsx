"use client";

import Link from "next/link";
import { useState } from "react";
import { chamarApi, dataHora, mensagemDeErro } from "@/lib/api";
import { Casca, Icone } from "./Casca";
import { Aviso, Botao, Campo, Carregando } from "./ui";
import { useDados } from "./useDados";
import { useRepetir } from "./useRepetir";

// Início (tela 03 da V4): números do dia, o que pede ação, WhatsApp e alertas do sistema.

interface Painel {
  reservas: { ativas: number; pagas: number; expiradasHoje: number; entreguesHoje: number };
  acoes: {
    cancelamentosPendentes: number; pagamentosEmAnalise: number; disputasAbertas: number; telefonesBloqueados: number; alertasAbertos: number;
    fretes: { aguardandoCalculo: number; aguardandoPagamento: number; pertoDeVencer: number; vencidos: number };
    aguardandoModalidade: number; emPreparacao: number;
  };
  fila: { pendentes: number; enviadasHoje: number; falhasHoje: number; descartadasHoje: number; maisAntigaPendente: string | null };
  whatsapp: { conectado: boolean };
}
interface Alerta { id: string; tipo: string; mensagem: string; abertoEm: string; ocorrencias?: number }

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export function Inicio() {
  const painel = useDados<Painel>("v1/admin/dashboard");
  const alertas = useDados<Alerta[]>("v1/admin/alerts");
  useRepetir(() => { void painel.recarregar(); void alertas.recarregar(); }, 30_000, true);
  const p = painel.dados;

  return (
    <Casca kicker="VISÃO GERAL" titulo="Início" sub="O que precisa da sua atenção agora, sem perder a linguagem visual da T-shirt Club.">
      {!p ? <Carregando erro={painel.erro} /> : (
        <>
          {!p.whatsapp.conectado && (
            <div style={{ marginBottom: 18 }}>
              <Aviso tipo="error" titulo="O WhatsApp da loja está desconectado.">
                <p>Sem ele, as clientes não recebem código nem avisos. Reconecte pelo celular da loja.</p>
              </Aviso>
            </div>
          )}
          <section className="grid cards4" aria-label="Números do dia">
            <Metrica rotulo="Reservas ativas" valor={p.reservas.ativas} dica="em andamento agora" />
            <Metrica tom="green" rotulo="Pagas, a entregar" valor={p.reservas.pagas} dica="prontas para operação" />
            <Metrica tom="yellow" rotulo="Expiradas hoje" valor={p.reservas.expiradasHoje} dica={plural(p.reservas.expiradasHoje, "reserva encerrada", "reservas encerradas")} />
            <Metrica tom="blue" rotulo="Entregues hoje" valor={p.reservas.entreguesHoje} dica={plural(p.reservas.entreguesHoje, "pedido concluído", "pedidos concluídos")} />
          </section>

          <div className="section-title"><h2>Pede ação agora</h2><span>Prioridades da operação</span></div>
          <section className="action-grid" aria-label="Pede ação agora">
            <Acao n={p.acoes.cancelamentosPendentes} texto={plural(p.acoes.cancelamentosPendentes, "pedido de cancelamento", "pedidos de cancelamento")} href="/cancelamentos" tom="hot" />
            <Acao n={p.acoes.fretes.aguardandoCalculo} texto={plural(p.acoes.fretes.aguardandoCalculo, "frete para calcular", "fretes para calcular")} href="/entregas?substatus=AGUARDANDO_CALCULO_FRETE" tom="citron" />
            <Acao n={p.acoes.fretes.pertoDeVencer} texto="fretes perto de vencer" href="/entregas?substatus=AGUARDANDO_PAGAMENTO_FRETE" tom="hot" />
            <Acao n={p.acoes.fretes.vencidos} texto="fretes vencidos" href="/entregas?substatus=FRETE_VENCIDO" tom="hot" />
            <Acao n={p.acoes.emPreparacao} texto="pedidos para preparar" href="/entregas?substatus=EM_PREPARACAO" tom="citron" />
            <Acao n={p.acoes.aguardandoModalidade} texto="pagos sem entrega escolhida" href="/entregas?substatus=AGUARDANDO_MODALIDADE" tom="citron" />
            <Acao n={p.acoes.pagamentosEmAnalise} texto="pagamentos em análise" tom="hot" />
            <Acao n={p.acoes.disputasAbertas} texto="contestações abertas" tom="hot" />
            <Acao n={p.acoes.telefonesBloqueados} texto={plural(p.acoes.telefonesBloqueados, "telefone bloqueado", "telefones bloqueados")} tom="hot" />
          </section>

          <section className="grid cards3" style={{ marginTop: 28 }}>
            <WhatsApp fila={p.fila} />
            <Alertas alertas={alertas.dados ?? []} aoResolver={() => { void alertas.recarregar(); void painel.recarregar(); }} />
          </section>
        </>
      )}
    </Casca>
  );
}

function Metrica({ tom, rotulo, valor, dica }: { tom?: "green" | "yellow" | "blue"; rotulo: string; valor: number; dica: string }) {
  return (
    <article className={`card metric${tom ? ` ${tom}` : ""}`}>
      <span className="label">{rotulo}</span><strong className="value">{valor}</strong><span className="hint">{dica}</span>
    </article>
  );
}

function Acao({ n, texto, href, tom }: { n: number; texto: string; href?: string; tom: "hot" | "citron" }) {
  const classe = `action-card${n > 0 ? ` ${tom}` : ""}`;
  const corpo = <><strong>{n}</strong><span>{texto}</span></>;
  return href && n > 0 ? <Link className={classe} href={href}>{corpo}</Link> : <div className={classe}>{corpo}</div>;
}

function WhatsApp({ fila }: { fila: Painel["fila"] }) {
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

function Alertas({ alertas, aoResolver }: { alertas: Alerta[]; aoResolver: () => void }) {
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
