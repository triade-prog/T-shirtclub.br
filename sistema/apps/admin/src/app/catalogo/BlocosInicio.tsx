"use client";

import { useEffect, useState } from "react";
import { chamarApi } from "@/lib/api";
import { TIPOS_BLOCO, type Bloco, type Colecao, type Look } from "@/lib/tiposCatalogo";
import { Botao, Carregando, Aviso } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";

// Página inicial da loja (D20): a lista de blocos, na ordem. Campanha aponta para um look;
// "Produtos" pode apontar para uma coleção. Salvar regrava a página inteira.
export function BlocosInicio() {
  const salvos = useDados<Bloco[]>("v1/admin/home-blocks");
  const looks = useDados<Look[]>("v1/admin/looks");
  const colecoes = useDados<Colecao[]>("v1/admin/collections");
  const [blocos, setBlocos] = useState<Bloco[] | null>(null);
  const [salvo, setSalvo] = useState(false);
  const { ocupado, erro, enviar } = useEnvio(() => setSalvo(true));

  useEffect(() => { if (salvos.dados && blocos === null) void Promise.resolve().then(() => setBlocos(salvos.dados)); }, [salvos.dados, blocos]);

  if (!blocos) return <Carregando erro={salvos.erro} />;
  const mudar = (i: number, parte: Partial<Bloco>) => { setSalvo(false); setBlocos(blocos.map((b, j) => (j === i ? { ...b, ...parte } : b))); };
  const mover = (i: number, d: number) => {
    const novo = [...blocos];
    [novo[i], novo[i + d]] = [novo[i + d]!, novo[i]!];
    setSalvo(false);
    setBlocos(novo);
  };

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>A loja mostra os blocos ativos nesta ordem. Mude, depois salve.</p>
      <ol className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {blocos.map((b, i) => (
          <li key={i} className="card flat" aria-label={`Bloco ${i + 1}`}>
            <div className="form-grid form-grid3">
              <div className="field">
                <label htmlFor={`tipo-${i}`}>Bloco {i + 1}</label>
                <select className="select" id={`tipo-${i}`} value={b.tipo} onChange={(e) => mudar(i, { tipo: e.target.value, refId: null })}>
                  {Object.entries(TIPOS_BLOCO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              {(b.tipo === "CAMPANHA" || b.tipo === "PRODUTOS") ? (
                <div className="field">
                  <label htmlFor={`ref-${i}`}>{b.tipo === "CAMPANHA" ? "Look da campanha" : "Coleção (opcional)"}</label>
                  <select className="select" id={`ref-${i}`} value={b.refId ?? ""} onChange={(e) => mudar(i, { refId: e.target.value || null })}>
                    <option value="">{b.tipo === "CAMPANHA" ? "Escolha um look" : "Todas as peças"}</option>
                    {(b.tipo === "CAMPANHA" ? looks.dados ?? [] : colecoes.dados ?? []).map((x) => <option key={x.id} value={x.id}>{"titulo" in x ? x.titulo : x.nome}</option>)}
                  </select>
                </div>
              ) : <div />}
              <div className="field">
                <label htmlFor={`titulo-${i}`}>Título (opcional)</label>
                <input className="input" id={`titulo-${i}`} maxLength={60} value={b.titulo ?? ""} onChange={(e) => mudar(i, { titulo: e.target.value || null })} />
              </div>
            </div>
            <div className="mini-actions" style={{ marginTop: 10, alignItems: "center" }}>
              <label className="check"><input type="checkbox" checked={b.ativo} onChange={(e) => mudar(i, { ativo: e.target.checked })} /> Ativo</label>
              <Botao variante="ghost" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir o bloco ${i + 1}`}>↑</Botao>
              <Botao variante="ghost" disabled={i === blocos.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer o bloco ${i + 1}`}>↓</Botao>
              <Botao variante="ghost" onClick={() => { setSalvo(false); setBlocos(blocos.filter((_, j) => j !== i)); }} aria-label={`Tirar o bloco ${i + 1}`}>Tirar</Botao>
            </div>
          </li>
        ))}
      </ol>
      {erro && <div style={{ marginTop: 14 }}><Aviso tipo="error" titulo={erro} /></div>}
      {salvo && <p role="status" className="field-help" style={{ marginTop: 14 }}>Página inicial salva.</p>}
      <div className="actions" style={{ marginTop: 16 }}>
        <Botao variante="ghost" disabled={blocos.length >= 20} onClick={() => { setSalvo(false); setBlocos([...blocos, { tipo: "NOVIDADES", refId: null, titulo: null, ativo: true }]); }}>Acrescentar bloco</Botao>
        <Botao carregando={ocupado} onClick={() => {
          if (blocos.some((b) => b.tipo === "CAMPANHA" && !b.refId)) return;
          void enviar(chamarApi("v1/admin/home-blocks", { blocos: blocos.map(({ tipo, refId, titulo, ativo }) => ({ tipo, refId, titulo, ativo })) }, "PUT"));
        }}>Salvar a página inicial</Botao>
      </div>
      {blocos.some((b) => b.tipo === "CAMPANHA" && !b.refId) && <p className="field-error" style={{ marginTop: 8 }}>Escolha o look de cada bloco de campanha antes de salvar.</p>}
    </>
  );
}
