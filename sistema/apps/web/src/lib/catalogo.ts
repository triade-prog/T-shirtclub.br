// Leitura do catálogo no servidor (páginas geradas no servidor, G17): chama a api-public
// direto, com o segredo de repasse, sem passar pelo /api do navegador. Falha vira null e a
// página mostra o estado sem dados, nunca um erro 500.
import type { BeneficioVip, ItemCarrinho, ResultadoPreco, Tamanho } from "@tshirtclub/domain";
import { ipReal, opcoesLoja } from "@tshirtclub/servidor/repasse";

export type Selo = "DISPONIVEL" | "ULTIMAS_UNIDADES" | "ESGOTADO";
export interface Foto { caminho: string; alt: string | null; tipo?: string; largura?: number; altura?: number }
/** Um tamanho à venda (0370): só os ativos, Único antes do Plus; a página traz as medidas. */
export interface TamanhoLoja {
  id: string;
  tamanho: Tamanho;
  rotulo: string;
  disponivel: number;
  selo: Selo;
  medidas?: Record<string, string | number>;
}
export interface CartaoProduto {
  id: string;
  slug: string;
  nome: string;
  precoCentavos: number;
  precoPromocionalCentavos: number | null;
  noClub: boolean;
  colecao: { slug: string; nome: string; cor: string } | null;
  capa: Foto | null;
  disponivel: number;
  selo: Selo;
  tamanhos: TamanhoLoja[];
}
export interface Colecao {
  id: string; nome: string; slug: string; descricao: string | null; cor: string; capa: Foto | null;
  /** Frase da faixa verde (0400); só em /v1/catalog/collections. */
  chamada?: string | null;
  /** Até 4 capas das peças, a mais recente primeiro (0400): capa e cartão da coleção sem foto própria. */
  fotos?: Foto[];
  /** Endereços antigos da coleção (0410): a loja redireciona para o atual. */
  slugsAntigos?: string[];
  /** Campanha (0420, D35 e D36): com o nome da campanha, a página vira capítulo de campanha. */
  campanha?: string | null;
  /** Campanha ligada no painel (0430): gravada desligada até as fotos limpas serem aprovadas. */
  campanhaAtiva?: boolean;
  temporada?: string | null;
  edicao?: string | null;
  capaCelular?: Foto | null;
  /** Foto do círculo do Pick your story, escolhida no painel (0440). */
  fotoStory?: { caminho: string } | null;
  paleta?: "CLUB" | "ESTATE_ITALIANA" | "RIVIERA" | "GIRLHOOD" | "DOG_STORIES" | "FE";
  capitulos?: CapituloColecao[];
}
/** Capítulo editorial da coleção (ex.: Mattina — Mercato): foto e as estampas dele (ids). */
export interface CapituloColecao { rotulo: string; titulo: string; texto?: string | null; foto: Foto | null; produtos: string[] }
export interface Look { id: string; titulo: string; foto: Foto; produtos: CartaoProduto[] }
/** Página do produto (/v1/catalog/products/:slug): o cartão mais fotos, textos e looks. */
export interface ProdutoDetalhe extends Omit<CartaoProduto, "colecao"> {
  descricao: string | null;
  composicao: string | null;
  modelagem: string | null;
  cuidados: string | null;
  colecao: Omit<Colecao, "id"> | null;
  fotos: Foto[];
  looks: Omit<Look, "produtos">[];
}
export interface OfertaClub { nome: string; qtd: number; precoCentavos: number; fim: string }

export type BlocoInicio =
  | { tipo: "CAMPANHA"; titulo: string | null; conteudo: Look | null }
  | { tipo: "NOVIDADES" | "PRODUTOS" | "QUASE_ESGOTADAS"; titulo: string | null; conteudo: CartaoProduto[] }
  | { tipo: "COLECOES"; titulo: string | null; conteudo: Colecao[] }
  | { tipo: "LOOKS"; titulo: string | null; conteudo: Look[] }
  | { tipo: "MONTE_SEU_CLUB"; titulo: string | null; conteudo: OfertaClub };

/** Etiqueta do cache do catálogo: o painel a expira ao gravar (POST /revalidar). */
export const ETIQUETA_CATALOGO = "catalogo";

/**
 * GET na api-public. O resultado fica em cache e sai dele quando o painel grava o catálogo
 * (revalidação ao publicar); os 60 s ficam como reserva e cobrem o selo de estoque, que
 * muda com as reservas.
 */
export async function buscarCatalogo<T>(caminho: string): Promise<T | null> {
  const op = opcoesLoja(process.env);
  if (!op.segredo || !process.env.SUPABASE_FUNCTIONS_URL) return null;
  try {
    const r = await fetch(`${op.destino}/${caminho}`, {
      headers: { "x-repasse-segredo": op.segredo, accept: "application/json" },
      next: { revalidate: 60, tags: [ETIQUETA_CATALOGO] },
      signal: AbortSignal.timeout(8_000),
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Cotação da sacola (POST /v1/cart/quote, que não reserva nada). Leva o IP real da cliente
 * para o limite por IP da api-public. Erro de regra volta com o código; queda, null.
 */
export async function cotarSacola(
  itens: ItemCarrinho[],
  cabecalhos: Headers,
): Promise<{ ok: true; cotacao: ResultadoPreco } | { ok: false; codigo: string } | null> {
  const op = opcoesLoja(process.env);
  if (!op.segredo || !process.env.SUPABASE_FUNCTIONS_URL) return null;
  const headers: Record<string, string> = { "x-repasse-segredo": op.segredo, accept: "application/json", "content-type": "application/json" };
  const ip = ipReal(cabecalhos);
  if (ip) headers["x-cliente-ip"] = ip;
  try {
    const r = await fetch(`${op.destino}/v1/cart/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify({ itens }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const corpo = (await r.json()) as ResultadoPreco | { erro?: { codigo?: string } };
    if (r.ok) return { ok: true, cotacao: corpo as ResultadoPreco };
    return { ok: false, codigo: ("erro" in corpo && corpo.erro?.codigo) || "INTERNAL" };
  } catch {
    return null;
  }
}

/** Oferta "Monte seu Club" vigente, lida do bloco da página inicial (mesmo cache de 60 s). */
export async function buscarOfertaClub(): Promise<OfertaClub | null> {
  const blocos = await buscarCatalogo<BlocoInicio[]>("v1/catalog/home");
  const bloco = blocos?.find((b) => b.tipo === "MONTE_SEU_CLUB");
  return (bloco?.conteudo as OfertaClub | undefined) ?? null;
}

/** URL pública da foto no bucket catalogo (leitura pública, envio só por URL assinada). */
export function urlFoto(caminho: string): string {
  return `${process.env.ORIGEM_IMAGENS ?? ""}/storage/v1/object/public/catalogo/${caminho}`;
}

/** Benefício do cupom de boas-vindas da Lista VIP (sem o código), para o pop-up e o rodapé. */
export async function buscarOfertaVip(): Promise<BeneficioVip | null> {
  return (await buscarCatalogo<{ beneficio: BeneficioVip | null }>("v1/catalog/vip"))?.beneficio ?? null;
}
