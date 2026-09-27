// Sacola "Monte seu Club" (fatia 3). Vive num cookie só da loja (não vai para a api-public):
// a página é gerada no servidor e o "Adicionar" funciona sem JavaScript (GET
// /sacola?adicionar=<slug>&tamanho=<unico|plus>, tratado no proxy). Cada item é uma peça num
// tamanho (0370): "limone-amalfi.plus:1". As regras de 9 peças e 2 por estampa (somando os
// tamanhos) são as do domínio; o estoque e o preço, a api-public confere na cotação e na reserva.
import { adicionar, remover, type CodigoErro, type ItemCarrinho, type Tamanho } from "@tshirtclub/domain";

export const COOKIE_SACOLA = "__Host-sacola";
export const SLUG = /^[a-z0-9-]{1,80}$/;
const ITEM = /^([a-z0-9-]{1,80})\.(unico|plus):([1-9])$/;
const MAX_LINHAS = 20;

export interface ItemSacola {
  slug: string;
  tamanho: Tamanho;
  qtd: number;
}

/** O tamanho como vem do formulário ("unico" ou "plus"); outro valor é null. */
export function lerTamanho(valor: unknown): Tamanho | null {
  return valor === "unico" ? "UNICO" : valor === "plus" ? "PLUS" : null;
}

const chave = (i: { slug: string; tamanho: Tamanho }) => `${i.slug}.${i.tamanho.toLowerCase()}`;

// As regras do domínio olham a peça (slug) e o tamanho (slug.tamanho) sem precisar dos ids.
const paraCarrinho = (itens: readonly ItemSacola[]): ItemCarrinho[] => itens.map((i) => ({ produtoId: i.slug, varianteId: chave(i), qtd: i.qtd }));
const daCarrinho = (itens: readonly ItemCarrinho[]): ItemSacola[] =>
  itens.map((i) => ({ slug: i.produtoId, tamanho: lerTamanho(i.varianteId.split(".")[1])!, qtd: i.qtd }));

/** Itens da sacola (peça pelo slug e tamanho). Valor inválido vira sacola vazia. */
export function lerSacola(valor: string | undefined): ItemSacola[] {
  if (!valor) return [];
  const itens: ItemSacola[] = [];
  for (const parte of valor.split(",").slice(0, MAX_LINHAS)) {
    const m = ITEM.exec(parte);
    const tamanho = m && lerTamanho(m[2]);
    if (m && tamanho && !itens.some((i) => i.slug === m[1] && i.tamanho === tamanho)) itens.push({ slug: m[1]!, tamanho, qtd: Number(m[3]) });
  }
  return itens;
}

export function gravarSacola(itens: readonly ItemSacola[]): string {
  return itens.map((i) => `${chave(i)}:${i.qtd}`).join(",");
}

export function pecasNaSacola(itens: readonly ItemSacola[]): number {
  return itens.reduce((soma, i) => soma + i.qtd, 0);
}

/** Mais uma peça no tamanho; o estoque fica para a página (o proxy não consulta o catálogo). */
export function adicionarNaSacola(itens: readonly ItemSacola[], slug: string, tamanho: Tamanho): { itens: ItemSacola[]; aviso?: CodigoErro } {
  if (!SLUG.test(slug)) return { itens: [...itens], aviso: "VALIDATION_ERROR" };
  const r = adicionar(paraCarrinho(itens), { produtoId: slug, varianteId: chave({ slug, tamanho }) }, Number.POSITIVE_INFINITY);
  return r.ok ? { itens: daCarrinho(r.carrinho) } : { itens: [...itens], aviso: r.codigo };
}

/** Tira uma peça do tamanho (o "Remover" de cada linha da V4, uma linha por peça). */
export function removerDaSacola(itens: readonly ItemSacola[], slug: string, tamanho: Tamanho): ItemSacola[] {
  return daCarrinho(remover(paraCarrinho(itens), chave({ slug, tamanho })));
}

// Sem httpOnly: o contador do cabeçalho lê no navegador (só slugs, tamanhos e quantidades).
export const opcoesCookieSacola = { httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 } as const;
/** Para apagar: __Host- só é aceito com Secure e Path=/, então não dá para usar cookies().delete. */
export const opcoesApagarSacola = { ...opcoesCookieSacola, maxAge: 0 } as const;

const AVISOS: Partial<Record<CodigoErro, string>> = {
  MAX_ITEMS: "A sacola aceita até 9 peças por reserva.",
  MAX_PER_MODEL: "Cada estampa pode entrar no máximo 2 vezes, somando os tamanhos.",
  VALIDATION_ERROR: "Não encontramos essa peça.",
};

export function textoAviso(codigo: string | string[] | undefined): string | null {
  return typeof codigo === "string" ? (AVISOS[codigo as CodigoErro] ?? null) : null;
}

/** Posição da peça dentro do trio, como na V4 ("1º Club", "2º Club", "3º Club"). */
export function ordinalClub(posicao: number, qtd: number): string {
  return `${(posicao % qtd) + 1}º Club`;
}
