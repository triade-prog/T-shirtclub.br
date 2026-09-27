"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { AvisoWhatsApp } from "./Alertas";
import { Casca } from "./Casca";
import { Carregando } from "./ui";
import { useDados } from "./useDados";
import { useRepetir } from "./useRepetir";

// Dashboard comercial (protótipo 03 da V4, F12, D25): como a loja está vendendo. O
// faturamento segue as regras contábeis confirmadas pela loja (0360): a venda conta na
// confirmação do pagamento; receita bruta (peças pelo preço de tabela + frete) menos
// descontos e estornos dá a receita líquida. O que fazer agora fica na Operação.

type Periodo = "HOJE" | "7_DIAS" | "30_DIAS" | "MES" | "ANO";

interface Totais {
  pedidos: number;
  pecasBrutaCentavos: number;
  freteCentavos: number;
  receitaBrutaCentavos: number;
  descontosCentavos: number;
  estornosCentavos: number;
  receitaLiquidaCentavos: number;
  ticketMedioCentavos: number | null;
  pecas: number;
  pedidosClub: number;
  reservasEncerradas: number;
  reservasPagas: number;
}

interface Comercial {
  periodo: Periodo;
  atual: Totais;
  anterior: Totais;
  meta: number | null;
  serie: { dia: string; receitaLiquidaCentavos: number }[];
  colecoes: { nome: string; receitaCentavos: number; pecas: number }[];
  mix: { pagamento: Partial<Record<"PIX" | "CARTAO", number>>; entrega: Partial<Record<"RETIRADA" | "MOTOBOY" | "ENVIO", number>> };
  estoque: { id: string; nome: string; colecao: string; disponivel: number }[];
  estoqueTotal: number;
  pulso: { ativas: number; precisamDeAcao: number; pagas: number; freteParaCalcular: number; entreguesHoje: number };
  whatsapp: { conectado: boolean };
}

const PERIODOS: { id: Periodo; texto: string; meta: string; anterior: string }[] = [
  { id: "HOJE", texto: "Hoje", meta: "Meta de hoje", anterior: "ontem até agora" },
  { id: "7_DIAS", texto: "7 dias", meta: "Meta de 7 dias", anterior: "7 dias anteriores" },
  { id: "30_DIAS", texto: "30 dias", meta: "Meta de 30 dias", anterior: "30 dias anteriores" },
  { id: "MES", texto: "Este mês", meta: "Meta do mês", anterior: "mês passado até hoje" },
  { id: "ANO", texto: "Este ano", meta: "Meta do ano", anterior: "ano passado até hoje" },
];

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
const pctTexto = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** "↑ 18%" / "↓ 4%" / "=" comparado com o período anterior; sem base, nada. */
function Tendencia({ atual, anterior, sufixo, unidade = "pct" }: { atual: number; anterior: number; sufixo: string; unidade?: "pct" | "n" }) {
  if (unidade === "pct" && anterior === 0) return <div className="kpi-trend"><span>{sufixo}</span></div>;
  const diff = unidade === "pct" ? Math.round(((atual - anterior) / anterior) * 100) : atual - anterior;
  const classe = diff > 0 ? "up" : diff < 0 ? "down" : "";
  const seta = diff > 0 ? "↑" : diff < 0 ? "↓" : "=";
  const valor = diff === 0 ? "" : ` ${Math.abs(diff)}${unidade === "pct" ? "%" : ""}`;
  return <div className="kpi-trend"><span className={classe}>{seta}{valor}</span><span>vs. {sufixo}</span></div>;
}

