"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cx } from "@tshirtclub/ui";

/**
 * Galeria da página do produto (V4): as fotos lado a lado com rolagem por encaixe (arrastar
 * no celular) e as miniaturas levam à foto. Sem JavaScript, continua rolável.
 */
export function Galeria({ fotos, nome, selo }: { fotos: { url: string; alt: string }[]; nome: string; selo?: React.ReactNode }) {
  const trilho = useRef<HTMLUListElement>(null);
  const [atual, setAtual] = useState(0);

  function aoRolar() {
    const t = trilho.current;
    if (t) setAtual(Math.round(t.scrollLeft / t.clientWidth));
  }

  function irPara(i: number) {
    const t = trilho.current;
    t?.scrollTo({ left: i * t.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setAtual(i);
  }

  return (
    <div className="min-w-0">
      <div className="relative overflow-hidden rounded-foto border-3 border-tinta bg-limao-bruma shadow-[7px_7px_0_var(--tc-rosa)]">
        <ul
          ref={trilho}
          onScroll={aoRolar}
          aria-label={`Fotos de ${nome}`}
          tabIndex={0}
          className="m-0 flex aspect-4/5 list-none snap-x snap-mandatory overflow-x-auto p-0 [scrollbar-width:none]"
        >
          {fotos.map((f, i) => (
            <li key={f.url} className="relative w-full flex-none snap-start" aria-label={`Foto ${i + 1} de ${fotos.length}`}>
              <Image src={f.url} alt={f.alt} fill priority={i === 0} sizes="(min-width: 820px) 52vw, 100vw" className="object-cover" />
            </li>
          ))}
        </ul>
        {selo}
        {fotos.length > 1 && (
          <span aria-hidden="true" className="absolute bottom-3 right-3 rounded-pilula border-[1.5px] border-tinta bg-citrino px-2.5 py-1.5 text-[10px] font-extrabold text-no-citrino shadow-adesivo-sm">
            {atual + 1} / {fotos.length}
          </span>
        )}
      </div>
      {fotos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto p-0.5 pb-1">
          {fotos.map((f, i) => (
            <button
              key={f.url}
              type="button"
              onClick={() => irPara(i)}
              aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
              aria-current={i === atual ? "true" : undefined}
              className={cx(
                "relative aspect-4/5 w-15.5 flex-none overflow-hidden rounded-[9px] border-2 p-0",
                i === atual ? "border-tinta shadow-[2px_2px_0_var(--tc-rosa)]" : "border-transparent opacity-60",
              )}
            >
              <Image src={f.url} alt="" fill sizes="62px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
