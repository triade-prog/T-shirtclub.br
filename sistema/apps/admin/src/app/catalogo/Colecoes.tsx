"use client";

import { useState } from "react";
import { chamarApi } from "@/lib/api";
import { paraSlug, urlFoto } from "@/lib/catalogo";
import { CORES, type Colecao } from "@/lib/tiposCatalogo";
import { Icone } from "../_painel/Casca";
import { Botao, Campo, Carregando, Escolha, Marcar, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { EnvioFoto } from "./EnvioFoto";

// Coleções (D20): nome, slug, texto curto, cor entre as 5 aprovadas, capa, ordem e ativa.
export function Colecoes() {
  const { dados, erro, recarregar } = useDados<Colecao[]>("v1/admin/collections");
  const [editando, setEditando] = useState<Colecao | "nova" | null>(null);

  if (!dados) return <Carregando erro={erro} />;
  return (
    <>
      <div className="actions" style={{ marginBottom: 16 }}>
        <Botao onClick={() => setEditando("nova")}>Nova coleção</Botao>
      </div>
      {editando && <FormColecao colecao={editando === "nova" ? null : editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); void recarregar(); }} />}
      <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {dados.map((c) => (
          <li key={c.id} className="row">
            {c.capa
              // eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage
              ? <img className="thumb" src={urlFoto(c.capa.caminho)} alt="" />
              : <span className="thumb"><Icone><path d="M4 6h16v12H4Z" /></Icone></span>}
            <div style={{ minWidth: 0 }}>
              <b><span className="swatch" style={{ background: CORES.find((x) => x[0] === c.cor)?.[2] }} aria-hidden="true" />{c.nome}</b>
              <div className="meta">/colecao/{c.slug} · {CORES.find((x) => x[0] === c.cor)?.[1]} · {c.produtos} {c.produtos === 1 ? "peça" : "peças"} · ordem {c.posicao}</div>
              <div style={{ marginTop: 7 }}>{c.ativa ? <Selo tom="paid">Ativa</Selo> : <Selo tom="expired">Inativa</Selo>}</div>
            </div>
            <Botao variante="ghost" onClick={() => setEditando(c)} aria-label={`Editar ${c.nome}`}>Editar</Botao>
          </li>
        ))}
      </ul>
    </>
  );
}

function FormColecao({ colecao, aoFechar, aoSalvar }: { colecao: Colecao | null; aoFechar: () => void; aoSalvar: () => void }) {
  const [nome, setNome] = useState(colecao?.nome ?? "");
  const [slug, setSlug] = useState(colecao?.slug ?? "");
  const [capa, setCapa] = useState<string | null>(colecao?.capa?.caminho ?? null);
  const { ocupado, erro, setErro, enviar } = useEnvio(aoSalvar);

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const alt = String(f.get("alt") ?? "").trim();
    if (!nome.trim() || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return setErro("Confira o nome e o endereço (só letras sem acento, números e hífen).");
    if (capa && !alt) return setErro("Descreva a capa para quem usa leitor de tela.");
    const corpo = {
      nome: nome.trim(), slug, descricao: String(f.get("descricao") ?? "").trim() || null,
      chamada: String(f.get("chamada") ?? "").trim() || null, cor: String(f.get("cor")),
      capa: capa ? { caminho: capa, alt } : null, posicao: Number(f.get("posicao") ?? 0) || 0, ativa: f.get("ativa") === "on",
    };
    void enviar(colecao ? chamarApi(`v1/admin/collections/${colecao.id}`, corpo, "PUT") : chamarApi("v1/admin/collections", corpo));
  }

  return (
    <section className="card" style={{ marginBottom: 16 }} aria-label={colecao ? `Editar ${colecao.nome}` : "Nova coleção"}>
      <h2>{colecao ? `Editar ${colecao.nome}` : "Nova coleção"}</h2>
      <form className="form-grid" onSubmit={salvar} noValidate>
        <Campo name="nome" rotulo="Nome" maxLength={60} value={nome} onChange={(e) => { setNome(e.target.value); if (!colecao) setSlug(paraSlug(e.target.value)); }} />
        <Campo name="slug" rotulo="Endereço (/colecao/…)" maxLength={80} value={slug} onChange={(e) => setSlug(paraSlug(e.target.value))} />
        <div className="full"><Campo name="descricao" rotulo="Texto curto (opcional)" maxLength={160} defaultValue={colecao?.descricao ?? ""} /></div>
        <div className="full"><Campo name="chamada" rotulo="Chamada da faixa verde (opcional)" maxLength={120} defaultValue={colecao?.chamada ?? ""}
          ajuda="Uma frase sobre o universo da coleção, sem repetir o nome. Ex.: Limões, listras e o verão italiano que não acaba." /></div>
        <Escolha name="cor" rotulo="Cor da coleção" defaultValue={colecao?.cor ?? "LIMAO"} opcoes={CORES.map(([v, t]) => [v, t] as const)} ajuda="Só as 5 cores aprovadas (D18)." />
        <Campo name="posicao" rotulo="Ordem" inputMode="numeric" maxLength={4} defaultValue={String(colecao?.posicao ?? 0)} />
        <div className="full"><EnvioFoto destino="colecao" caminho={capa} aoEnviar={setCapa} rotulo="Capa" /></div>
        {capa && <div className="full"><Campo name="alt" rotulo="Descrição da capa" maxLength={200} defaultValue={colecao?.capa?.alt ?? ""} /></div>}
        <div className="full"><Marcar name="ativa" rotulo="Coleção ativa (aparece na loja)" defaultChecked={colecao?.ativa ?? true} /></div>
        {erro && <p role="alert" className="field-error full">{erro}</p>}
        <div className="actions full">
          <Botao type="submit" carregando={ocupado}>Salvar coleção</Botao>
          <Botao variante="link" onClick={aoFechar}>Cancelar</Botao>
        </div>
      </form>
    </section>
  );
}
