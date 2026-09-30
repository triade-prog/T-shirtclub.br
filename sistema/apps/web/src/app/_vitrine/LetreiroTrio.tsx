"use client";

import { useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";
import { cx } from "@tshirtclub/ui";
import { urlFoto } from "@/lib/catalogo";

/**
 * Arte do preço do trio (lettering da loja, 29/09, em "imagens site" no bucket). O valor está
 * desenhado nela, então só aparece enquanto o trio custar isso; com outro preço, volta o texto.
 */
export const ARTE_PRECO = { centavos: 11999, caminho: "imagens%20site/lettering-preco-119-99.webp", largura: 1000, altura: 442 };

// Faixa corrida do trio (29/09, pedido da loja): "3 T-shirts por" e a arte do preço da loja
// passando de ponta a ponta sobre a divisa do bloco rosa do trio com o papel, na home e no Build
// Your Club das campanhas. Fundo verde-limão (citrino, escolha da loja entre quatro verdes), com
// o texto em tinta; a arte e o "3" (rosa desde 30/09) têm contorno escuro e aparecem sobre ele. A altura é fixa (64 e
// 74 px, mais baixa desde 29/09 à noite) para a página subir metade
// dela (SUBIDA_LETREIRO). Com outro preço, a arte (que tem o valor desenhado) dá lugar ao texto. O
// leitor de tela lê a frase uma vez; o que corre é enfeite. Anda sozinha, então tem pausa (WCAG
// 2.2.2), para com o mouse em cima e fica parada com movimento reduzido.

/** Metade da altura da faixa: quem a põe na divisa sobe isso, e o bloco rosa guarda espaço embaixo. */
export const SUBIDA_LETREIRO = "relative z-10 -mt-[32px] md:-mt-[37px]";

const REPETICOES = 5;

export function LetreiroTrio({ qtd, precoCentavos, className }: { qtd: number; precoCentavos: number; className?: string }) {
  const [parado, setParado] = useState(false);
  const preco = formatarReais(precoCentavos);
  const frase = "font-editorial text-[clamp(22px,2.3vw,30px)] font-[680] italic tracking-[-0.03em]";
  const copia = (chave: string) => (
    <span key={chave} className="flex shrink-0 items-center">
      {Array.from({ length: REPETICOES }, (_, i) => (
        <span key={i} className="flex items-center gap-[0.35em] whitespace-nowrap px-[0.8em]">
          <span className={frase}>
            <b className="tc-numero-adesivo mr-1 align-[-0.12em] text-[1.6em] font-[680] leading-[0.7]">{qtd}</b> T-shirts por
          </span>
          {precoCentavos === ARTE_PRECO.centavos ? (
            <Image src={urlFoto(ARTE_PRECO.caminho)} alt="" width={ARTE_PRECO.largura} height={ARTE_PRECO.altura}
              sizes="200px" className="h-11 w-auto -rotate-3 md:h-13" />
          ) : (
            <span className={frase}>{preco}</span>
          )}
        </span>
      ))}
    </span>
  );
  return (
    <section aria-label="Oferta do Club" data-parado={parado}
      className={cx("tc-letreiro tc-sangria flex h-[64px] items-center border-y-3 border-tinta bg-citrino text-no-citrino md:h-[74px]", className)}>
      <p className="sr-only">{qtd} T-shirts por {preco}</p>
      <div aria-hidden="true" className="min-w-0 flex-1 overflow-hidden">
        <div className="tc-letreiro-trilho">{copia("a")}{copia("b")}</div>
      </div>
      <button type="button" onClick={() => setParado(!parado)} aria-pressed={parado} aria-label="Pausar a faixa da oferta"
        className="tc-alvo relative mx-2 grid size-11 shrink-0 place-items-center rounded-full border-2 border-tinta bg-papel text-tinta shadow-adesivo-sm motion-reduce:hidden">
        {parado ? <Play aria-hidden="true" className="size-4" strokeWidth={2} /> : <Pause aria-hidden="true" className="size-4" strokeWidth={2} />}
      </button>
    </section>
  );
}
