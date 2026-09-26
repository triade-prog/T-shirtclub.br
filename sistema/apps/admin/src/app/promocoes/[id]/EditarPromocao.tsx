"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { chamarApi } from "@/lib/api";
import { deCampoData, paraCampoData, paraCentavos, paraReais } from "@/lib/catalogo";
import { TIPOS_PROMOCAO, type Promocao, type TipoPromocao } from "@/lib/tiposCatalogo";
import { Casca } from "../../_painel/Casca";
import { SeletorProdutos } from "../../_painel/SeletorProdutos";
import { Aviso, Botao, Campo, Carregando, Escolha, Marcar } from "../../_painel/ui";
import { useDados } from "../../_painel/useDados";
import { useEnvio } from "../../_painel/useEnvio";
import { useTodosProdutos } from "../../_painel/useTodosProdutos";

// Criar ou editar promoção (telas 15 a 17). A API confere tudo de novo (promocaoEntradaSchema)
// e recusa promoções que se sobrepõem (PROMOTION_OVERLAP).

export function EditarPromocao({ id, tipoNovo }: { id: string | null; tipoNovo: TipoPromocao }) {
  const lista = useDados<Promocao[]>(id ? "v1/admin/promotions" : null);
  const existente = id ? lista.dados?.find((p) => p.id === id) : null;
  if (id && !existente) {
    return <Casca kicker="PROMOÇÕES" titulo="Promoção"><Carregando erro={lista.erro ?? (lista.dados ? "Promoção não encontrada." : null)} /></Casca>;
  }
  return <Formulario promocao={existente ?? null} tipo={existente?.tipo ?? tipoNovo} />;
}

interface Nivel { qtdMin: string; pct: string }

