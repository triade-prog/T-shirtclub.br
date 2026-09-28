import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { Selo } from "./Selo.tsx";

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/**
 * Cartão do Shop the Look: a foto, o número do look e, embaixo, o título com as peças que aparecem
 * nela. Vai dentro de um <li> com a moldura (classeCartaoLook). É o mesmo cartão na loja e na prévia
 * do painel.
 */
export function CartaoLook({ numero, titulo, produtos, foto, Link = "a" }: {
  numero: number; titulo: string; produtos: { id: string; nome: string; href: string }[]; foto: ReactNode; Link?: ComponentType<PropsLink> | "a";
}) {
  return (
    <>
      {foto}
      <Selo fundo="citrino" brilho={false} className="absolute left-3 top-3">Look {String(numero).padStart(2, "0")}</Selo>
      <div className="absolute inset-x-3.5 bottom-3.5 rounded-campo border-[1.5px] border-tinta bg-papel/95 px-3.5 py-3">
        <p className="m-0 font-editorial text-base font-bold">{titulo}</p>
        {produtos.length > 0 && (
          <p className="m-0 mt-0.5 text-xs text-tinta-suave">
            {produtos.map((p, j) => (
              <span key={p.id}>{j > 0 && " · "}<Link href={p.href} className="underline decoration-rosa decoration-2 underline-offset-2">{p.nome}</Link></span>
            ))}
          </p>
        )}
      </div>
    </>
  );
}

/** A grade dos looks (o <ul>): um por linha no celular, 3 no computador. */
export const classeGradeLooks = "m-0 grid list-none gap-3 p-0 md:grid-cols-3";

/** Moldura do cartão do look (o <li>). */
export const classeCartaoLook = "relative min-h-[430px] overflow-hidden rounded-cartao border-2 border-tinta";
