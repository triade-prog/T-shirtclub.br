// Formatos que a api-admin devolve no catálogo (admin_product_row_json, collection_json,
// look_json, promotion_json).
export interface Foto { id?: string; caminho: string; alt: string | null; tipo?: string; largura?: number; altura?: number; posicao?: number }
export interface ProdutoLinha {
  id: string; codigo: string; slug: string; nome: string; precoCentavos: number; colecaoId: string;
  ativo: boolean; publicado: boolean; capa: Foto | null; fotos: number;
  estoque: { total: number; reservado: number; vendido: number; disponivel: number };
}
/** admin_get_product: a linha do produto, com "fotos" trocado pela lista das fotos. */
export interface ProdutoCompleto extends Omit<ProdutoLinha, "fotos"> {
  descricao: string | null; composicao: string | null; modelagem: string | null; medidas: Record<string, string | number> | null; cuidados: string | null;
  fotos: (Foto & { id: string })[];
  movimentos: { tipo: string; qtd: number; motivo: string | null; em: string }[];
}
export interface Colecao { id: string; nome: string; slug: string; descricao: string | null; cor: string; capa: { caminho: string; alt: string } | null; posicao: number; ativa: boolean; produtos: number }
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
