"use client";

import { Selo, cx } from "@tshirtclub/ui";
import { progressoTrio } from "@/lib/sacola";
import { usePecasNaSacola } from "./sacolaNoNavegador";

// Faixa compacta do Club na página da coleção (28/09): a oferta, a frase do momento e os passos
// do trio numa linha só, entre os filtros e as peças. Conta as peças que já estão na sacola, como
// o ProgressoDaSacola, e muda na hora em que uma peça entra.
export function FaixaTrio({ qtd, preco, oferta, inicial, campanha }: {
  qtd: number;
  /** Preço do grupo já formatado ("R$ 119,99"). */
  preco: string;
  /** "3 por R$ 119,99". */
  oferta: string;
  /** Cookie da sacola lido no servidor. */
  inicial?: string;
  /** Na página de campanha, dentro do bloco rosa do Build Your Club: o cartão citrino da home (D38). */
  campanha?: boolean;
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
      className={cx("mb-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cartao px-4 py-3.5 md:flex-nowrap md:px-5",
        campanha ? "border-2 border-tinta bg-citrino text-no-citrino shadow-adesivo-lg" : "border-2 border-tinta bg-rosa text-no-rosa shadow-adesivo")}>
      <Selo fundo={campanha ? "papel" : "citrino"} brilho={false} className="shrink-0">{oferta}</Selo>
      <p className="m-0 min-w-[16ch] flex-1 text-sm font-semibold leading-snug">{texto}</p>
      <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: qtd }, (_, i) => (
          <span key={i} className={cx("grid size-7 place-items-center rounded-full border-2 font-texto font-semibold tabular-nums text-xs",
            i < p.noTrio ? (campanha ? "border-tinta bg-tinta text-papel" : "border-tinta bg-citrino text-no-citrino") : "border-tinta bg-papel text-tinta")}>
            {i < p.noTrio ? "✓" : i + 1}
          </span>
        ))}
        <b className="ml-1.5 font-texto font-semibold tabular-nums text-lg">{p.noTrio}/{qtd}</b>
      </div>
    </section>
  );
}
