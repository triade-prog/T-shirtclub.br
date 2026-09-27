"use client";

import Link from "next/link";
import { dataHora } from "@/lib/api";
import { Alertas, AvisoWhatsApp, type Alerta } from "./Alertas";
import { Casca } from "./Casca";
import { Carregando } from "./ui";
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
          {!p.whatsapp.conectado && <AvisoWhatsApp />}
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
            <Acao n={p.acoes.pagamentosEmAnalise} texto="pagamentos em análise" href="/pagamentos" tom="hot" />
            <Acao n={p.acoes.disputasAbertas} texto="contestações abertas" href="/contestacoes" tom="hot" />
            <Acao n={p.acoes.telefonesBloqueados} texto={plural(p.acoes.telefonesBloqueados, "telefone bloqueado", "telefones bloqueados")} href="/bloqueados" tom="hot" />
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

export function WhatsApp({ fila }: { fila: Painel["fila"] }) {
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