function Formulario({ promocao: p, tipo }: { promocao: Promocao | null; tipo: TipoPromocao }) {
  const router = useRouter();
  const { produtos, erro: erroProdutos } = useTodosProdutos();
  const [agora] = useState(() => new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toISOString());
  const [escopo, setEscopo] = useState(p?.escopo ?? "TODOS");
  const [marcados, setMarcados] = useState<string[]>(
    p ? (Array.isArray(p.produtos) ? p.produtos : Object.keys(p.produtos)) : []);
  const [descontos, setDescontos] = useState<Record<string, { modo: "PERCENTUAL" | "PRECO_FIXO"; valor: string }>>(
    p && !Array.isArray(p.produtos)
      ? Object.fromEntries(Object.entries(p.produtos).map(([k, v]) => [k, { modo: v.modo, valor: v.modo === "PERCENTUAL" ? String(v.valor) : paraReais(v.valor) }]))
      : {});
  const [modoCompre, setModoCompre] = useState(p?.modo === "NIVEIS" ? "NIVEIS" : "PRECO_POR_GRUPO");
  const [niveis, setNiveis] = useState<Nivel[]>(p?.niveis?.map((n) => ({ qtdMin: String(n.qtdMin), pct: String(n.pct) })) ?? [{ qtdMin: "2", pct: "10" }]);
  const [modoCupom, setModoCupom] = useState(tipo === "CUPOM" && p?.modo === "VALOR" ? "VALOR" : "PERCENTUAL");
  const { ocupado, erro, setErro, enviar } = useEnvio(() => router.replace("/promocoes"));

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const txt = (k: string) => String(f.get(k) ?? "").trim();
    const inicio = deCampoData(txt("inicio"));
    const fim = deCampoData(txt("fim"));
    if (!txt("nome")) return setErro("Dê um nome à promoção.");
    if (!inicio || !fim || Date.parse(fim) <= Date.parse(inicio)) return setErro("Confira o período: o fim vem depois do início.");
    const base = { tipo, nome: txt("nome"), inicio, fim };
    let corpo: Record<string, unknown>;

    if (tipo === "DESCONTO_PRODUTO") {
      if (marcados.length === 0) return setErro("Escolha pelo menos uma peça.");
      const itens = [];
      for (const id of marcados) {
        const d = descontos[id] ?? { modo: "PERCENTUAL", valor: "" };
        const valor = d.modo === "PERCENTUAL" ? Number(d.valor) : paraCentavos(d.valor);
        const nome = produtos?.find((x) => x.id === id)?.nome ?? "uma peça";
        if (!valor || !Number.isInteger(valor) || (d.modo === "PERCENTUAL" && (valor < 1 || valor > 90))) return setErro(`Confira o desconto de ${nome} (1 a 90% ou o preço em reais).`);
        itens.push({ produtoId: id, modo: d.modo, valor });
      }
      corpo = { ...base, produtos: itens };
    } else {
      if (escopo === "ESPECIFICOS" && marcados.length === 0) return setErro("Escolha as peças ou marque “todas as peças”.");
      const escopoCorpo = { escopo, produtos: escopo === "ESPECIFICOS" ? marcados.map((produtoId) => ({ produtoId })) : [] };
      if (tipo === "COMPRE_MAIS") {
        const orcamento = txt("orcamento") ? paraCentavos(txt("orcamento")) : null;
        if (txt("orcamento") && !orcamento) return setErro("Confira o orçamento, em reais.");
        if (modoCompre === "PRECO_POR_GRUPO") {
          const qtd = Number(txt("grupoQtd"));
          const preco = paraCentavos(txt("grupoPreco"));
          if (!Number.isInteger(qtd) || qtd < 2 || qtd > 9 || !preco) return setErro("O grupo tem de 2 a 9 peças e um preço, como 3 por 119,99.");
          corpo = { ...base, ...escopoCorpo, modo: modoCompre, grupo: { qtd, precoCentavos: preco }, niveis: [], umaPorCliente: f.get("umaPorCliente") === "on", orcamentoCentavos: orcamento };
        } else {
          const ns = niveis.map((n) => ({ qtdMin: Number(n.qtdMin), pct: Number(n.pct) }));
          const ok = ns.every((n, i) => Number.isInteger(n.qtdMin) && n.qtdMin >= 2 && n.qtdMin <= 9 && Number.isInteger(n.pct) && n.pct >= 1 && n.pct <= 90
            && (i === 0 || (n.qtdMin > ns[i - 1]!.qtdMin && n.pct > ns[i - 1]!.pct)));
          if (!ok) return setErro("Cada nível pede mais peças (2 a 9) e dá mais desconto (1 a 90%) que o anterior.");
          corpo = { ...base, ...escopoCorpo, modo: modoCompre, niveis: ns, grupo: null, umaPorCliente: f.get("umaPorCliente") === "on", orcamentoCentavos: orcamento };
        }
      } else {
        const codigo = txt("codigo").toUpperCase();
        const valor = modoCupom === "PERCENTUAL" ? Number(txt("valor")) : paraCentavos(txt("valor"));
        const max = txt("maximo") ? paraCentavos(txt("maximo")) : null;
        const minimo = txt("minimo") ? paraCentavos(txt("minimo")) : null;
        const total = Number(txt("quantidade"));
        const porCliente = Number(txt("porCliente") || "1");
        const dias = Number(txt("validade"));
        if (!/^[A-Z0-9]{4,20}$/.test(codigo)) return setErro("O código do cupom tem de 4 a 20 letras ou números, como BEMVINDA10.");
        if (!valor || !Number.isInteger(valor) || (modoCupom === "PERCENTUAL" && valor > 90)) return setErro("Confira o valor do desconto.");
        if (!Number.isInteger(total) || total < 1) return setErro("Quantos cupons podem ser usados no total?");
        if (!Number.isInteger(dias) || dias < 1 || dias > 90) return setErro("A validade depois de digitado é de 1 a 90 dias.");
        corpo = { ...base, ...escopoCorpo, cupom: {
          codigo, modo: modoCupom, valor, descontoMaximoCentavos: modoCupom === "PERCENTUAL" ? max : null, gastoMinimoCentavos: minimo,
          quantidadeTotal: total, limitePorCliente: porCliente, validadeDias: dias,
        } };
      }
    }
    void enviar(p ? chamarApi(`v1/admin/promotions/${p.id}`, corpo, "PUT") : chamarApi("v1/admin/promotions", corpo));
  }

  return (
    <Casca kicker="PROMOÇÕES" topo={p ? p.nome : TIPOS_PROMOCAO[tipo]}
      titulo={<>{p ? "Editar" : tipo === "CUPOM" ? "Novo" : "Nova"} <em style={{ color: "var(--pink-dark)" }}>{TIPOS_PROMOCAO[tipo].toLowerCase()}</em></>}
      sub={tipo === "COMPRE_MAIS" ? "O “Monte seu Club” é um preço por grupo: 3 por R$ 119,99 (D19)." : tipo === "CUPOM" ? "A cliente digita o código na reserva; vale só se for a promoção mais vantajosa." : "Preço menor ou porcentagem de desconto em peças escolhidas."}
      acoes={<Link className="btn btn-ghost" href="/promocoes">← Promoções</Link>}>
      <form className="grid" onSubmit={salvar} noValidate>
        <article className="card">
          <h2>Nome e período</h2>
          <div className="form-grid form-grid3">
            <Campo name="nome" rotulo="Nome" maxLength={50} defaultValue={p?.nome ?? (tipo === "COMPRE_MAIS" ? "Monte seu Club" : "")} />
            <Campo name="inicio" rotulo="Começa (horário de Brasília)" type="datetime-local" defaultValue={paraCampoData(p?.inicio ?? agora)} />
            <Campo name="fim" rotulo="Termina" type="datetime-local" defaultValue={paraCampoData(p?.fim)} />
          </div>
        </article>

        {tipo === "COMPRE_MAIS" && (
          <article className="card">
            <h2>Regra</h2>
            <div className="form-grid">
              <Escolha name="modo" rotulo="Como funciona" value={modoCompre} onChange={(e) => setModoCompre(e.target.value)}
                opcoes={[["PRECO_POR_GRUPO", "Preço por grupo (3 por R$ 119,99)"], ["NIVEIS", "Níveis de desconto (%)"]]} />
              <Campo name="orcamento" rotulo="Orçamento total (R$, opcional)" inputMode="decimal" maxLength={12} defaultValue={paraReais(p?.orcamento?.totalCentavos)}
                ajuda="Quando o desconto dado chega aqui, a promoção para sozinha." />
              {modoCompre === "PRECO_POR_GRUPO" ? (
                <>
                  <Campo name="grupoQtd" rotulo="Peças no grupo" inputMode="numeric" maxLength={1} defaultValue={String(p?.grupo?.qtd ?? 3)} />
                  <Campo name="grupoPreco" rotulo="Preço do grupo (R$)" inputMode="decimal" maxLength={10} defaultValue={paraReais(p?.grupo?.precoCentavos) || "119,99"}
                    ajuda="As peças que sobram pagam o preço normal." />
                </>
              ) : (
                <div className="full grid" style={{ gap: 10 }}>
                  {niveis.map((n, i) => (
                    <div key={i} className="form-grid form-grid3" style={{ alignItems: "end" }}>
                      <Campo rotulo={`Nível ${i + 1}: a partir de (peças)`} inputMode="numeric" maxLength={1} value={n.qtdMin}
                        onChange={(e) => setNiveis(niveis.map((x, j) => (j === i ? { ...x, qtdMin: e.target.value } : x)))} />
                      <Campo rotulo="Desconto (%)" inputMode="numeric" maxLength={2} value={n.pct}
                        onChange={(e) => setNiveis(niveis.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
                      {niveis.length > 1 && <Botao variante="ghost" onClick={() => setNiveis(niveis.filter((_, j) => j !== i))}>Tirar nível</Botao>}
                    </div>
                  ))}
                  {niveis.length < 3 && <div><Botao variante="ghost" onClick={() => setNiveis([...niveis, { qtdMin: "", pct: "" }])}>Acrescentar nível</Botao></div>}
                </div>
              )}
              <div className="full"><Marcar name="umaPorCliente" rotulo="Uma vez por cliente (pelo telefone)" defaultChecked={p?.umaPorCliente ?? false} /></div>
            </div>
          </article>
        )}

        {tipo === "CUPOM" && (
          <article className="card">
            <h2>Cupom</h2>
            <div className="form-grid form-grid3">
              <Campo name="codigo" rotulo="Código" maxLength={20} defaultValue={p?.codigo ?? ""} placeholder="BEMVINDA10" style={{ textTransform: "uppercase" }} />
              <Escolha name="modoCupom" rotulo="Tipo de desconto" value={modoCupom} onChange={(e) => setModoCupom(e.target.value)} opcoes={[["PERCENTUAL", "Porcentagem (%)"], ["VALOR", "Valor fixo (R$)"]]} />
              <Campo name="valor" rotulo={modoCupom === "PERCENTUAL" ? "Desconto (%)" : "Desconto (R$)"} inputMode="decimal" maxLength={10}
                defaultValue={p?.valor ? (modoCupom === "PERCENTUAL" ? String(p.valor) : paraReais(p.valor)) : ""} />
              {modoCupom === "PERCENTUAL" && <Campo name="maximo" rotulo="Desconto máximo (R$, opcional)" inputMode="decimal" maxLength={10} defaultValue={paraReais(p?.descontoMaximoCentavos)} />}
              <Campo name="minimo" rotulo="Gasto mínimo (R$, opcional)" inputMode="decimal" maxLength={10} defaultValue={paraReais(p?.gastoMinimoCentavos)} />
              <Campo name="quantidade" rotulo="Usos no total" inputMode="numeric" maxLength={7} defaultValue={String(p?.quantidadeTotal ?? 100)} />
              <Campo name="porCliente" rotulo="Usos por cliente" inputMode="numeric" maxLength={2} defaultValue={String(p?.limitePorCliente ?? 1)} />
              <Campo name="validade" rotulo="Vale por (dias, depois de usado a 1ª vez)" inputMode="numeric" maxLength={2} defaultValue={String(p?.validadeDias ?? 30)} />
            </div>
          </article>
        )}

        <article className="card">
          <h2>Peças</h2>
          {tipo === "DESCONTO_PRODUTO" ? (
            <>
              <SeletorProdutos produtos={produtos} erro={erroProdutos} marcados={marcados} aoMudar={setMarcados} legenda="Peças com desconto" />
              {marcados.length > 0 && (
                <div className="list" style={{ marginTop: 14 }}>
                  {marcados.map((id) => {
                    const prod = produtos?.find((x) => x.id === id);
                    const d = descontos[id] ?? { modo: "PERCENTUAL" as const, valor: "" };
                    const mudar = (parte: Partial<typeof d>) => setDescontos({ ...descontos, [id]: { ...d, ...parte } });
                    return (
                      <div key={id} className="form-grid form-grid3" style={{ alignItems: "end" }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>{prod?.nome ?? "Peça"}<span className="muted"> · {prod ? formatarReais(prod.precoCentavos) : ""}</span></p>
                        <Escolha rotulo="Desconto" value={d.modo} onChange={(e) => mudar({ modo: e.target.value as typeof d.modo })} opcoes={[["PERCENTUAL", "Porcentagem"], ["PRECO_FIXO", "Preço promocional"]]} />
                        <Campo rotulo={d.modo === "PERCENTUAL" ? "Desconto (%)" : "Preço promocional (R$)"} inputMode="decimal" maxLength={10} value={d.valor} onChange={(e) => mudar({ valor: e.target.value })} />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="actions">
                <label className="check"><input type="radio" name="escopo" checked={escopo === "TODOS"} onChange={() => setEscopo("TODOS")} /> Todas as peças</label>
                <label className="check"><input type="radio" name="escopo" checked={escopo === "ESPECIFICOS"} onChange={() => setEscopo("ESPECIFICOS")} /> Só algumas peças</label>
              </div>
              {escopo === "ESPECIFICOS" && <SeletorProdutos produtos={produtos} erro={erroProdutos} marcados={marcados} aoMudar={setMarcados} legenda="Peças da promoção" />}
            </>
          )}
        </article>

        {erro && <Aviso tipo="error" titulo={erro} />}
        <div className="actions">
          <Botao type="submit" carregando={ocupado}>{p ? "Salvar a promoção" : "Criar a promoção"}</Botao>
          <Link className="btn btn-ghost" href="/promocoes">Cancelar</Link>
        </div>
      </form>
    </Casca>
  );
}
