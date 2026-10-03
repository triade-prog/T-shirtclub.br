"use client";

import { useState } from "react";
import { ORIGENS_VISITA } from "@tshirtclub/domain";
import { Casca } from "../_painel/Casca";
import { Carregando } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useRepetir } from "../_painel/useRepetir";

// Acessos da loja (0520): quantas pessoas visitaram o site e quantas páginas viram, por dia, as
// páginas mais vistas, de onde as visitas chegaram e se foi celular ou computador. A loja conta
// sem cookie: o visitante é um código que muda todo dia, e robôs ficam de fora.

type Dias = 7 | 30 | 90;
interface Total { visitas: number; visitantes: number }
interface Trafego {
  inicio: string; fim: string;
  hoje: Total; ontem: Total; seteDias: Total; periodo: Total;
  dias: { dia: string; visitas: number; visitantes: number }[];
  paginas: { caminho: string; nome: string | null; visitas: number }[];
  origens: { origem: string; entradas: number }[];
  aparelhos: { celular: number; tablet: number; computador: number };
}

const PERIODOS: { id: Dias; texto: string }[] = [{ id: 7, texto: "7 dias" }, { id: 30, texto: "30 dias" }, { id: 90, texto: "90 dias" }];
const NOME_FIXO: Record<string, string> = {
  "/": "Início", "/sacola": "Sacola", "/trocas": "Trocas", "/privacidade": "Privacidade", "/consulta": "Consultar reservas",
  "/reserva": "Reservar", "/reserva/codigo": "Código da reserva", "/reserva/numero": "Página de uma reserva", "/pagamento-aprovado": "Pagamento aprovado",
  "/r": "Link da reserva", "/colecao": "Coleção que saiu da loja", "/produto": "Peça que saiu da loja",
};
const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
const dataCurta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function nomeDaPagina(p: Trafego["paginas"][number]): { nome: string; meta: string } {
  if (p.nome) return { nome: p.nome, meta: p.caminho.startsWith("/colecao/") ? "Coleção" : "Peça" };
  return { nome: NOME_FIXO[p.caminho] ?? p.caminho, meta: "Página da loja" };
}

export function Acessos() {
  const [dias, setDias] = useState<Dias>(30);
  const { dados: d, erro, recarregar } = useDados<Trafego>(`v1/admin/acessos?dias=${dias}`);
  useRepetir(() => void recarregar(), 60_000, true);

  return (
    <Casca
      kicker="LOJA · ACESSOS"
      titulo={<>Quem visitou <em className="kanban-em">o site?</em></>}
      sub="Visitantes e páginas vistas por dia, as páginas mais vistas, de onde as visitas chegaram e o aparelho. Sem cookie: cada pessoa conta uma vez por dia, e robôs de busca ficam de fora."
      acoes={
        <div className="periods" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" className={`period${dias === p.id ? " active" : ""}`} aria-pressed={dias === p.id} onClick={() => setDias(p.id)}>{p.texto}</button>
          ))}
        </div>
      }
    >
      {!d || d.dias.length !== dias ? <Carregando erro={erro} /> : (
        <>
          <section className="grid kpis" aria-label="Resumo dos acessos">
            <Numero rotulo="Visitantes hoje" valor={d.hoje.visitantes} nota={`${n(d.hoje.visitas)} páginas vistas · ontem ${n(d.ontem.visitantes)}`} />
            <Numero rotulo="Visitantes em 7 dias" valor={d.seteDias.visitantes} nota={`${n(d.seteDias.visitas)} páginas vistas`} cor="green" />
            <Numero rotulo={`Visitantes em ${dias} dias`} valor={d.periodo.visitantes} nota={`${n(d.periodo.visitas)} páginas vistas`} cor="yellow" />
            <Numero rotulo="Páginas por visitante" valor={d.periodo.visitantes ? Number((d.periodo.visitas / d.periodo.visitantes).toFixed(1)) : 0} nota={`média de ${dias} dias`} cor="blue" />
          </section>
          <Grafico dias={d.dias} />
          <section className="grid dc-tres">
            <Paginas paginas={d.paginas} />
            <Origens origens={d.origens} />
            <Aparelhos a={d.aparelhos} />
          </section>
        </>
      )}
    </Casca>
  );
}

function Numero({ rotulo, valor, nota, cor }: { rotulo: string; valor: number; nota: string; cor?: string }) {
  return (
    <article className={`card kpi${cor ? ` ${cor}` : ""}`}>
      <div className="kpi-label">{rotulo}</div>
      <div className="kpi-value">{n(valor)}</div>
      <div className="kpi-trend"><span>{nota}</span></div>
    </article>
  );
}

