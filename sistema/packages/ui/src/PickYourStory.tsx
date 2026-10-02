import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export interface ItemPickYourStory {
  id: string;
  nome: string;
  href: string;
  /** Cor da coleção (col-*), no fundo do círculo enquanto a foto carrega ou sem foto. */
  cor: string;
  /** A foto, preenchendo o círculo (a loja usa o next/image; o painel, a miniatura). */
  foto?: ReactNode;
  /** Na prévia do painel: as outras coleções ficam apagadas, para a editada se destacar. */
  apagado?: boolean;
}

/**
 * Classe da foto do círculo. A escolhida no painel (0440) aparece inteira, com uma folga, sobre a
 * cor da coleção: são letterings com fundo transparente, que o recorte redondo cortava nas bordas.
 * A peça mais nova, uma foto comum, preenche o círculo.
 */
export function classeFotoStory(escolhida: boolean): string {
  return escolhida ? "absolute inset-0 size-full object-contain p-1.5 md:p-2" : "absolute inset-0 size-full object-cover";
}

/**
 * Pick your story (28/09): atalhos para cada história logo abaixo da capa, com a capa escolhida no
 * painel (0440) ou a peça mais nova da coleção, e só o nome da coleção embaixo (29/09: o nome da
 * campanha já está no lettering e aparecia duas vezes). Desde 02/10, no jeito dos destaques
 * fixados do Instagram: anel fino, respiro claro, a capa dentro e o nome pequeno, sem o contorno
 * grosso de adesivo. Pouco espaço até a seção seguinte. No celular, a linha desliza para o lado.
 * É a mesma linha na loja e na prévia do painel.
 */
export function PickYourStory({ titulo, itens, Link = "a" }: { titulo: string | null; itens: ItemPickYourStory[]; Link?: ComponentType<PropsLink> | "a" }) {
  return (
    <section aria-labelledby="inicio-colecoes" className="px-3.5 pb-2 pt-8 md:px-5 md:pb-4 md:pt-12 [&+section]:pt-6 md:[&+section]:pt-10">
      <h2 id="inicio-colecoes" className="tc-titulo m-0 mb-5 text-center text-[clamp(30px,3.6vw,44px)]">{titulo ?? "Pick your story."}</h2>
      <ul className="m-0 flex list-none snap-x gap-3.5 overflow-x-auto p-0 pb-2 md:flex-wrap md:justify-center md:gap-7 md:overflow-visible">
        {itens.map((c) => (
          <li key={c.id} className={c.apagado ? "shrink-0 snap-start opacity-30" : "shrink-0 snap-start"}>
            <Link href={c.href} className="group grid w-[78px] justify-items-center gap-1.5 text-center md:w-[104px]">
              <span className="block rounded-full border border-tinta/25 bg-papel p-[3px] transition-colors group-hover:border-tinta/60 motion-reduce:transition-none">
                <span className={`col-${c.cor.toLowerCase()} relative block size-[66px] overflow-hidden rounded-full bg-colecao-fundo md:size-[90px]`}>
                  {c.foto}
                </span>
              </span>
              <span className="line-clamp-2 text-xs font-medium leading-tight md:text-[13px]">{c.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
