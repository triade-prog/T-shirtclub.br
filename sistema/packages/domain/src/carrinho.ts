// Regras do carrinho (regra 3 da especificação). O carrinho vive no navegador; o servidor
// confere as mesmas regras de novo ao criar a tentativa e a reserva.

import type { CodigoErro } from "./erros.ts";

export interface LimitesCarrinho {
  maxPecas: number;
  maxPorProduto: number;
}

/** Padrão das regras; os valores reais vêm de app_settings. */
export const LIMITES_PADRAO: LimitesCarrinho = { maxPecas: 9, maxPorProduto: 2 };

/** Um tamanho de uma peça na sacola (0370): a peça dá o preço e as promoções; a variante, o estoque. */
export interface ItemCarrinho {
  produtoId: string;
  varianteId: string;
  qtd: number;
}

export type Carrinho = readonly ItemCarrinho[];

export function totalPecas(carrinho: Carrinho): number {
  return carrinho.reduce((soma, item) => soma + item.qtd, 0);
}

/** Peças de uma estampa na sacola, somando os tamanhos (o limite por peça vale para a soma). */
export function qtdDoProduto(carrinho: Carrinho, produtoId: string): number {
  return carrinho.filter((i) => i.produtoId === produtoId).reduce((soma, i) => soma + i.qtd, 0);
}

export function qtdDaVariante(carrinho: Carrinho, varianteId: string): number {
  return carrinho.find((i) => i.varianteId === varianteId)?.qtd ?? 0;
}

/** Erros do carrinho inteiro, sem olhar estoque (o estoque só o banco decide). */
export function validarCarrinho(carrinho: Carrinho, limites: LimitesCarrinho = LIMITES_PADRAO): CodigoErro[] {
  const erros = new Set<CodigoErro>();
  const vistos = new Set<string>();
  for (const item of carrinho) {
    if (!Number.isInteger(item.qtd) || item.qtd < 1 || vistos.has(item.varianteId)) erros.add("VALIDATION_ERROR");
    if (qtdDoProduto(carrinho, item.produtoId) > limites.maxPorProduto) erros.add("MAX_PER_MODEL");
    vistos.add(item.varianteId);
  }
  if (carrinho.length === 0) erros.add("VALIDATION_ERROR");
  if (totalPecas(carrinho) > limites.maxPecas) erros.add("MAX_ITEMS");
  return [...erros];
}

export type ResultadoCarrinho = { ok: true; carrinho: ItemCarrinho[] } | { ok: false; codigo: CodigoErro };

/**
 * Adiciona uma peça num tamanho. `disponivel` é o que a vitrine mostrou para esse tamanho;
 * serve só para não deixar a cliente escolher mais do que existe (o banco confere de novo).
 */
export function adicionar(
  carrinho: Carrinho,
  item: { produtoId: string; varianteId: string },
  disponivel: number,
  limites: LimitesCarrinho = LIMITES_PADRAO,
): ResultadoCarrinho {
  const atual = qtdDaVariante(carrinho, item.varianteId);
  if (totalPecas(carrinho) + 1 > limites.maxPecas) return { ok: false, codigo: "MAX_ITEMS" };
  if (qtdDoProduto(carrinho, item.produtoId) + 1 > limites.maxPorProduto) return { ok: false, codigo: "MAX_PER_MODEL" };
  if (atual + 1 > disponivel) return { ok: false, codigo: "INSUFFICIENT_STOCK" };
  const novo = atual
    ? carrinho.map((i) => (i.varianteId === item.varianteId ? { ...i, qtd: i.qtd + 1 } : i))
    : [...carrinho, { produtoId: item.produtoId, varianteId: item.varianteId, qtd: 1 }];
  return { ok: true, carrinho: novo };
}

export function remover(carrinho: Carrinho, varianteId: string): ItemCarrinho[] {
  return carrinho
    .map((i) => (i.varianteId === varianteId ? { ...i, qtd: i.qtd - 1 } : i))
    .filter((i) => i.qtd > 0);
}
