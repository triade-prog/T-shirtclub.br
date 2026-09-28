"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Abas } from "./ui";

export type Formato = "celular" | "computador";

const LARGURA: Record<Formato, number> = { celular: 390, computador: 1280 };

// O painel tem regras soltas (body, p, h1, .grid…) fora das camadas do Tailwind, que ganhariam das
// classes da loja. Dentro da janela, cada uma volta ao valor das camadas (o da loja).
const NEUTRO = `
*{box-sizing:revert-layer}html{scroll-behavior:revert-layer}
body{margin:revert-layer;background:revert-layer;color:revert-layer;font-family:revert-layer;line-height:revert-layer;-webkit-font-smoothing:revert-layer}
a{color:revert-layer;text-decoration:revert-layer}button,input,select,textarea{font:revert-layer;color:revert-layer}button{cursor:revert-layer}
:where(h1,h2,h3,b,strong){font-weight:revert-layer}:where(p){margin-block:revert-layer}.grid{display:revert-layer;gap:revert-layer}
`;

/**
 * Janela da prévia na loja: um iframe do próprio painel (sem endereço, então a CSP é a do painel e
 * nada muda nela) com o CSS do painel, onde os componentes compartilhados da loja (packages/ui) são
 * desenhados na largura do celular (390 px) ou do computador (1280 px, reduzido para caber). Como
 * a largura é a da janela, os tamanhos de celular e de computador da loja valem de verdade. Só
 * para ver: o conteúdo é inerte (nada lá dentro recebe clique nem foco).
 */
export function JanelaPrevia({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  const [formato, setFormato] = useState<Formato>("computador");
  const quadro = useRef<HTMLIFrameElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [corpo, setCorpo] = useState<HTMLElement | null>(null);
  const [altura, setAltura] = useState(0);
  const [espaco, setEspaco] = useState(0);

  useEffect(() => {
    const doc = quadro.current?.contentDocument;
    const janela = quadro.current?.contentWindow as (Window & typeof globalThis) | null | undefined;
    if (!doc || !janela) return;
    doc.documentElement.lang = "pt-BR";
    doc.documentElement.className = document.documentElement.className; // variáveis das fontes
    for (const estilo of document.head.querySelectorAll('link[rel="stylesheet"], style')) doc.head.appendChild(doc.importNode(estilo, true));
    const neutro = new janela.CSSStyleSheet();
    neutro.replaceSync(NEUTRO);
    doc.adoptedStyleSheets = [neutro];
    doc.body.className = "bg-papel font-texto text-tinta antialiased";
    const raiz = doc.createElement("div");
    raiz.inert = true;
    doc.body.appendChild(raiz);
    const medir = new janela.ResizeObserver(() => setAltura(raiz.scrollHeight));
    medir.observe(raiz);
    void Promise.resolve().then(() => setCorpo(raiz));
    return () => { medir.disconnect(); raiz.remove(); };
  }, []);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = new ResizeObserver(() => setEspaco(el.clientWidth));
    medir.observe(el);
    return () => medir.disconnect();
  }, []);

  const largura = LARGURA[formato];
  const escala = espaco > 0 ? Math.min(1, espaco / largura) : 1;
  return (
    <div className="previa-loja">
      <div className="previa-loja-topo">
        <p className="previa-rotulo" style={{ margin: 0 }}>{rotulo}</p>
        <Abas rotulo="Tamanho da prévia" valor={formato} aoMudar={setFormato}
          opcoes={[{ valor: "celular", texto: "Celular" }, { valor: "computador", texto: "Computador" }]} />
      </div>
      <div ref={caixa} className="previa-loja-caixa" style={{ height: altura * escala }}>
        <iframe ref={quadro} title={`${rotulo} (${formato})`} className="previa-loja-quadro" style={{ width: largura, height: altura, transform: `scale(${escala})` }} />
      </div>
      {corpo && createPortal(children, corpo)}
    </div>
  );
}
