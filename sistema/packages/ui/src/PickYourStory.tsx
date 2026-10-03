import { createElement, type AnchorHTMLAttributes, type ComponentType } from "react";
import { iconeDoStory } from "./IconeStory.tsx";

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export interface ItemPickYourStory {
  id: string;
  nome: string;
  href: string;
  /** Cor da coleção (col-*): o fundo claro do círculo e o traço do ícone. */
  cor: string;
  /** Chave do ícone escolhido no painel (0500); sem ela, a camiseta. */
  icone?: string | null;
  /** Na prévia do painel: as outras coleções ficam apagadas, para a editada se destacar. */
  apagado?: boolean;
}

/**
 * Pick your story (28/09): atalhos para cada história logo abaixo da capa, só com o nome da
 * coleção embaixo (29/09: o nome da campanha aparecia duas vezes). Desde 02/10, no jeito dos
 * destaques fixados do Instagram: anel fino, respiro claro e o nome pequeno. Desde 02/10, sem foto:
 * um ícone de traço fino (escolhido no painel) sobre o fundo claro da cor da coleção, como as capas
 * dos destaques; as fotos pesavam no início. No celular, a linha desliza para o lado. É a mesma
 * linha na loja e na prévia do painel.
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
                <span className={`col-${c.cor.toLowerCase()} grid size-[66px] place-items-center rounded-full bg-colecao-fundo text-colecao-tinta md:size-[90px]`}>
                  <IconeDoItem chave={c.icone} />
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

// createElement e não <Icone />: o ícone vem de uma tabela fixa, não é um componente novo a cada vez
function IconeDoItem({ chave }: { chave: string | null | undefined }) {
  return createElement(iconeDoStory(chave), { "aria-hidden": true, strokeWidth: 1.5, className: "size-7 md:size-9" });
}
