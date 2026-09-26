// Leitura do catálogo no servidor (páginas geradas no servidor, G17): chama a api-public
// direto, com o segredo de repasse, sem passar pelo /api do navegador. Falha vira null e a
// página mostra o estado sem dados, nunca um erro 500.
import { opcoesLoja } from "@tshirtclub/servidor/repasse";

export type Selo = "DISPONIVEL" | "ULTIMAS_UNIDADES" | "ESGOTADO";
export interface Foto { caminho: string; alt: string | null; largura?: number; altura?: number }
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

/** URL pública da foto no bucket catalogo (leitura pública, envio só por URL assinada). */
export function urlFoto(caminho: string): string {
  return `${process.env.ORIGEM_IMAGENS ?? ""}/storage/v1/object/public/catalogo/${caminho}`;
}
