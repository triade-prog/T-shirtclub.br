"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { chamarApi, dataHora } from "@/lib/api";
import { TIPOS_PROMOCAO, type Promocao } from "@/lib/tiposCatalogo";
import { Casca } from "../_painel/Casca";
import { Botao, Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";

type Filtro = "ATIVA" | "AGENDADA" | "ENCERRADA" | "TODAS";

/** Resumo de uma linha: "3 por R$ 119,99", "10% a partir de 2", "BEMVINDA10 · 12 de 100 usados". */
export function resumo(p: Promocao): string {
  if (p.tipo === "DESCONTO_PRODUTO") {
    const n = Object.keys(p.produtos as Record<string, unknown>).length;
    return `${n} ${n === 1 ? "peça" : "peças"} com desconto`;
  }
  const escopo = p.escopo === "ESPECIFICOS" ? ` · ${(p.produtos as string[]).length} peças` : " · todas as peças";
  if (p.tipo === "COMPRE_MAIS") {
    const regra = p.grupo ? `${p.grupo.qtd} por ${formatarReais(p.grupo.precoCentavos)}` : (p.niveis ?? []).map((n) => `${n.pct}% a partir de ${n.qtdMin}`).join(" · ");
    return regra + escopo + (p.umaPorCliente ? " · uma vez por cliente" : "");
  }
  const valor = p.modo === "PERCENTUAL" ? `${p.valor}%` : formatarReais(p.valor ?? 0);
  return `${p.codigo} · ${valor} · ${p.quantidadeUsada ?? 0} de ${p.quantidadeTotal} usados${escopo}`;
}

export function Promocoes() {
  const { dados, erro, recarregar } = useDados<Promocao[]>("v1/admin/promotions");
  const [filtro, setFiltro] = useState<Filtro>("ATIVA");
  const [encerrando, setEncerrando] = useState<string | null>(null);
  const encerrar = useEnvio(() => { setEncerrando(null); void recarregar(); });
  const lista = (dados ?? []).filter((p) => filtro === "TODAS" || p.situacao === filtro);
  const conta = (f: Filtro) => (dados ?? []).filter((p) => p.situacao === f).length;

  return (
    <Casca kicker="VENDAS" titulo={<>Promo<em style={{ color: "var(--pink-dark)" }}>ções</em></>}
      sub="Vale só a promoção mais vantajosa para a cliente: os descontos não se somam."
      acoes={<>
        <Link className="btn btn-ghost" href="/promocoes/nova?tipo=DESCONTO_PRODUTO">Desconto na peça</Link>
        <Link className="btn btn-ghost" href="/promocoes/nova?tipo=COMPRE_MAIS">Compre e economize</Link>
        <Link className="btn btn-dark" href="/promocoes/nova?tipo=CUPOM">Novo cupom</Link>
      </>}>
      <div className="tabs" role="group" aria-label="Filtrar promoções">
        {([["ATIVA", "Ativas"], ["AGENDADA", "Agendadas"], ["ENCERRADA", "Encerradas"], ["TODAS", "Todas"]] as const).map(([v, rotulo]) => (
          <button key={v} type="button" className={`tab${filtro === v ? " active" : ""}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
            {rotulo}{v !== "TODAS" && conta(v) > 0 && <span className="n">{conta(v)}</span>}
          </button>
        ))}
      </div>
      {!dados ? <Carregando erro={erro} /> : lista.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Nenhuma promoção neste filtro.</p> : (
        <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {lista.map((p) => (
            <li key={p.id} className="card flat" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <span className="micro muted">{TIPOS_PROMOCAO[p.tipo]}</span>
                  <p style={{ fontFamily: "var(--font-fraunces)", fontSize: 22, fontWeight: 700, margin: "4px 0" }}>{p.nome}</p>
                  <p className="muted" style={{ fontSize: 11, margin: 0 }}>{resumo(p)}</p>
                  <p className="muted" style={{ fontSize: 10.5, margin: "4px 0 0" }}>
                    {dataHora(p.inicio)} até {dataHora(p.encerradaEm ?? p.fim)}
                    {p.orcamento ? ` · orçamento ${formatarReais(p.orcamento.usadoCentavos)} de ${formatarReais(p.orcamento.totalCentavos)}` : ""}
                  </p>
                </div>
                <Selo tom={p.situacao === "ATIVA" ? "paid" : p.situacao === "AGENDADA" ? "reserved" : "expired"}>
                  {p.situacao === "ATIVA" ? "Ativa" : p.situacao === "AGENDADA" ? "Agendada" : "Encerrada"}
                </Selo>
              </div>
              {p.situacao !== "ENCERRADA" && (
                <div className="actions" style={{ marginTop: 12 }}>
                  <Link className="btn btn-ghost" href={`/promocoes/${p.id}`}>Editar</Link>
                  {encerrando === p.id ? (
                    <>
                      <Botao variante="danger" carregando={encerrar.ocupado} onClick={() => void encerrar.enviar(chamarApi(`v1/admin/promotions/${p.id}/end`, {}))}>Confirmar: encerrar agora</Botao>
                      <Botao variante="link" onClick={() => setEncerrando(null)}>Voltar</Botao>
                    </>
                  ) : <Botao variante="ghost" onClick={() => setEncerrando(p.id)}>Encerrar</Botao>}
                </div>
              )}
              {encerrando === p.id && encerrar.erro && <p role="alert" className="field-error">{encerrar.erro}</p>}
            </li>
          ))}
        </ul>
      )}
    </Casca>
  );
}
