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

/** Até quantas unidades o selo mostra a quantidade (estratégia do Drop 01: a escassez é real). */
export const SELO_ATE = 4;

/**
 * Selo de estoque com a quantidade de verdade: "Última unidade", "Só 2 no Club", "Últimas 3" e
 * "Últimas 4"; acima disso, nada; sem estoque, "Esgotado". Vale para a peça e para cada tamanho.
 */
export function textoSelo(disponivel: number): string | null {
  if (disponivel <= 0) return "Esgotado";
  if (disponivel === 1) return "Última unidade";
  if (disponivel === 2) return "Só 2 no Club";
  return disponivel <= SELO_ATE ? `Últimas ${disponivel}` : null;
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

/**
 * Título da coleção em até duas linhas equilibradas ("La Dolce" / "Vita Club."): a quebra que
 * deixa a linha mais longa o mais curta possível, contando o ponto final; uma palavra só fica
 * numa linha. Mora em packages/ui, com o topo da coleção (a prévia do painel usa o mesmo).
 */
export { tituloEmDuasLinhas } from "@tshirtclub/ui";
