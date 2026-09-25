// Regras do carrinho (regra 3 da especificação). O carrinho vive no navegador; o servidor
// confere as mesmas regras de novo ao criar a tentativa e a reserva.

import type { CodigoErro } from "./erros.ts";

export interface LimitesCarrinho {
  maxPecas: number;
  maxPorProduto: number;
}

/** Padrão das regras; os valores reais vêm de app_settings. */
export const LIMITES_PADRAO: LimitesCarrinho = { maxPecas: 9, maxPorProduto: 2 };

export interface ItemCarrinho {
  produtoId: string;
  qtd: number;
}

export type Carrinho = readonly ItemCarrinho[];

export function totalPecas(carrinho: Carrinho): number {
  return carrinho.reduce((soma, item) => soma + item.qtd, 0);
}

export function qtdDoProduto(carrinho: Carrinho, produtoId: string): number {
  return carrinho.find((i) => i.produtoId === produtoId)?.qtd ?? 0;
}

/** Erros do carrinho inteiro, sem olhar estoque (o estoque só o banco decide). */
export function validarCarrinho(carrinho: Carrinho, limites: LimitesCarrinho = LIMITES_PADRAO): CodigoErro[] {
  const erros = new Set<CodigoErro>();
  const vistos = new Set<string>();
  for (const item of carrinho) {
    if (!Number.isInteger(item.qtd) || item.qtd < 1 || vistos.has(item.produtoId)) erros.add("VALIDATION_ERROR");
    if (item.qtd > limites.maxPorProduto) erros.add("MAX_PER_MODEL");
    vistos.add(item.produtoId);
  }
  if (carrinho.length === 0) erros.add("VALIDATION_ERROR");
  if (totalPecas(carrinho) > limites.maxPecas) erros.add("MAX_ITEMS");
  return [...erros];
}

export type ResultadoCarrinho = { ok: true; carrinho: ItemCarrinho[] } | { ok: false; codigo: CodigoErro };

/**
 * Adiciona uma peça. `disponivel` é o que a vitrine mostrou; serve só para não deixar
 * a cliente escolher mais do que existe (o banco confere de novo).
 */
export function adicionar(
  carrinho: Carrinho,
  produtoId: string,
  disponivel: number,
  limites: LimitesCarrinho = LIMITES_PADRAO,
): ResultadoCarrinho {
  const atual = qtdDoProduto(carrinho, produtoId);
  if (totalPecas(carrinho) + 1 > limites.maxPecas) return { ok: false, codigo: "MAX_ITEMS" };
  if (atual + 1 > limites.maxPorProduto) return { ok: false, codigo: "MAX_PER_MODEL" };
  if (atual + 1 > disponivel) return { ok: false, codigo: "INSUFFICIENT_STOCK" };
  const novo = atual
    ? carrinho.map((i) => (i.produtoId === produtoId ? { ...i, qtd: i.qtd + 1 } : i))
    : [...carrinho, { produtoId, qtd: 1 }];
  return { ok: true, carrinho: novo };
}

export function remover(carrinho: Carrinho, produtoId: string): ItemCarrinho[] {
  return carrinho
    .map((i) => (i.produtoId === produtoId ? { ...i, qtd: i.qtd - 1 } : i))
    .filter((i) => i.qtd > 0);
}
