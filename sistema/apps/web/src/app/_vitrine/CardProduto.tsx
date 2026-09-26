import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";
import { Selo } from "@tshirtclub/ui";
import { urlFoto, type CartaoProduto } from "@/lib/catalogo";
import { BotaoFavorito } from "./BotaoFavorito";

const SELO: Record<CartaoProduto["selo"], string | null> = { DISPONIVEL: null, ULTIMAS_UNIDADES: "Últimas peças", ESGOTADO: "Esgotado" };

/**
 * Cartão da vitrine (V4): foto 4:5 com contorno, selo de estoque, favoritar, adicionar rápido,
 * coleção, nome e preço. Os botões ficam fora do link (nada interativo dentro de outro); a foto
 * repete o link do nome só para o toque, fora da ordem do teclado.
 */
export function CardProduto({ produto, oferta, prioridade }: { produto: CartaoProduto; oferta?: string; prioridade?: boolean }) {
  const selo = SELO[produto.selo];
  const promo = produto.precoPromocionalCentavos;
  const href = `/produto/${produto.slug}`;
  return (
    <article className="group grid min-w-0 gap-2.5">
      <div className="relative aspect-4/5 overflow-hidden rounded-foto border-[1.5px] border-tinta bg-algodao shadow-[3px_3px_0_rgb(38_25_30/0.12)]">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          {produto.capa && (
            <Image
              src={urlFoto(produto.capa.caminho)}
              alt=""
              fill
              sizes="(min-width: 900px) 25vw, 50vw"
              priority={prioridade}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
            />
          )}
        </Link>
        {selo && <Selo fundo="citrino" className="absolute left-2.5 top-2.5">{selo}</Selo>}
        <BotaoFavorito slug={produto.slug} nome={produto.nome} className="absolute right-2.5 top-2.5 size-9.5" />
        {produto.selo !== "ESGOTADO" && (
          // A sacola (fatia 3) recebe a peça por aqui; sem JavaScript também funciona.
          <form action="/sacola" method="get" className="absolute bottom-2.5 right-2.5">
            <input type="hidden" name="adicionar" value={produto.slug} />
            <button type="submit" aria-label={`Adicionar ${produto.nome} à sacola`} className="grid size-10.5 place-items-center rounded-full border-[1.5px] border-tinta bg-papel/95 hover:bg-citrino">
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </button>
          </form>
        )}
      </div>
      <div className="px-0.5">
        {produto.colecao && <p className="m-0 text-[10px] font-bold uppercase tracking-[0.11em] text-tinta-suave">{produto.colecao.nome}</p>}
        <h3 className="m-0 mt-0.5 truncate text-sm font-bold tracking-[-0.02em]">
          <Link href={href} className="rounded-[4px]">{produto.nome}</Link>
        </h3>
        <p className="m-0 mt-1 font-display text-[15px] font-extrabold">
          {promo !== null ? (
            <>
              <s className="mr-1.5 font-texto text-xs font-normal text-tinta-suave">{formatarReais(produto.precoCentavos)}</s>
              {formatarReais(promo)}
            </>
          ) : formatarReais(produto.precoCentavos)}
          {produto.noClub && oferta && <span className="ml-1.5 font-texto text-[11px] font-bold text-verde-escuro">{oferta}</span>}
        </p>
      </div>
    </article>
  );
}
