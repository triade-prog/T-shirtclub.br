"use client";

import Link from "next/link";
import { useState } from "react";
import { urlFoto } from "@/lib/catalogo";
import { Casca, Icone } from "../_painel/Casca";
import { AjusteEstoque } from "../_painel/AjusteEstoque";
import { Botao, Carregando, Selo } from "../_painel/ui";
import { useTodosProdutos } from "../_painel/useTodosProdutos";

type Filtro = "TODAS" | "BAIXO" | "ESGOTADAS";

export function Estoque() {
  const [versao, setVersao] = useState(0);
  const { produtos, erro } = useTodosProdutos(versao);
  const aoAjustar = () => setVersao((v) => v + 1);
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<string | null>(null);

  const q = busca.trim().toLowerCase();
  const lista = (produtos ?? [])
    .filter((p) => !q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
    .filter((p) => filtro === "TODAS" || (filtro === "ESGOTADAS" ? p.estoque.disponivel === 0 : p.estoque.disponivel > 0 && p.estoque.disponivel <= 2));
  const conta = (f: Filtro) => (produtos ?? []).filter((p) => f === "ESGOTADAS" ? p.estoque.disponivel === 0 : p.estoque.disponivel > 0 && p.estoque.disponivel <= 2).length;

  return (
    <Casca kicker="LOJA" titulo="Estoque" sub="Disponível = total − reservadas − vendidas. Todo ajuste pede motivo e fica na auditoria.">
      <div className="tabs" role="group" aria-label="Filtrar peças">
        {([["TODAS", "Todas"], ["BAIXO", "Últimas peças"], ["ESGOTADAS", "Esgotadas"]] as const).map(([v, rotulo]) => (
          <button key={v} type="button" className={`tab${filtro === v ? " active" : ""}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
            {rotulo}{v !== "TODAS" && conta(v) > 0 && <span className="n">{conta(v)}</span>}
          </button>
        ))}
      </div>
      <div className="field" style={{ maxWidth: 420, marginBottom: 16 }}>
        <label htmlFor="busca">Nome ou código</label>
        <input className="input" id="busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Limone" />
      </div>
      {!produtos ? <Carregando erro={erro} /> : lista.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Nenhuma peça neste filtro.</p> : (
        <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {lista.map((p) => (
            <li key={p.id} className="card flat" style={{ padding: 14 }}>
              <div className="row" style={{ border: 0, padding: 0 }}>
                {p.capa
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage
                  ? <img className="thumb" src={urlFoto(p.capa.caminho)} alt="" />
                  : <span className="thumb"><Icone><path d="m8 4 4 2 4-2 5 3-3 5-2-1v9H8v-9l-2 1-3-5Z" /></Icone></span>}
                <div style={{ minWidth: 0 }}>
                  <Link href={`/catalogo/produtos/${p.id}`}><b>{p.nome}</b></Link>
                  <div className="meta">{p.codigo} · total {p.estoque.total} · {p.estoque.reservado} reservadas · {p.estoque.vendido} vendidas</div>
                  <div style={{ marginTop: 7 }}>
                    {p.estoque.disponivel === 0 ? <Selo tom="expired">Esgotada</Selo> : p.estoque.disponivel <= 2 ? <Selo tom="issue">Últimas {p.estoque.disponivel}</Selo> : <Selo tom="paid">{p.estoque.disponivel} disponíveis</Selo>}
                  </div>
                </div>
                <Botao variante={abertos === p.id ? "dark" : "ghost"} aria-expanded={abertos === p.id} onClick={() => setAbertos(abertos === p.id ? null : p.id)}>Ajustar</Botao>
              </div>
              {abertos === p.id && <div style={{ marginTop: 14 }}><AjusteEstoque produtoId={p.id} nome={p.nome} aoAjustar={aoAjustar} /></div>}
            </li>
          ))}
        </ul>
      )}
    </Casca>
  );
}
