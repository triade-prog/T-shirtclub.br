// Formatos que a api-admin devolve no catálogo (admin_product_row_json, collection_json,
// look_json, promotion_json).
export interface Foto { id?: string; caminho: string; alt: string | null; tipo?: string; largura?: number; altura?: number; posicao?: number }
export type Tamanho = "UNICO" | "PLUS";
export interface Estoque { total: number; reservado: number; vendido: number; disponivel: number }
export interface ProdutoLinha {
  id: string; codigo: string; slug: string; nome: string; precoCentavos: number; colecaoId: string;
  ativo: boolean; publicado: boolean; capa: Foto | null; fotos: number;
  /** A soma dos tamanhos (o disponível conta só os ativos). */
  estoque: Estoque;
  tamanhos: { id: string; tamanho: Tamanho; rotulo: string; ativa: boolean; disponivel: number }[];
}
/** Um tamanho da peça (0370): SKU, se está à venda, medidas e o estoque dele. */
export interface Variante {
  id: string; tamanho: Tamanho; rotulo: string; sku: string; ativa: boolean;
  medidas: Record<string, string | number>; estoque: Estoque;
}
/** admin_get_product: a linha do produto, com "fotos" trocado pela lista das fotos. */
export interface ProdutoCompleto extends Omit<ProdutoLinha, "fotos"> {
  descricao: string | null; composicao: string | null; modelagem: string | null; cuidados: string | null;
  fotos: (Foto & { id: string })[];
  variantes: Variante[];
  movimentos: { tipo: string; qtd: number; motivo: string | null; em: string; tamanho?: Tamanho }[];
}
export const NOME_TAMANHO: Record<Tamanho, string> = { UNICO: "Único", PLUS: "Plus" };
export interface Capitulo { rotulo: string; titulo: string; texto: string | null; foto: { caminho: string; alt: string } | null; produtos: string[] }
export interface Colecao {
  id: string; nome: string; slug: string; descricao: string | null; chamada: string | null; cor: string; capa: { caminho: string; alt: string } | null; posicao: number; ativa: boolean; produtos: number;
  /** Campanha (0420, D35 e D36) */
  campanha: string | null; temporada: string | null; edicao: string | null; capaCelular: { caminho: string; alt: string } | null;
  paleta: (typeof PALETAS)[number][0]; campanhaAtiva: boolean; capitulos: Capitulo[];
  /** Foto do círculo do Pick your story no início (0440) */
  fotoStory: { caminho: string } | null;
}
/** Paletas de coleção (D36): a do Club e as das campanhas. */
export const PALETAS = [
  ["CLUB", "T-shirt Club (rosa e citrino)"],
  ["ESTATE_ITALIANA", "Estate Italiana (creme, azul mediterrâneo, tomate e limão)"],
  ["RIVIERA", "Riviera (areia, cobalto, coral e aqua)"],
  ["GIRLHOOD", "Girlhood (manteiga, cereja, blush e espresso)"],
  ["DOG_STORIES", "Dog Stories (creme, tabaco, azul francês e vermelho)"],
  ["FE", "Fé (marfim, vinho, areia e grafite)"],
] as const;
export interface Look { id: string; titulo: string; foto: { caminho: string; alt: string }; posicao: number; ativo: boolean; produtos: { id: string; nome: string; x: number; y: number }[] }
export interface Bloco { id?: string; tipo: string; refId: string | null; titulo: string | null; ativo: boolean }
export interface PaginaProdutos { itens: ProdutoLinha[]; total: number; pagina: number; porPagina: number }

export const CORES: readonly (readonly [string, string, string])[] = [
  ["TOMATE", "Tomate", "#ee4a2a"], ["LIMAO", "Limão", "#f2dd3d"], ["MEDITERRANEO", "Mediterrâneo", "#2f6fd0"],
  ["LAVANDA", "Lavanda", "#a77be0"], ["MENTA", "Menta", "#7fcfae"],
];
export const TIPOS_FOTO: readonly (readonly [string, string])[] = [["FRENTE", "Frente"], ["COSTAS", "Costas"], ["DETALHE", "Detalhe"], ["VESTIDA", "Vestida"], ["CAMPANHA", "Campanha"]];
export const TIPOS_BLOCO: Record<string, string> = {
  CAMPANHA: "Campanha (um look)", NOVIDADES: "Novidades", COLECOES: "Coleções", LOOKS: "Looks", MONTE_SEU_CLUB: "Monte seu Club", PRODUTOS: "Produtos de uma coleção",
  QUASE_ESGOTADAS: "Almost Gone (peças acabando)",
};

export type TipoPromocao = "DESCONTO_PRODUTO" | "COMPRE_MAIS" | "CUPOM";
/** promotion_json: o cupom vem no nível de cima (codigo, valor, quantidadeTotal...). */
export interface Promocao {
  id: string; tipo: TipoPromocao; nome: string; inicio: string; fim: string; encerradaEm?: string;
  situacao: "AGENDADA" | "ATIVA" | "ENCERRADA"; escopo?: "TODOS" | "ESPECIFICOS";
  produtos: Record<string, { modo: "PERCENTUAL" | "PRECO_FIXO"; valor: number }> | string[];
  modo?: string; niveis?: { qtdMin: number; pct: number }[]; grupo?: { qtd: number; precoCentavos: number };
  umaPorCliente?: boolean; orcamento?: { totalCentavos: number; usadoCentavos: number };
  codigo?: string; valor?: number; descontoMaximoCentavos?: number; gastoMinimoCentavos?: number;
  quantidadeTotal?: number; quantidadeUsada?: number; limitePorCliente?: number; validadeDias?: number;
}
export const TIPOS_PROMOCAO: Record<TipoPromocao, string> = {
  DESCONTO_PRODUTO: "Desconto na peça", COMPRE_MAIS: "Compre e economize mais", CUPOM: "Cupom",
};
