import type { ReactNode } from "react";
import { cx } from "./classes.ts";

/** Seta do lucide (ArrowRight), desenhada aqui porque o pacote de componentes não depende dele. */
export function SetaDireita({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/**
 * Moldura do carrossel da capa do início: 16:9; vertical (4:5) no celular quando todos os slides
 * têm a foto do celular.
 */
export function classeMolduraCarrossel(vertical: boolean): string {
  return cx("relative overflow-hidden rounded-[24px] bg-rosa-bruma ring-1 ring-tinta/15", vertical ? "aspect-[4/5] md:aspect-video" : "aspect-video");
}

/**
 * O que vai dentro de um slide do carrossel: a foto, a legenda da campanha (campanha, coleção e
 * temporada, do HTML; no 16:9 do celular não cabe ao lado do botão e fica só no computador) e o
 * "Ver a coleção". É o mesmo slide na loja e na prévia do painel.
 */
export function ConteudoSlide({ nome, campanha, linha, vertical, foto }: {
  nome: string; campanha?: string | null; linha?: string | null; vertical: boolean; foto: ReactNode;
}) {
  return (
    <>
      {foto}
      {campanha && (
        <span className={cx(!vertical && "max-md:hidden", "absolute inset-x-0 bottom-0 grid gap-1.5 bg-linear-to-t from-black/55 to-transparent px-4 pb-16 pt-24 text-[#fbf5ea] md:px-8 md:pb-8 md:pt-32")}>
          <span className="font-display text-[clamp(34px,5.4vw,76px)] font-extrabold uppercase leading-[0.92] tracking-[-0.02em]">{campanha}</span>
          {linha && <span className="text-[11px] font-semibold uppercase tracking-[0.24em]">{linha}</span>}
        </span>
      )}
      <span className="absolute bottom-2.5 right-2.5 inline-flex min-h-8 items-center gap-1.5 rounded-pilula border-2 border-tinta bg-tinta px-3 text-xs font-bold text-papel shadow-adesivo group-hover:bg-rosa-press md:bottom-5 md:right-5 md:min-h-13 md:gap-2 md:px-6 md:text-[15px]">
        Ver {nome}
        <SetaDireita className="size-4 md:size-5" />
      </span>
    </>
  );
}