export function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("HOJE");
  const { dados: d, erro, recarregar } = useDados<Comercial>(`v1/admin/comercial?periodo=${periodo}`);
  useRepetir(() => void recarregar(), 60_000, true);
  const info = PERIODOS.find((p) => p.id === periodo)!;

  return (
    <Casca
      kicker="COMERCIAL · VISÃO EXECUTIVA"
      titulo={<>Como o Club <em className="kanban-em">está vendendo?</em></>}
      sub="Receita, conversão das reservas, coleções que puxam venda, adesão ao Club e sinais de estoque. O que fazer agora fica na Operação."
      acoes={
        <div className="periods" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" className={`period${periodo === p.id ? " active" : ""}`} aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>
              {p.texto}
            </button>
          ))}
        </div>
      }
    >
      {!d || d.periodo !== periodo ? <Carregando erro={erro} /> : (
        <>
          {!d.whatsapp.conectado && <AvisoWhatsApp />}
          <Indicadores d={d} anterior={info.anterior} />

          <section className="grid dc-duas">
            <Grafico serie={d.serie} />
            <Meta d={d} rotulo={info.meta} />
          </section>

          <section className="grid dc-tres">
            <Demonstrativo t={d.atual} />
            <Colecoes colecoes={d.colecoes} />
            <Mix mix={d.mix} />
          </section>

          <section className="grid dc-duas">
            <Estoque estoque={d.estoque} total={d.estoqueTotal} />
            <Pulso p={d.pulso} />
          </section>

          <section className="cta-row">
            <div><strong>O comercial mostra o que aconteceu. A Operação mostra o que fazer agora.</strong><p>As duas telas têm funções diferentes e se completam.</p></div>
            <div className="cta-actions">
              <Link className="dc-btn citron" href="/operacao">Abrir operação</Link>
              <Link className="dc-btn white" href="/reservas">Ver reservas</Link>
              <Link className="dc-btn outline" href="/entregas">Entregas</Link>
            </div>
          </section>
        </>
      )}
    </Casca>
  );
}

