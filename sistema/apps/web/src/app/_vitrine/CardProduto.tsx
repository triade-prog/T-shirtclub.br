import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";
import { CardProduto as Cartao } from "@tshirtclub/ui";
import { urlFoto, type CartaoProduto } from "@/lib/catalogo";
import { tamanhoRapido } from "@/lib/vitrine";
import { BotaoFavorito } from "./BotaoFavorito";

const SELO: Record<CartaoProduto["selo"], string | null> = { DISPONIVEL: null, ULTIMAS_UNIDADES: "Últimas peças", ESGOTADO: "Esgotado" };

/** O cartão da vitrine (packages/ui) com a foto otimizada, o favoritar e o adicionar à sacola. */
export function CardProduto({ produto, oferta, prioridade }: { produto: CartaoProduto; oferta?: string; prioridade?: boolean }) {
  const promo = produto.precoPromocionalCentavos;
  // Um tamanho à venda: o + adiciona direto. Dois: o + leva à página da peça para escolher.
  const rapido = tamanhoRapido(produto);
  const estiloMais = "tc-alvo relative grid size-10.5 place-items-center rounded-full border-[1.5px] border-tinta bg-papel/95 hover:bg-citrino";
  return (
    <Cartao
      nome={produto.nome}
      href={`/produto/${produto.slug}`}
      Link={Link}
      colecao={produto.colecao?.nome}
      preco={formatarReais(promo ?? produto.precoCentavos)}
      precoOriginal={promo !== null ? formatarReais(produto.precoCentavos) : null}
      oferta={produto.noClub ? oferta : null}
      selo={SELO[produto.selo]}
      foto={produto.capa && (
        <Image
          src={urlFoto(produto.capa.caminho)}
          alt=""
          fill
          sizes="(min-width: 900px) 25vw, 50vw"
          priority={prioridade}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
        />
      )}
      favorito={<BotaoFavorito slug={produto.slug} nome={produto.nome} className="tc-alvo absolute right-2.5 top-2.5 size-9.5" />}
      acao={produto.selo !== "ESGOTADO" && (rapido ? (
        // A sacola (fatia 3) recebe a peça por aqui; sem JavaScript também funciona.
        <form action="/sacola" method="get" className="absolute bottom-2.5 right-2.5">
          <input type="hidden" name="adicionar" value={produto.slug} />
          <input type="hidden" name="tamanho" value={rapido.tamanho.toLowerCase()} />
          <button type="submit" aria-label={`Adicionar ${produto.nome} (${rapido.rotulo}) à sacola`} className={estiloMais}>
            <Plus aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </button>
        </form>
      ) : (
        <Link href={`/produto/${produto.slug}?escolha=tamanho#tamanho`} aria-label={`Escolher o tamanho de ${produto.nome}`} className={`${estiloMais} absolute! bottom-2.5 right-2.5`}>
          <Plus aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </Link>
      ))}
    />
  );
}
