import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export interface ItemPickYourStory {
  id: string;
  nome: string;
  href: string;
  /** Cor da coleção (col-*), no fundo do círculo enquanto a foto carrega ou sem foto. */
  cor: string;
  /** Nome da campanha, em cima do da coleção, só com a campanha ligada (0430). */
  campanha?: string | null;
  /** A foto, preenchendo o círculo (a loja usa o next/image; o painel, a miniatura). */
  foto?: ReactNode;
  /** Na prévia do painel: as outras coleções ficam apagadas, para a editada se destacar. */
  apagado?: boolean;
}

/**
 * Pick your story (28/09): atalhos para cada história logo abaixo da capa, em círculos com a foto
 * escolhida no painel (0440) ou a peça mais nova da coleção; com a campanha ligada, o nome dela
 * aparece em cima do da coleção. No celular, a linha desliza para o lado. É a mesma linha na loja
 * e na prévia do painel.
 */
export function PickYourStory({ titulo, itens, Link = "a" }: { titulo: string | null; itens: ItemPickYourStory[]; Link?: ComponentType<PropsLink> | "a" }) {
  return (
    <section aria-labelledby="inicio-colecoes" className="px-3.5 py-8 md:px-5 md:py-12">
      <h2 id="inicio-colecoes" className="tc-titulo m-0 mb-5 text-center text-[clamp(30px,3.6vw,44px)]">{titulo ?? "Pick your story."}</h2>
      <ul className="m-0 flex list-none snap-x gap-3 overflow-x-auto p-0 pb-2 md:flex-wrap md:justify-center md:gap-6 md:overflow-visible">
        {itens.map((c) => (
          <li key={c.id} className={c.apagado ? "shrink-0 snap-start opacity-30" : "shrink-0 snap-start"}>
            <Link href={c.href} className="group grid w-24 justify-items-center gap-2 text-center md:w-32">
              <span className={`col-${c.cor.toLowerCase()} relative block size-20 overflow-hidden rounded-full border-2 border-tinta bg-colecao-fundo shadow-adesivo-sm transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none md:size-28`}>
                {c.foto}
              </span>
              {c.campanha && <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.14em] text-tinta-suave">{c.campanha}</span>}
              <span className="font-editorial text-[15px] font-bold leading-tight tracking-[-0.02em] md:text-lg">{c.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
