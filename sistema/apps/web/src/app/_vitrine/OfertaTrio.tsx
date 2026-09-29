import Image from "next/image";
import { formatarReais } from "@tshirtclub/domain";
import { cx } from "@tshirtclub/ui";
import { urlFoto } from "@/lib/catalogo";

/**
 * Arte do preço do trio (lettering da loja, 29/09, em "imagens site" no bucket). O valor está
 * desenhado nela, então só aparece enquanto o trio custar isso; com outro preço, volta o texto.
 */
export const ARTE_PRECO = { centavos: 11999, caminho: "imagens%20site/lettering-preco-119-99.webp", largura: 1000, altura: 442 };

/**
 * "3 T-shirts por R$ 119,99" com o "3" grande em citrino e o preço no lettering da loja, no bloco
 * rosa do trio (home e campanhas). O leitor de tela lê a frase inteira.
 */
export function OfertaTrio({ qtd, precoCentavos, className }: { qtd: number; precoCentavos: number; className?: string }) {
  const preco = formatarReais(precoCentavos);
  const frase = "font-editorial text-[clamp(24px,3vw,40px)] font-[680] italic tracking-[-0.03em]";
  return (
    <p className={cx("m-0 flex flex-wrap items-center gap-x-4.5 gap-y-1.5", className)}>
      <span className="sr-only">{qtd} T-shirts por {preco}</span>
      <span aria-hidden="true" className={frase}>
        <b className="tc-numero-adesivo mr-1 align-[-0.12em] text-[2.3em] font-[680] leading-[0.7]">{qtd}</b> T-shirts por
      </span>
      {precoCentavos === ARTE_PRECO.centavos ? (
        <Image src={urlFoto(ARTE_PRECO.caminho)} alt="" aria-hidden="true" width={ARTE_PRECO.largura} height={ARTE_PRECO.altura}
          sizes="(min-width: 768px) 300px, 50vw" className="h-[clamp(84px,9vw,130px)] w-auto -rotate-3" />
      ) : (
        <span aria-hidden="true" className={frase}>{preco}</span>
      )}
    </p>
  );
}
