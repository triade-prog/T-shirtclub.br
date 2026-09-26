"use client";

import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import type { ProdutoLinha } from "@/lib/tiposCatalogo";

/** Escolha de várias peças com busca (looks, promoções). */
export function SeletorProdutos({ produtos, erro, marcados, aoMudar, legenda }: {
  produtos: ProdutoLinha[] | null; erro?: string | null; marcados: string[]; aoMudar: (ids: string[]) => void; legenda: string;
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const lista = (produtos ?? []).filter((p) => !q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "#625258", marginBottom: 7 }}>
        {legenda} ({marcados.length} {marcados.length === 1 ? "peça" : "peças"})
      </legend>
      <input className="input" type="search" aria-label="Buscar peça por nome ou código" placeholder="Buscar por nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="picker">
        {erro ? <p role="alert" className="field-error">{erro}</p> : !produtos ? <p className="loading">Carregando peças…</p> : lista.length === 0 ? <p className="loading">Nenhuma peça.</p> : lista.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={marcados.includes(p.id)}
              onChange={(e) => aoMudar(e.target.checked ? [...marcados, p.id] : marcados.filter((id) => id !== p.id))} />
            <span>{p.nome} <span className="muted">· {p.codigo} · {formatarReais(p.precoCentavos)}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
