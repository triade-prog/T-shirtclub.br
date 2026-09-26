import Image from "next/image";
import Link from "next/link";
import { formatarReais } from "@tshirtclub/domain";
import { Selo } from "@tshirtclub/ui";
import { urlFoto, type CartaoProduto } from "@/lib/catalogo";

const SELO: Record<CartaoProduto["selo"], string | null> = { DISPONIVEL: null, ULTIMAS_UNIDADES: "Últimas peças", ESGOTADO: "Esgotado" };

/** Cartão da vitrine (V4): foto 4:5 com contorno, selo de estoque, coleção, nome e preço. */
export function CardProduto({ produto, oferta, prioridade }: { produto: CartaoProduto; oferta?: string; prioridade?: boolean }) {
  const selo = SELO[produto.selo];
  const promo = produto.precoPromocionalCentavos;
  return (
    <article className="min-w-0">
      <Link href={`/produto/${produto.slug}`} className="group grid gap-2.5 rounded-foto">
        <div className="relative aspect-4/5 overflow-hidden rounded-foto border-[1.5px] border-tinta bg-algodao shadow-[3px_3px_0_rgb(38_25_30/0.12)]">
          {produto.capa && (
            <Image
              src={urlFoto(produto.capa.caminho)}
              alt={produto.capa.alt ?? produto.nome}
              fill
              sizes="(min-width: 900px) 25vw, 50vw"
              priority={prioridade}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
            />
          )}
          {selo && <Selo fundo="citrino" className="absolute left-2.5 top-2.5">{selo}</Selo>}
        </div>
        <div className="px-0.5">
          {produto.colecao && <p className="m-0 text-[10px] font-bold uppercase tracking-[0.11em] text-tinta-suave">{produto.colecao.nome}</p>}
          <h3 className="m-0 mt-0.5 truncate text-sm font-bold tracking-[-0.02em]">{produto.nome}</h3>
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
      </Link>
    </article>
  );
}
