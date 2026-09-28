"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { urlFoto } from "@/lib/catalogo";
import { NOME_TAMANHO, type Colecao, type PaginaProdutos } from "@/lib/tiposCatalogo";
import { Casca, Icone } from "../_painel/Casca";
import { Botao, Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { Colecoes } from "./Colecoes";
import { Looks } from "./Looks";
import { BlocosInicio } from "./BlocosInicio";

const ABAS = [["produtos", "Produtos"], ["colecoes", "Coleções"], ["looks", "Looks"], ["inicio", "Página inicial"]] as const;

export function Catalogo() {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const aba = busca.get("aba") ?? "produtos";

  return (
    <Casca kicker="LOJA" titulo={<>Catálogo <em style={{ color: "var(--pink-dark)" }}>da loja</em></>}
      sub="Peças, coleções, looks e o que aparece na página inicial."
      acoes={aba === "produtos" ? <Link className="btn btn-dark" href="/catalogo/produtos/novo">Nova peça</Link>
        : aba === "colecoes" ? <Link className="btn btn-dark" href="/catalogo/colecoes/nova">Nova coleção</Link> : undefined}>
      <nav className="tabs" aria-label="Partes do catálogo">
        {ABAS.map(([v, rotulo]) => (
          <button key={v} type="button" className={`tab${aba === v ? " active" : ""}`} aria-pressed={aba === v}
            onClick={() => router.replace(v === "produtos" ? caminho : `${caminho}?aba=${v}`)}>{rotulo}</button>
        ))}
      </nav>
      {aba === "colecoes" ? <Colecoes /> : aba === "looks" ? <Looks /> : aba === "inicio" ? <BlocosInicio /> : <Produtos />}
    </Casca>
  );
}

function Produtos() {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const q = busca.get("q") ?? "";
  const colecao = busca.get("colecao") ?? "";
  const pagina = Number(busca.get("pagina") ?? "1") || 1;
  const consulta = new URLSearchParams({ ...(q && { q }), ...(colecao && { colecao }), pagina: String(pagina) });
  const { dados, erro } = useDados<PaginaProdutos>(`v1/admin/products?${consulta}`);
  const colecoes = useDados<Colecao[]>("v1/admin/collections");
  const nomeColecao = (id: string) => colecoes.dados?.find((c) => c.id === id)?.nome ?? "";
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

  function ir(mudar: Record<string, string>) {
    const u = new URLSearchParams({ ...(q && { q }), ...(colecao && { colecao }), ...mudar });
    for (const [k, v] of [...u]) if (!v) u.delete(k);
    router.replace(`${caminho}?${u}`);
  }

  return (
    <>
      <section className="card flat">
        <form role="search" className="form-row" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          ir({ q: String(f.get("q") ?? "").trim(), colecao: String(f.get("colecao") ?? ""), pagina: "" });
        }}>
          <div className="field"><label htmlFor="q">Nome ou código</label><input className="input" id="q" name="q" defaultValue={q} maxLength={80} placeholder="Ex.: Limone ou LIM-01" /></div>
          <div className="field">
            <label htmlFor="colecao">Coleção</label>
            <select className="select" id="colecao" name="colecao" defaultValue={colecao} onChange={(e) => ir({ colecao: e.target.value, pagina: "" })}>
              <option value="">Todas</option>
              {(colecoes.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <Botao type="submit"><Icone><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icone> Buscar</Botao>
        </form>
      </section>
      {!dados ? <div style={{ marginTop: 20 }}><Carregando erro={erro} /></div> : (
        <>
          <div className="section-title"><h2>{dados.total} {dados.total === 1 ? "peça" : "peças"}</h2><span>Em ordem de nome</span></div>
          {dados.itens.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Nenhuma peça encontrada.</p> : (
            <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {dados.itens.map((p) => (
                <li key={p.id}>
                  <Link className="row" href={`/catalogo/produtos/${p.id}`}>
                    {p.capa
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage
                      ? <img className="thumb" src={urlFoto(p.capa.caminho)} alt="" />
                      : <span className="thumb"><Icone><path d="m8 4 4 2 4-2 5 3-3 5-2-1v9H8v-9l-2 1-3-5Z" /></Icone></span>}
                    <div style={{ minWidth: 0 }}>
                      <b>{p.nome}</b>
                      <div className="meta">{p.codigo} · {nomeColecao(p.colecaoId)} · {formatarReais(p.precoCentavos)} · {p.fotos} {p.fotos === 1 ? "foto" : "fotos"}</div>
                      <div style={{ display: "flex", gap: 7, marginTop: 7, flexWrap: "wrap" }}>
                        {!p.ativo ? <Selo tom="expired">Inativa</Selo> : p.publicado ? <Selo tom="paid">Publicada</Selo> : <Selo tom="reserved">Rascunho</Selo>}
                        {p.fotos === 0 && <Selo tom="issue">Sem foto</Selo>}
                      </div>
                    </div>
                    <div className="res-side">
                      <div className="amount">{p.estoque.disponivel} disponíveis</div>
                      <div className="date">{p.tamanhos.filter((t) => t.ativa).map((t) => `${NOME_TAMANHO[t.tamanho]} ${t.disponivel}`).join(" · ") || "Nenhum tamanho à venda"}</div>
                      <div className="date">{p.estoque.reservado} reservadas · {p.estoque.vendido} vendidas</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {paginas > 1 && (
            <nav aria-label="Páginas" className="actions" style={{ marginTop: 18, alignItems: "center" }}>
              <Botao variante="ghost" disabled={pagina <= 1} onClick={() => ir({ pagina: String(pagina - 1) })}>Anterior</Botao>
              <span style={{ fontSize: 11 }}>Página {pagina} de {paginas}</span>
              <Botao variante="ghost" disabled={pagina >= paginas} onClick={() => ir({ pagina: String(pagina + 1) })}>Próxima</Botao>
            </nav>
          )}
        </>
      )}
    </>
  );
}