function Grafico({ dias }: { dias: Trafego["dias"] }) {
  const maior = Math.max(1, ...dias.map((x) => x.visitantes));
  // Com muitos dias, a data aparece a cada semana
  const passo = dias.length <= 7 ? 1 : 7;
  return (
    <article className="card dc-card acessos-grafico">
      <div className="card-head">
        <div><h2 className="card-title">Visitantes por dia</h2><p className="card-sub">Cada pessoa conta uma vez por dia, no horário da loja.</p></div>
      </div>
      <div className="chartbox">
        <div className="chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
        <ol className="bars" aria-label="Visitantes por dia" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`, gap: dias.length <= 7 ? 12 : 3 }}>
          {dias.map((x, i) => {
            const hoje = i === dias.length - 1;
            const rotulo = hoje ? "Hoje" : dataCurta(x.dia);
            return (
              <li key={x.dia} className="bar-col" aria-label={`${rotulo}: ${n(x.visitantes)} ${x.visitantes === 1 ? "visitante" : "visitantes"}, ${n(x.visitas)} páginas vistas`}>
                {(dias.length <= 7 || hoje) && <span className="bar-value" aria-hidden="true">{n(x.visitantes)}</span>}
                <div className={`bar${hoje ? " today" : ""}`} style={{ height: `${Math.max(2, Math.round((x.visitantes / maior) * 100))}%` }} aria-hidden="true" />
                <small aria-hidden="true">{(dias.length - 1 - i) % passo === 0 ? rotulo : " "}</small>
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}

function Paginas({ paginas }: { paginas: Trafego["paginas"] }) {
  return (
    <article className="card list-card">
      <h2 className="card-title">Páginas mais vistas</h2>
      <p className="card-sub">As 10 com mais visitas no período.</p>
      {paginas.length === 0 ? <p className="dc-vazio">Nenhuma visita no período.</p> : (
        <ol className="rank-list">
          {paginas.map((p, i) => {
            const { nome, meta } = nomeDaPagina(p);
            return (
              <li key={p.caminho} className="rank-row">
                <span className="rank-no">{i + 1}</span>
                <div><div className="rank-name">{nome}</div><div className="rank-meta">{meta}</div></div>
                <span className="rank-val">{n(p.visitas)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

function Barra({ rotulo, valor, total, cor }: { rotulo: string; valor: number; total: number; cor: string }) {
  return (
    <div className="mix-row">
      <b>{rotulo}</b>
      <div className="mix-track" aria-hidden="true"><div className={`mix-fill ${cor}`} style={{ width: `${pct(valor, total)}%` }} /></div>
      <strong>{pct(valor, total)}%</strong>
    </div>
  );
}

function Origens({ origens }: { origens: Trafego["origens"] }) {
  const total = origens.reduce((a, o) => a + o.entradas, 0);
  return (
    <article className="card list-card">
      <h2 className="card-title">De onde vieram</h2>
      <p className="card-sub">A primeira página de cada visita: pelo link com utm_source ou pelo site anterior.</p>
      {total === 0 ? <p className="dc-vazio">Nenhuma visita no período.</p> : (
        <div className="compact-list">
          {origens.map((o) => (
            <div key={o.origem}>
              <Barra rotulo={ORIGENS_VISITA[o.origem as keyof typeof ORIGENS_VISITA]?.replace(/ \(.*\)$/, "") ?? o.origem} valor={o.entradas} total={total} cor="pink" />
            </div>
          ))}
          <p className="card-sub">{n(total)} {total === 1 ? "entrada" : "entradas"} no período.</p>
        </div>
      )}
    </article>
  );
}

function Aparelhos({ a }: { a: Trafego["aparelhos"] }) {
  const total = a.celular + a.tablet + a.computador;
  return (
    <article className="card list-card">
      <h2 className="card-title">Aparelho</h2>
      <p className="card-sub">Visitantes por aparelho no período.</p>
      {total === 0 ? <p className="dc-vazio">Nenhuma visita no período.</p> : (
        <div className="compact-list">
          <Barra rotulo="Celular" valor={a.celular} total={total} cor="green" />
          <Barra rotulo="Computador" valor={a.computador} total={total} cor="blue" />
          <Barra rotulo="Tablet" valor={a.tablet} total={total} cor="violet" />
        </div>
      )}
    </article>
  );
}
