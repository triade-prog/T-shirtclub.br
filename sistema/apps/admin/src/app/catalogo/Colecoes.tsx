"use client";

import Link from "next/link";
import { urlFoto } from "@/lib/catalogo";
import { CORES, type Colecao } from "@/lib/tiposCatalogo";
import { Icone } from "../_painel/Casca";
import { Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Coleções (D20): a lista, na ordem da loja. Cada coleção abre a sua página
// (/catalogo/colecoes/[id], com o formulário e a prévia na loja), e "Nova coleção" abre a página
// vazia (28/09).
export function Colecoes() {
  const { dados, erro } = useDados<Colecao[]>("v1/admin/collections");

  if (!dados) return <Carregando erro={erro} />;
  return (
    <>
      <div className="section-title"><h2>{dados.length} {dados.length === 1 ? "coleção" : "coleções"}</h2><span>Na ordem da loja</span></div>
      {dados.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Nenhuma coleção ainda.</p> : (
        <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {dados.map((c) => (
            <li key={c.id}>
              <Link className="row" href={`/catalogo/colecoes/${c.id}`}>
                {c.capa
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage
                  ? <img className="thumb" src={urlFoto(c.capa.caminho)} alt="" />
                  : <span className="thumb"><Icone><path d="M4 6h16v12H4Z" /></Icone></span>}
                <div style={{ minWidth: 0 }}>
                  <b><span className="swatch" style={{ background: CORES.find((x) => x[0] === c.cor)?.[2] }} aria-hidden="true" />{c.nome}</b>
                  <div className="meta">/colecao/{c.slug} · {CORES.find((x) => x[0] === c.cor)?.[1]} · {c.produtos} {c.produtos === 1 ? "peça" : "peças"} · ordem {c.posicao}</div>
                  <div style={{ display: "flex", gap: 7, marginTop: 7, flexWrap: "wrap" }}>
                    <SelosColecao colecao={c} />
                    {!c.capa && <Selo tom="issue">Sem capa</Selo>}
                  </div>
                </div>
                <div className="res-side">
                  {c.campanha
                    ? <><div className="amount">{c.campanha}</div><div className="date">{c.campanhaAtiva ? "Campanha ligada" : "Campanha desligada"}</div></>
                    : <div className="date">Sem campanha</div>}
                  <div className="date">{c.fotoStory ? "Pick your story: foto escolhida" : "Pick your story: peça mais nova"}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Selos da coleção (28/09): se ela está na loja e, quando tem campanha, se a campanha está ligada.
 * São duas chaves diferentes: coleção ativa mostra a coleção; campanha ligada troca a página comum
 * pela de campanha.
 */
export function SelosColecao({ colecao: c }: { colecao: Colecao }) {
  return (
    <>
      {c.ativa ? <Selo tom="paid">Coleção ativa</Selo> : <Selo tom="expired">Coleção oculta</Selo>}
      {c.campanha && (c.campanhaAtiva ? <Selo tom="ship">Campanha ligada</Selo> : <Selo tom="reserved">Campanha desligada</Selo>)}
    </>
  );
}
