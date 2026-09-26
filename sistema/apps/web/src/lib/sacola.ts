// Sacola "Monte seu Club" (fatia 3). Vive num cookie só da loja (não vai para a api-public):
// a página é gerada no servidor e o "Adicionar" funciona sem JavaScript (GET /sacola?adicionar=,
// tratado no proxy). As regras de 9 peças e 2 por modelo são as do domínio; o estoque e o
// preço, a api-public confere na cotação e de novo na reserva.
import { adicionar, remover, type CodigoErro, type ItemCarrinho } from "@tshirtclub/domain";

export const COOKIE_SACOLA = "__Host-sacola";
export const SLUG = /^[a-z0-9-]{1,80}$/;
const ITEM = /^([a-z0-9-]{1,80}):([1-9])$/;
const MAX_LINHAS = 20;

/** Itens da sacola por slug (produtoId aqui é o slug). Valor inválido vira sacola vazia. */
export function lerSacola(valor: string | undefined): ItemCarrinho[] {
  if (!valor) return [];
  const itens: ItemCarrinho[] = [];
  for (const parte of valor.split(",").slice(0, MAX_LINHAS)) {
    const m = ITEM.exec(parte);
    if (m && !itens.some((i) => i.produtoId === m[1])) itens.push({ produtoId: m[1]!, qtd: Number(m[2]) });
  }
  return itens;
}

export function gravarSacola(itens: readonly ItemCarrinho[]): string {
  return itens.map((i) => `${i.produtoId}:${i.qtd}`).join(",");
}

/** Mais uma peça do slug; o estoque fica para a página (o proxy não consulta o catálogo). */
export function adicionarNaSacola(itens: readonly ItemCarrinho[], slug: string): { itens: ItemCarrinho[]; aviso?: CodigoErro } {
  if (!SLUG.test(slug)) return { itens: [...itens], aviso: "VALIDATION_ERROR" };
  const r = adicionar(itens, slug, Number.POSITIVE_INFINITY);
  return r.ok ? { itens: r.carrinho } : { itens: [...itens], aviso: r.codigo };
}

/** Tira uma peça do slug (o "Remover" de cada linha da V4, uma linha por peça). */
export function removerDaSacola(itens: readonly ItemCarrinho[], slug: string): ItemCarrinho[] {
  return remover(itens, slug);
}

// Sem httpOnly: o contador do cabeçalho lê no navegador (só slugs e quantidades, nada pessoal).
export const opcoesCookieSacola = { httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 } as const;
/** Para apagar: __Host- só é aceito com Secure e Path=/, então não dá para usar cookies().delete. */
export const opcoesApagarSacola = { ...opcoesCookieSacola, maxAge: 0 } as const;

const AVISOS: Partial<Record<CodigoErro, string>> = {
  MAX_ITEMS: "A sacola aceita até 9 peças por reserva.",
  MAX_PER_MODEL: "Cada estampa pode entrar no máximo 2 vezes.",
  VALIDATION_ERROR: "Não encontramos essa peça.",
};

export function textoAviso(codigo: string | string[] | undefined): string | null {
  return typeof codigo === "string" ? (AVISOS[codigo as CodigoErro] ?? null) : null;
}

/** Posição da peça dentro do trio, como na V4 ("1º Club", "2º Club", "3º Club"). */
export function ordinalClub(posicao: number, qtd: number): string {
  return `${(posicao % qtd) + 1}º Club`;
}
