"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cx } from "@tshirtclub/ui";

// Carrossel da capa do início (28/09): um slide por coleção com foto de campanha (os banners
// 16:9 da loja, inteiros, sem corte). O slide inteiro leva à coleção; o botão desenhado na foto
// não é clicável, então há um "Ver a coleção" de verdade. Troca a cada 6 s, com pausa (WCAG
// 2.2.2), e para com o mouse ou o foco em cima; com movimento reduzido, começa parado. Só o
// primeiro slide carrega com a página; os outros entram depois (LCP). Campanha (D35 e D36): com o
// nome da campanha, a foto é limpa e a legenda vem do HTML (campanha, coleção e temporada); com
// foto do celular (4:5) em todos os slides, o carrossel fica vertical no celular. Moldura mínima:
// a campanha deve parecer fotografia, não componente.

export interface SlideCapa {
  slug: string; nome: string; foto: string; alt: string;
  /** Foto 4:5 do celular (0420). */
  fotoCelular?: string | null;
  /** Nome da campanha ("Ciao, Estate!") e a linha da coleção ("Estate Italiana · SS26"). */
  campanha?: string | null;
  linha?: string | null;
}

const TAMANHOS = "(min-width: 1280px) 1240px, 100vw";

function FotoSlide({ s, prioridade }: { s: SlideCapa; prioridade: boolean }) {
  if (!s.fotoCelular) return <Image src={s.foto} alt={s.alt} fill priority={prioridade} sizes={TAMANHOS} className="object-cover" />;
  const { props: { srcSet: computador } } = getImageProps({ src: s.foto, alt: "", width: 2400, height: 1350, sizes: TAMANHOS });
  const { props: { srcSet: celular, ...img } } = getImageProps({ src: s.fotoCelular, alt: s.alt, width: 1080, height: 1350, sizes: "100vw", priority: prioridade });
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={computador} />
      <source srcSet={celular} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- o alt vem de getImageProps */}
      <img {...img} className="absolute inset-0 size-full object-cover" />
    </picture>
  );
}

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
  // Vertical no celular só quando todos os slides têm a foto 4:5; no 16:9 do celular, a legenda
  // da campanha não cabe ao lado do botão e fica só no computador.
  const vertical = slides.every((s) => s.fotoCelular);
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
        className={cx("relative overflow-hidden rounded-[24px] bg-rosa-bruma ring-1 ring-tinta/15", vertical ? "aspect-[4/5] md:aspect-video" : "aspect-video")}
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
                  <FotoSlide s={s} prioridade={i === 0} />
                  {s.campanha && (
                    <span className={cx(!vertical && "max-md:hidden", "absolute inset-x-0 bottom-0 grid gap-1.5 bg-linear-to-t from-black/55 to-transparent px-4 pb-16 pt-24 text-[#fbf5ea] md:px-8 md:pb-8 md:pt-32")}>
                      <span className="font-display text-[clamp(34px,5.4vw,76px)] font-extrabold uppercase leading-[0.92] tracking-[-0.02em]">{s.campanha}</span>
                      {s.linha && <span className="text-[11px] font-semibold uppercase tracking-[0.24em]">{s.linha}</span>}
                    </span>
                  )}
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