function Indicadores({ d, anterior }: { d: Comercial; anterior: string }) {
  const a = d.atual;
  const b = d.anterior;
  const conv = a.reservasEncerradas ? (a.reservasPagas / a.reservasEncerradas) * 100 : null;
  const convAnt = b.reservasEncerradas ? (b.reservasPagas / b.reservasEncerradas) * 100 : null;
  return (
    <section className="grid kpis" aria-label="Indicadores principais">
      <article className="card kpi">
        <div className="kpi-label">Receita líquida</div>
        <div className="kpi-value">{formatarReais(a.receitaLiquidaCentavos)}</div>
        <Tendencia atual={a.receitaLiquidaCentavos} anterior={b.receitaLiquidaCentavos} sufixo={anterior} />
      </article>
      <article className="card kpi green">
        <div className="kpi-label">Pedidos pagos</div>
        <div className="kpi-value">{a.pedidos}</div>
        <Tendencia atual={a.pedidos} anterior={b.pedidos} sufixo={anterior} unidade="n" />
      </article>
      <article className="card kpi yellow">
        <div className="kpi-label">Ticket médio</div>
        <div className="kpi-value">{a.ticketMedioCentavos === null ? "—" : formatarReais(a.ticketMedioCentavos)}</div>
        <div className="kpi-trend"><span>peças por pedido pago, sem frete</span></div>
      </article>
      <article className="card kpi blue">
        <div className="kpi-label">Conversão reserva → pago</div>
        <div className="kpi-value">{conv === null ? "—" : pctTexto(conv)}</div>
        <div className="kpi-trend">
          {conv !== null && convAnt !== null
            ? <><span className={conv > convAnt ? "up" : conv < convAnt ? "down" : ""}>{conv >= convAnt ? "↑" : "↓"} {Math.abs(conv - convAnt).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.</span><span>vs. {anterior}</span></>
            : <span>{a.reservasPagas} de {a.reservasEncerradas} {a.reservasEncerradas === 1 ? "reserva encerrada" : "reservas encerradas"}</span>}
        </div>
      </article>
      <article className="card kpi violet">
        <div className="kpi-label">Peças vendidas</div>
        <div className="kpi-value">{a.pecas}</div>
        <div className="kpi-trend"><span>{a.pedidos ? `${(a.pecas / a.pedidos).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} peças por pedido` : "nenhum pedido no período"}</span></div>
      </article>
      <article className="card kpi tomato">
        <div className="kpi-label">Club nas vendas</div>
        <div className="kpi-value">{a.pedidos ? `${pct(a.pedidosClub, a.pedidos)}%` : "—"}</div>
        <div className="kpi-trend"><span>{a.pedidosClub} de {a.pedidos} {a.pedidos === 1 ? "pedido" : "pedidos"}</span></div>
      </article>
    </section>
  );
}

function Grafico({ serie }: { serie: Comercial["serie"] }) {
  const maior = Math.max(1, ...serie.map((s) => s.receitaLiquidaCentavos));
  const total = serie.reduce((a, s) => a + s.receitaLiquidaCentavos, 0);
  return (
    <article className="card dc-card">
      <div className="card-head">
        <div><h2 className="card-title">Receita líquida nos últimos 7 dias</h2><p className="card-sub">Pedidos com pagamento confirmado, menos descontos e estornos.</p></div>
        <span className="mini-tag">{formatarReais(total)}</span>
      </div>
      <div className="chartbox">
        <div className="chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
        <ol className="bars" aria-label="Receita líquida por dia">
          {serie.map((s, i) => {
            const altura = Math.max(3, Math.round((s.receitaLiquidaCentavos / maior) * 100));
            const dia = DIAS[new Date(`${s.dia}T12:00:00`).getDay()];
            const hoje = i === serie.length - 1;
            return (
              <li key={s.dia} className="bar-col" tabIndex={0} aria-label={`${hoje ? "Hoje" : dia}: ${formatarReais(s.receitaLiquidaCentavos)}`}>
                <span className="bar-value" aria-hidden="true">{formatarReais(s.receitaLiquidaCentavos)}</span>
                <div className={`bar${hoje ? " today" : ""}`} style={{ height: `${altura}%` }} aria-hidden="true" />
                <small aria-hidden="true">{hoje ? "Hoje" : dia}</small>
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}

function Meta({ d, rotulo }: { d: Comercial; rotulo: string }) {
  const feito = d.atual.receitaLiquidaCentavos;
  const clubPct = pct(d.atual.pedidosClub, d.atual.pedidos);
  return (
    <aside className="card goal-card">
      {d.meta ? (
        <>
          <div className="goal-top">
            <div>
              <div className="kpi-label">{rotulo}</div>
              <div className="goal-num">{pct(feito, d.meta)}%</div>
              <div className="goal-caption">{formatarReais(feito)} de {formatarReais(d.meta)}</div>
            </div>
            <span className="mini-tag citron">{feito >= d.meta ? "Meta batida ✦" : `${formatarReais(d.meta - feito)} restantes`}</span>
          </div>
          <div className="progress" role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct(feito, d.meta))}>
            <span style={{ width: `${Math.min(100, pct(feito, d.meta))}%` }} />
          </div>
        </>
      ) : (
        <div>
          <div className="kpi-label">{rotulo}</div>
          <p className="goal-caption" style={{ fontSize: 12, marginTop: 12 }}>Sem meta cadastrada. <Link href="/conta#metas" className="dc-link">Cadastre as metas diária, mensal e anual em Minha conta.</Link></p>
        </div>
      )}
      <hr className="goal-divider" />
      <div className="club-share">
        <div className="donut" style={{ background: `conic-gradient(var(--pink) 0 ${clubPct}%, var(--citron) ${clubPct}% 100%)` }} aria-hidden="true">
          <div className="donut-label">{d.atual.pedidos ? `${clubPct}%` : "—"}</div>
        </div>
        <div>
          <h3>O Club no ticket</h3>
          <p>{d.atual.pedidos
            ? `${d.atual.pedidosClub} de ${d.atual.pedidos} ${d.atual.pedidos === 1 ? "pedido pago" : "pedidos pagos"} com a promoção de grupo. Ela eleva o ticket e as peças por compra.`
            : "Nenhum pedido pago no período."}</p>
        </div>
      </div>
    </aside>
  );
}

/** A leitura contábil do período (DRE simplificada), na data da confirmação do pagamento. */
function Demonstrativo({ t }: { t: Totais }) {
  const linha = (rotulo: string, valor: number, tipo?: "menos" | "total") => (
    <div className={`dre-row${tipo === "total" ? " total" : ""}`}>
      <span>{rotulo}</span><b className={tipo === "menos" && valor ? "down" : undefined}>{tipo === "menos" && valor ? "− " : ""}{formatarReais(valor)}</b>
    </div>
  );
  return (
    <article className="card list-card">
      <h2 className="card-title">Demonstrativo do período</h2>
      <p className="card-sub">A venda conta na confirmação do pagamento.</p>
      <div className="dre">
        {linha("Peças (preço de tabela)", t.pecasBrutaCentavos)}
        {linha("Frete cobrado", t.freteCentavos)}
        {linha("Receita bruta", t.receitaBrutaCentavos, "total")}
        {linha("Descontos (promoções e cupons)", t.descontosCentavos, "menos")}
        {linha("Devoluções e estornos", t.estornosCentavos, "menos")}
        {linha("Receita líquida", t.receitaLiquidaCentavos, "total")}
      </div>
      <p className="card-sub">Antes dos impostos e das taxas do Mercado Pago.</p>
    </article>
  );
}

function Colecoes({ colecoes }: { colecoes: Comercial["colecoes"] }) {
  const total = colecoes.reduce((a, c) => a + c.receitaCentavos, 0);
  return (
    <article className="card list-card">
      <h2 className="card-title">Coleções que mais vendem</h2>
      <p className="card-sub">Participação nas vendas de peças do período.</p>
      {colecoes.length === 0 ? <p className="dc-vazio">Nenhuma venda no período.</p> : (
        <ol className="rank-list">
          {colecoes.map((c, i) => (
            <li key={c.nome} className="rank-row">
              <span className="rank-no">{i + 1}</span>
              <div><div className="rank-name">{c.nome}</div><div className="rank-meta">{pct(c.receitaCentavos, total)}% · {c.pecas} {c.pecas === 1 ? "peça" : "peças"}</div></div>
              <span className="rank-val">{formatarReais(c.receitaCentavos)}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function Mix({ mix }: { mix: Comercial["mix"] }) {
  const pag = (mix.pagamento.PIX ?? 0) + (mix.pagamento.CARTAO ?? 0);
  const ent = (mix.entrega.RETIRADA ?? 0) + (mix.entrega.MOTOBOY ?? 0) + (mix.entrega.ENVIO ?? 0);
  const linha = (rotulo: string, n: number, todo: number, cor: string) => (
    <div className="mix-row">
      <b>{rotulo}</b>
      <div className="mix-track" aria-hidden="true"><div className={`mix-fill ${cor}`} style={{ width: `${pct(n, todo)}%` }} /></div>
      <strong>{pct(n, todo)}%</strong>
    </div>
  );
  return (
    <article className="card list-card">
      <h2 className="card-title">Mix comercial</h2>
      <p className="card-sub">Como as vendas do período aconteceram.</p>
      {pag === 0 ? <p className="dc-vazio">Nenhuma venda no período.</p> : (
        <div className="compact-list">
          {linha("PIX", mix.pagamento.PIX ?? 0, pag, "green")}
          {linha("Cartão", mix.pagamento.CARTAO ?? 0, pag, "pink")}
          <div className="mix-gap" />
          {linha("Retirada", mix.entrega.RETIRADA ?? 0, ent, "violet")}
          {linha("Motoboy", mix.entrega.MOTOBOY ?? 0, ent, "blue")}
          {linha("Envio", mix.entrega.ENVIO ?? 0, ent, "citron")}
        </div>
      )}
    </article>
  );
}

function Estoque({ estoque, total }: { estoque: Comercial["estoque"]; total: number }) {
  return (
    <article className="card list-card">
      <div className="card-head">
        <div><h2 className="card-title">Estoque que merece atenção</h2><p className="card-sub">Peças publicadas com até 1 unidade disponível.</p></div>
        {total > 0 && <span className="mini-tag tomato">{total} {total === 1 ? "peça" : "peças"}</span>}
      </div>
      {estoque.length === 0 ? <p className="dc-vazio">Nenhuma peça com estoque crítico.</p> : (
        <ul className="compact-list">
          {estoque.map((p) => (
            <li key={p.id} className="inventory-row">
              <div><strong>{p.nome}</strong><br /><span>{p.colecao}</span></div>
              <span className="stock-badge">{p.disponivel === 0 ? "esgotada" : "1 disponível"}</span>
            </li>
          ))}
        </ul>
      )}
      {total > estoque.length && <Link className="dc-link" href="/estoque">Ver todas no estoque</Link>}
    </article>
  );
}

function Pulso({ p }: { p: Comercial["pulso"] }) {
  const item = (n: number, texto: string, atencao = false) => (
    <Link href="/operacao" className={`ops-item${atencao && n > 0 ? " attention" : ""}`}><div className="n">{n}</div><div className="l">{texto}</div></Link>
  );
  return (
    <article className="card list-card">
      <h2 className="card-title">Pulso da operação</h2>
      <p className="card-sub">Agora, independente do período.</p>
      <div className="ops-strip">
        {item(p.ativas, p.ativas === 1 ? "reserva ativa" : "reservas ativas")}
        {item(p.precisamDeAcao, p.precisamDeAcao === 1 ? "precisa de ação" : "precisam de ação", true)}
        {item(p.pagas, "pagas, a entregar")}
        {item(p.freteParaCalcular, "frete para calcular", true)}
        {item(p.entreguesHoje, "entregues hoje")}
      </div>
    </article>
  );
}
