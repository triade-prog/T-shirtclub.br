import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { cx } from "./classes.ts";
import { Selo } from "./Selo.tsx";

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export interface CardProdutoProps {
  nome: string;
  href: string;
  /** Nome da coleção, acima do nome da peça. */
  colecao?: string | null;
  /** Preço que a cliente paga, já formatado ("R$ 49,99"). */
  preco: string;
  /** Preço de tabela riscado, quando há desconto na peça. */
  precoOriginal?: string | null;
  /** Oferta do Club ao lado do preço ("3 por R$ 119,99"). */
  oferta?: string | null;
  /** Selo de estoque ("Últimas peças", "Esgotado"). */
  selo?: string | null;
  /** A foto, preenchendo o quadro 4:5 (a loja usa o next/image; o painel, a miniatura). */
  foto?: ReactNode;
  /** Favoritar, no canto de cima. */
  favorito?: ReactNode;
  /** Adicionar rápido, no canto de baixo. */
  acao?: ReactNode;
  /** O link da loja (next/link); sem ele, um <a> comum. */
  Link?: ComponentType<PropsLink> | "a";
  className?: string;
}

/**
 * Cartão da vitrine (V4): foto 4:5 com contorno, selo de estoque, favoritar, adicionar rápido,
 * coleção, nome e preço. Os botões ficam fora do link (nada interativo dentro de outro); a foto
 * repete o link do nome só para o toque, fora da ordem do teclado. É o mesmo cartão na loja e
 * na prévia do cadastro do painel.
 */
export function CardProduto({ nome, href, colecao, preco, precoOriginal, oferta, selo, foto, favorito, acao, Link = "a", className }: CardProdutoProps) {
  return (
    <article className={cx("group grid min-w-0 content-start gap-2.5", className)}>
      <div className="relative aspect-4/5 overflow-hidden rounded-foto border-[1.5px] border-tinta bg-algodao shadow-[3px_3px_0_rgb(38_25_30/0.12)]">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          {foto}
        </Link>
        {/* Para antes do favoritar: selo longo ("Última unidade") quebra a linha em vez de ficar por baixo */}
        {selo && <Selo fundo="citrino" tamanho="compacto" className="absolute left-2 top-2 max-w-[calc(100%-3.75rem)] md:left-2.5 md:top-2.5 md:max-w-[calc(100%-4.25rem)]">{selo}</Selo>}
        {favorito}
        {acao}
      </div>
      <div className="px-0.5">
        {colecao && <p className="m-0 text-[10px] font-bold uppercase tracking-[0.11em] text-tinta-suave">{colecao}</p>}
        {/* Toque de 44 px: o link ganha 12 px em cima e embaixo, e as margens negativas mantêm o desenho */}
        <h3 className="m-0 -mb-3 -mt-2.5 text-sm font-bold tracking-[-0.02em]">
          <Link href={href} className="block truncate rounded-[4px] py-3">{nome}</Link>
        </h3>
        {/* Preço da peça e o do Club separados (29/09: "R$ 49,993 por" colado confundia): a peça na
            tinta e, embaixo, "ou 3 por R$ 119,99 no Club", discreto, com o grifo citrino */}
        <p className="m-0 mt-1 text-[15px] font-semibold tracking-[-0.01em]">
          {precoOriginal && <><s className="text-xs font-normal text-tinta-suave">{precoOriginal}</s>{" "}</>}
          {preco} <span className="text-xs font-normal text-tinta-suave">a peça</span>
        </p>
        {oferta && (
          <p className="m-0 mt-0.5 text-xs text-tinta-suave">
            ou <span className="font-semibold text-tinta underline decoration-citrino decoration-[3px] underline-offset-2 [text-decoration-skip-ink:none]">{oferta}</span> no Club
          </p>
        )}
      </div>
    </article>
  );
}
