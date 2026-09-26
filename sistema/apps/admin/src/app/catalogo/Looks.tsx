"use client";

import { useState } from "react";
import { chamarApi } from "@/lib/api";
import { urlFoto } from "@/lib/catalogo";
import type { Look } from "@/lib/tiposCatalogo";
import { Icone } from "../_painel/Casca";
import { SeletorProdutos } from "../_painel/SeletorProdutos";
import { Botao, Campo, Carregando, Marcar, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { useTodosProdutos } from "../_painel/useTodosProdutos";
import { EnvioFoto } from "./EnvioFoto";

// Looks (D20): uma foto com as peças que aparecem nela ("Você faz o look" e a campanha).
export function Looks() {
  const { dados, erro, recarregar } = useDados<Look[]>("v1/admin/looks");
  const [editando, setEditando] = useState<Look | "novo" | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const apagar = useEnvio(() => { setApagando(null); void recarregar(); });

  if (!dados) return <Carregando erro={erro} />;
  return (
    <>
      <div className="actions" style={{ marginBottom: 16 }}><Botao onClick={() => setEditando("novo")}>Novo look</Botao></div>
      {editando && <FormLook look={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); void recarregar(); }} />}
      {dados.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Nenhum look ainda.</p>}
      <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {dados.map((l) => (
          <li key={l.id} className="row">
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage */}
            <img className="thumb" src={urlFoto(l.foto.caminho)} alt="" />
            <div style={{ minWidth: 0 }}>
              <b>{l.titulo}</b>
              <div className="meta">{l.produtos.length} {l.produtos.length === 1 ? "peça" : "peças"}: {l.produtos.map((p) => p.nome).join(", ") || "nenhuma"} · ordem {l.posicao}</div>
              <div style={{ marginTop: 7 }}>{l.ativo ? <Selo tom="paid">Ativo</Selo> : <Selo tom="expired">Inativo</Selo>}</div>
            </div>
            <div className="mini-actions">
              <Botao variante="ghost" onClick={() => setEditando(l)} aria-label={`Editar ${l.titulo}`}>Editar</Botao>
              {apagando === l.id
                ? <Botao variante="danger" carregando={apagar.ocupado} onClick={() => void apagar.enviar(chamarApi(`v1/admin/looks/${l.id}`, undefined, "DELETE"))}>Confirmar: apagar</Botao>
                : <Botao variante="ghost" onClick={() => setApagando(l.id)} aria-label={`Apagar ${l.titulo}`}><Icone><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></Icone></Botao>}
            </div>
          </li>
        ))}
      </ul>
      {apagar.erro && <p role="alert" className="field-error">{apagar.erro}</p>}
    </>
  );
}

function FormLook({ look, aoFechar, aoSalvar }: { look: Look | null; aoFechar: () => void; aoSalvar: () => void }) {
  const { produtos, erro: erroProdutos } = useTodosProdutos();
  const [foto, setFoto] = useState<string | null>(look?.foto.caminho ?? null);
  const [marcados, setMarcados] = useState<string[]>(look?.produtos.map((p) => p.id) ?? []);
  const { ocupado, erro, setErro, enviar } = useEnvio(aoSalvar);

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const titulo = String(f.get("titulo") ?? "").trim();
    const alt = String(f.get("alt") ?? "").trim();
    if (!titulo) return setErro("Dê um título ao look.");
    if (!foto || !alt) return setErro("Envie a foto e descreva o que aparece nela.");
    // O ponto de cada peça na foto fica no centro; a loja mostra a lista das peças do look.
    const antigos = new Map(look?.produtos.map((p) => [p.id, p]) ?? []);
    const corpo = {
      titulo, foto: { caminho: foto, alt }, posicao: Number(f.get("posicao") ?? 0) || 0, ativo: f.get("ativo") === "on",
      produtos: marcados.map((id) => ({ produtoId: id, x: antigos.get(id)?.x ?? 0.5, y: antigos.get(id)?.y ?? 0.5 })),
    };
    void enviar(look ? chamarApi(`v1/admin/looks/${look.id}`, corpo, "PUT") : chamarApi("v1/admin/looks", corpo));
  }

  return (
    <section className="card" style={{ marginBottom: 16 }} aria-label={look ? `Editar ${look.titulo}` : "Novo look"}>
      <h2>{look ? `Editar ${look.titulo}` : "Novo look"}</h2>
      <form className="form-grid" onSubmit={salvar} noValidate>
        <Campo name="titulo" rotulo="Título" maxLength={60} defaultValue={look?.titulo ?? ""} placeholder="Ex.: Denim" />
        <Campo name="posicao" rotulo="Ordem" inputMode="numeric" maxLength={4} defaultValue={String(look?.posicao ?? 0)} />
        <div className="full"><EnvioFoto destino="look" caminho={foto} aoEnviar={setFoto} rotulo="Foto do look" /></div>
        <div className="full"><Campo name="alt" rotulo="Descrição da foto" maxLength={200} defaultValue={look?.foto.alt ?? ""} placeholder="Ex.: Limone Amalfi Coast com jeans e sandália" /></div>
        <div className="full"><SeletorProdutos produtos={produtos} erro={erroProdutos} marcados={marcados} aoMudar={setMarcados} legenda="Peças do look" /></div>
        <div className="full"><Marcar name="ativo" rotulo="Look ativo" defaultChecked={look?.ativo ?? true} /></div>
        {erro && <p role="alert" className="field-error full">{erro}</p>}
        <div className="actions full">
          <Botao type="submit" carregando={ocupado}>Salvar look</Botao>
          <Botao variante="link" onClick={aoFechar}>Cancelar</Botao>
        </div>
      </form>
    </section>
  );
}
