"use client";

import { Selo, cx } from "@tshirtclub/ui";
import { progressoTrio } from "@/lib/sacola";
import { usePecasNaSacola } from "./sacolaNoNavegador";

// Faixa compacta do Club na página da coleção (28/09): a oferta, a frase do momento e os passos
// do trio numa linha só, entre os filtros e as peças. Conta as peças que já estão na sacola, como
// o ProgressoDaSacola, e muda na hora em que uma peça entra.
export function FaixaTrio({ qtd, preco, oferta, inicial }: {
  qtd: number;
  /** Preço do grupo já formatado ("R$ 119,99"). */
  preco: string;
  /** "3 por R$ 119,99". */
  oferta: string;
  /** Cookie da sacola lido no servidor. */
  inicial?: string;
}) {
  const pecas = usePecasNaSacola(inicial);
  const p = progressoTrio(pecas, qtd);
  const falta = qtd - p.noTrio;
  const texto = !p.titulo
    ? "Misture com qualquer coleção: o preço do Club entra sozinho, sem cupom."
    : p.completo
      ? `${p.titulo} ${qtd} peças por ${preco}.`
      : `${p.titulo} Com mais ${falta === 1 ? "uma peça" : `${falta} peças`}, ${qtd} saem por ${preco}.`;
  return (
    <section aria-label={`Monte seu Club: ${p.noTrio} de ${qtd}`}
      className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cartao border-2 border-tinta bg-rosa px-4 py-3.5 text-no-rosa shadow-adesivo md:flex-nowrap md:px-5">
      <Selo fundo="citrino" brilho={false} className="shrink-0">{oferta}</Selo>
      <p className="m-0 min-w-[16ch] flex-1 text-sm font-semibold leading-snug">{texto}</p>
      <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: qtd }, (_, i) => (
          <span key={i} className={cx("grid size-7 place-items-center rounded-full border-2 border-tinta font-display text-xs font-extrabold",
            i < p.noTrio ? "bg-citrino text-no-citrino" : "bg-papel text-tinta")}>
            {i < p.noTrio ? "✓" : i + 1}
          </span>
        ))}
        <b className="ml-1.5 font-display text-lg font-extrabold">{p.noTrio}/{qtd}</b>
      </div>
    </section>
  );
}
