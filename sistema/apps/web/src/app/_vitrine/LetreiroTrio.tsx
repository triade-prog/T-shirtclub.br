"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";

// Faixa corrida do trio (29/09, pedido da loja): "3 T-shirts por R$ 119,99" passando de ponta a
// ponta logo abaixo da capa, na tinta, com o "3" de adesivo e o preço em citrino, como a arte do
// bloco rosa. O leitor de tela lê a frase uma vez; o texto que corre é enfeite. Anda sozinha, então
// tem pausa (WCAG 2.2.2), para com o mouse em cima e fica parada com movimento reduzido.

const REPETICOES = 6;

export function LetreiroTrio({ qtd, precoCentavos }: { qtd: number; precoCentavos: number }) {
  const [parado, setParado] = useState(false);
  const preco = formatarReais(precoCentavos);
  const copia = (chave: string) => (
    <span key={chave} className="flex shrink-0 items-center">
      {Array.from({ length: REPETICOES }, (_, i) => (
        <span key={i} className="flex items-center gap-[0.3em] whitespace-nowrap px-[0.7em] font-editorial text-[clamp(24px,3vw,36px)] font-[680] italic tracking-[-0.03em]">
          <b className="tc-numero-adesivo tc-adesivo-no-escuro text-[1.35em] font-[680] leading-[0.8]">{qtd}</b>
          T-shirts por <span className="text-citrino">{preco}</span>
          <span className="tc-brilho ml-[0.7em] size-3.5" />
        </span>
      ))}
    </span>
  );
  return (
    <section aria-label="Oferta do Club" data-parado={parado} className="tc-letreiro tc-sangria flex items-center border-y-3 border-tinta bg-tinta text-papel">
      <p className="sr-only">{qtd} T-shirts por {preco}</p>
      <div aria-hidden="true" className="min-w-0 flex-1 overflow-hidden py-3.5">
        <div className="tc-letreiro-trilho">{copia("a")}{copia("b")}</div>
      </div>
      <button type="button" onClick={() => setParado(!parado)} aria-pressed={parado} aria-label="Pausar a faixa da oferta"
        className="tc-alvo relative mx-2 grid size-11 shrink-0 place-items-center rounded-full border-2 border-papel bg-tinta text-papel motion-reduce:hidden">
        {parado ? <Play aria-hidden="true" className="size-4" strokeWidth={2} /> : <Pause aria-hidden="true" className="size-4" strokeWidth={2} />}
      </button>
    </section>
  );
}
