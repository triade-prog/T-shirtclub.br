// Leitura do catálogo no servidor (páginas geradas no servidor, G17): chama a api-public
// direto, com o segredo de repasse, sem passar pelo /api do navegador. Falha vira null e a
// página mostra o estado sem dados, nunca um erro 500.
import type { ItemCarrinho, ResultadoPreco } from "@tshirtclub/domain";
import { ipReal, opcoesLoja } from "@tshirtclub/servidor/repasse";

export type Selo = "DISPONIVEL" | "ULTIMAS_UNIDADES" | "ESGOTADO";
export interface Foto { caminho: string; alt: string | null; tipo?: string; largura?: number; altura?: number }
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
}
export interface Colecao { id: string; nome: string; slug: string; descricao: string | null; cor: string; capa: Foto | null }
export interface Look { id: string; titulo: string; foto: Foto; produtos: CartaoProduto[] }
/** Página do produto (/v1/catalog/products/:slug): o cartão mais fotos, textos e looks. */
export interface ProdutoDetalhe extends Omit<CartaoProduto, "colecao"> {
  descricao: string | null;
  composicao: string | null;
  modelagem: string | null;
  medidas: string | null;
  cuidados: string | null;
  colecao: Omit<Colecao, "id"> | null;
  fotos: Foto[];
  looks: Omit<Look, "produtos">[];
}
export interface OfertaClub { nome: string; qtd: number; precoCentavos: number; fim: string }

export type BlocoInicio =
  | { tipo: "CAMPANHA"; titulo: string | null; conteudo: Look | null }
  | { tipo: "NOVIDADES" | "PRODUTOS"; titulo: string | null; conteudo: CartaoProduto[] }
  | { tipo: "COLECOES"; titulo: string | null; conteudo: Colecao[] }
  | { tipo: "LOOKS"; titulo: string | null; conteudo: Look[] }
  | { tipo: "MONTE_SEU_CLUB"; titulo: string | null; conteudo: OfertaClub };

/** GET na api-public; o resultado fica em cache por 60 s (preço e selo mudam pouco). */
export async function buscarCatalogo<T>(caminho: string): Promise<T | null> {
  const op = opcoesLoja(process.env);
  if (!op.segredo || !process.env.SUPABASE_FUNCTIONS_URL) return null;
  try {
    const r = await fetch(`${op.destino}/${caminho}`, {
      headers: { "x-repasse-segredo": op.segredo, accept: "application/json" },
      next: { revalidate: 60 },
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
