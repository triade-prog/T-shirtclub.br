"use client";

import { useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";
import { cx } from "@tshirtclub/ui";
import { urlFoto } from "@/lib/catalogo";
import { ARTE_PRECO } from "./OfertaTrio";

// Faixa corrida do trio (29/09, pedido da loja): "3 T-shirts por" e a arte do preço da loja
// passando de ponta a ponta sobre a divisa do bloco "Monte seu Club" com o papel, no rosa da faixa
// do cabeçalho (escolhas da loja). A altura é fixa (90 e 106 px) para a home subir metade dela. Com outro
// preço, a arte (que tem o valor desenhado) dá lugar ao texto. O leitor de tela lê a frase uma
// vez; o que corre é enfeite. Anda sozinha, então tem pausa (WCAG 2.2.2), para com o mouse em
// cima e fica parada com movimento reduzido.

const REPETICOES = 5;

export function LetreiroTrio({ qtd, precoCentavos, className }: { qtd: number; precoCentavos: number; className?: string }) {
  const [parado, setParado] = useState(false);
  const preco = formatarReais(precoCentavos);
  const frase = "font-editorial text-[clamp(26px,3vw,40px)] font-[680] italic tracking-[-0.03em]";
  const copia = (chave: string) => (
    <span key={chave} className="flex shrink-0 items-center">
      {Array.from({ length: REPETICOES }, (_, i) => (
        <span key={i} className="flex items-center gap-[0.35em] whitespace-nowrap px-[0.8em]">
          <span className={frase}>
            <b className="tc-numero-adesivo mr-1 align-[-0.12em] text-[1.6em] font-[680] leading-[0.7]">{qtd}</b> T-shirts por
          </span>
          {precoCentavos === ARTE_PRECO.centavos ? (
            <Image src={urlFoto(ARTE_PRECO.caminho)} alt="" width={ARTE_PRECO.largura} height={ARTE_PRECO.altura}
              sizes="200px" className="h-16 w-auto -rotate-3 md:h-20" />
          ) : (
            <span className={frase}>{preco}</span>
          )}
        </span>
      ))}
    </span>
  );
  return (
    <section aria-label="Oferta do Club" data-parado={parado}
      className={cx("tc-letreiro tc-sangria flex h-[90px] items-center border-y-3 border-tinta bg-rosa text-no-rosa md:h-[106px]", className)}>
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
