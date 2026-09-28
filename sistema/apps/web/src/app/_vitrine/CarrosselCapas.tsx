"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cx } from "@tshirtclub/ui";

// Carrossel da capa do início (28/09): um slide por coleção com foto de campanha (os banners
// 16:9 da loja, inteiros, sem corte). O slide inteiro leva à coleção; o botão desenhado na foto
// não é clicável, então há um "Ver a coleção" de verdade. Troca a cada 6 s, com pausa (WCAG
// 2.2.2), e para com o mouse ou o foco em cima; com movimento reduzido, começa parado. Só o
// primeiro slide carrega com a página; os outros entram depois (LCP).

export interface SlideCapa { slug: string; nome: string; foto: string; alt: string }

const INTERVALO = 6000;
const MOVIMENTO_REDUZIDO = "(prefers-reduced-motion: reduce)";
const nada = () => () => {};
function assinarMovimento(aviso: () => void) {
  const m = window.matchMedia(MOVIMENTO_REDUZIDO);
  m.addEventListener("change", aviso);
  return () => m.removeEventListener("change", aviso);
}

export function CarrosselCapas({ slides }: { slides: SlideCapa[] }) {
  const [atual, setAtual] = useState(0);
  // null: a escolha da cliente ainda não existe (toca, a não ser com movimento reduzido)
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const [emCima, setEmCima] = useState(false);
  // No servidor e na hidratação só o primeiro slide; os outros entram depois de montar.
  const montado = useSyncExternalStore(nada, () => true, () => false);
  const reduzido = useSyncExternalStore(assinarMovimento, () => window.matchMedia(MOVIMENTO_REDUZIDO).matches, () => false);
  const tocando = escolha ?? !reduzido;
  const inicioToque = useRef<number | null>(null);
  const total = slides.length;
  const ir = useCallback((i: number) => setAtual(((i % total) + total) % total), [total]);

  useEffect(() => {
    if (!tocando || emCima || total < 2) return;
    const id = setTimeout(() => ir(atual + 1), INTERVALO);
    return () => clearTimeout(id);
  }, [tocando, emCima, atual, total, ir]);

  const botao = "tc-alvo grid size-11 place-items-center rounded-full border-2 border-tinta bg-papel text-tinta shadow-adesivo-sm";
  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Coleções em destaque"
      className="px-3.5 pt-5 md:px-5 md:pt-7"
      onMouseEnter={() => setEmCima(true)}
      onMouseLeave={() => setEmCima(false)}
      onFocus={() => setEmCima(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEmCima(false); }}
    >
      <div
        className="relative aspect-video overflow-hidden rounded-[26px] border-3 border-tinta bg-rosa-bruma shadow-[8px_8px_0_var(--tc-rosa)]"
        onTouchStart={(e) => { inicioToque.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const x0 = inicioToque.current;
          const x1 = e.changedTouches[0]?.clientX;
          inicioToque.current = null;
          if (x0 === null || x1 === undefined || Math.abs(x1 - x0) < 40) return;
          ir(x1 < x0 ? atual + 1 : atual - 1);
        }}
      >
        <div aria-live={tocando && !emCima ? "off" : "polite"}>
          {slides.map((s, i) => {
            const ativo = i === atual;
            if (!montado && i > 0) return null;
            return (
              <div key={s.slug} role="group" aria-roledescription="slide" aria-label={`${i + 1} de ${total}: ${s.nome}`}
                inert={!ativo} aria-hidden={!ativo}
                className={cx("absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none", ativo ? "opacity-100" : "opacity-0")}>
                <Link href={`/colecao/${s.slug}`} className="group block size-full">
                  <Image src={s.foto} alt={s.alt} fill priority={i === 0} sizes="(min-width: 1280px) 1240px, 100vw" className="object-cover" />
                  <span className="absolute bottom-2.5 right-2.5 inline-flex min-h-8 items-center gap-1.5 rounded-pilula border-2 border-tinta bg-tinta px-3 text-xs font-bold text-papel shadow-adesivo group-hover:bg-rosa-press md:bottom-5 md:right-5 md:min-h-13 md:gap-2 md:px-6 md:text-[15px]">
                    Ver {s.nome}
                    <ArrowRight aria-hidden="true" className="size-4 md:size-5" strokeWidth={1.8} />
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
        {total > 1 && (
          <>
            <button type="button" onClick={() => ir(atual - 1)} aria-label="Slide anterior" className={cx(botao, "absolute left-3 top-1/2 -translate-y-1/2 max-md:hidden")}>
              <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
            </button>
            <button type="button" onClick={() => ir(atual + 1)} aria-label="Próximo slide" className={cx(botao, "absolute right-3 top-1/2 -translate-y-1/2 max-md:hidden")}>
              <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
      {total > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1">
          <button type="button" onClick={() => setEscolha(!tocando)} aria-label={tocando ? "Pausar o carrossel" : "Continuar o carrossel"} className={cx(botao, "relative")}>
            {tocando ? <Pause aria-hidden="true" className="size-4" strokeWidth={2} /> : <Play aria-hidden="true" className="size-4" strokeWidth={2} />}
          </button>
          {slides.map((s, i) => (
            <button key={s.slug} type="button" onClick={() => ir(i)} aria-label={`Mostrar ${s.nome}`} aria-current={i === atual ? "true" : undefined}
              className="tc-alvo relative grid h-11 w-9 place-items-center">
              <span aria-hidden="true" className={cx("block h-3 rounded-full border-2 border-tinta transition-all motion-reduce:transition-none", i === atual ? "w-7 bg-rosa" : "w-3 bg-papel")} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
