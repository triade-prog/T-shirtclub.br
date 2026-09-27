// Regras de apresentação da vitrine que não dependem de React (testadas em vitrine.test.ts).
import { formatarReais } from "@tshirtclub/domain";
import type { CartaoProduto, OfertaClub, TamanhoLoja } from "./catalogo";

export type Filtro = "todas" | "disponiveis" | "ultimas";

export function lerFiltro(valor: string | string[] | undefined): Filtro {
  return valor === "disponiveis" || valor === "ultimas" ? valor : "todas";
}

/** Filtro da página de coleção, aplicado sobre a lista inteira (uma chamada só à api-public). */
export function filtrarProdutos(produtos: readonly CartaoProduto[], filtro: Filtro): CartaoProduto[] {
  if (filtro === "disponiveis") return produtos.filter((p) => p.selo !== "ESGOTADO");
  if (filtro === "ultimas") return produtos.filter((p) => p.selo === "ULTIMAS_UNIDADES");
  return [...produtos];
}

/** "3 por R$ 119,99", o texto curto da oferta no cartão e no preço. */
export function textoOferta(oferta: OfertaClub | null | undefined): string | undefined {
  return oferta ? `${oferta.qtd} por ${formatarReais(oferta.precoCentavos)}` : undefined;
}

/** Separa o nome da coleção do começo do nome da peça, para o título em duas linhas (V4). */
export function dividirNome(nome: string, colecao: string | undefined): { destaque: string | null; resto: string } {
  const cabeca = nome.slice(0, colecao?.length ?? 0);
  const resto = nome.slice(cabeca.length);
  return colecao && cabeca.toLowerCase() === colecao.toLowerCase() && /^\s+\S/.test(resto)
    ? { destaque: cabeca, resto: resto.trim() }
    : { destaque: null, resto: nome };
}

/**
 * O tamanho que o "+" do cartão adiciona direto: o único com estoque. Com dois tamanhos à venda
 * (ou nenhum), null: a cliente escolhe na página da peça.
 */
export function tamanhoRapido(produto: Pick<CartaoProduto, "tamanhos">): TamanhoLoja | null {
  const aVenda = produto.tamanhos.filter((t) => t.disponivel > 0);
  return aVenda.length === 1 ? aVenda[0]! : null;
}

/** "busto 104 cm · comprimento 68 cm": número em centímetros, texto como veio. */
export function textoMedidas(medidas: Record<string, string | number> | undefined): string | null {
  const partes = Object.entries(medidas ?? {}).map(([k, v]) => `${k} ${typeof v === "number" ? `${String(v).replace(".", ",")} cm` : v}`);
  return partes.length > 0 ? partes.join(" · ") : null;
}
