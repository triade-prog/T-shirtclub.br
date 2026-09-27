import { describe, expect, it } from "vitest";
import { adicionar, qtdDoProduto, remover, totalPecas, validarCarrinho, type ItemCarrinho } from "./carrinho.ts";

// Peça A em Único (a1) e Plus (a2); peça B só em Único (b1)
const A1 = { produtoId: "a", varianteId: "a1" }, A2 = { produtoId: "a", varianteId: "a2" }, B1 = { produtoId: "b", varianteId: "b1" };
const item = (v: { produtoId: string; varianteId: string }, qtd: number): ItemCarrinho => ({ ...v, qtd });

describe("adicionar", () => {
  it("adiciona e soma quantidades do mesmo tamanho", () => {
    let c: ItemCarrinho[] = [];
    for (const v of [A1, A1, B1]) {
      const r = adicionar(c, v, 10);
      if (!r.ok) throw new Error(r.codigo);
      c = r.carrinho;
    }
    expect(c).toEqual([item(A1, 2), item(B1, 1)]);
    expect(totalPecas(c)).toBe(3);
  });

  it("tamanhos diferentes da mesma peça são linhas separadas", () => {
    const r = adicionar([item(A1, 1)], A2, 10);
    expect(r).toEqual({ ok: true, carrinho: [item(A1, 1), item(A2, 1)] });
  });

  it("no máximo 2 da mesma peça, somando os tamanhos", () => {
    expect(adicionar([item(A1, 2)], A1, 10)).toEqual({ ok: false, codigo: "MAX_PER_MODEL" });
    expect(adicionar([item(A1, 1), item(A2, 1)], A2, 10)).toEqual({ ok: false, codigo: "MAX_PER_MODEL" });
    expect(qtdDoProduto([item(A1, 1), item(A2, 1), item(B1, 1)], "a")).toBe(2);
  });

  it("no máximo 9 peças", () => {
    const cheio = Array.from({ length: 9 }, (_, i) => item({ produtoId: `p${i}`, varianteId: `v${i}` }, 1));
    expect(adicionar(cheio, { produtoId: "novo", varianteId: "nv" }, 10)).toEqual({ ok: false, codigo: "MAX_ITEMS" });
  });

  it("não passa do que a vitrine mostrou disponível naquele tamanho", () => {
    expect(adicionar([item(A1, 1)], A1, 1)).toEqual({ ok: false, codigo: "INSUFFICIENT_STOCK" });
    expect(adicionar([], A2, 0)).toEqual({ ok: false, codigo: "INSUFFICIENT_STOCK" });
  });

  it("respeita limites vindos das configurações", () => {
    expect(adicionar([item(A1, 1)], B1, 5, { maxPecas: 1, maxPorProduto: 2 })).toEqual({ ok: false, codigo: "MAX_ITEMS" });
  });

  it("não altera o carrinho original", () => {
    const original = Object.freeze([item(A1, 1)]);
    adicionar(original, A1, 5);
    expect(original).toEqual([item(A1, 1)]);
  });
});

describe("remover", () => {
  it("diminui o tamanho e tira quando chega a zero", () => {
    expect(remover([item(A1, 2)], "a1")).toEqual([item(A1, 1)]);
    expect(remover([item(A1, 1), item(A2, 1)], "a1")).toEqual([item(A2, 1)]);
  });
});

describe("validarCarrinho", () => {
  it("carrinho válido não tem erro", () => {
    expect(validarCarrinho([item(A1, 1), item(A2, 1), item(B1, 1)])).toEqual([]);
  });

  it("aponta cada regra quebrada", () => {
    expect(validarCarrinho([])).toEqual(["VALIDATION_ERROR"]);
    expect(validarCarrinho([item(A1, 3)])).toEqual(["MAX_PER_MODEL"]);
    expect(validarCarrinho([item(A1, 2), item(A2, 1)])).toEqual(["MAX_PER_MODEL"]);
    expect(validarCarrinho([item(A1, 1), item(A1, 1)])).toContain("VALIDATION_ERROR");
    expect(validarCarrinho([item(A1, 0)])).toContain("VALIDATION_ERROR");
    expect(validarCarrinho([item(A1, 1.5)])).toContain("VALIDATION_ERROR");
    const dez = Array.from({ length: 5 }, (_, i) => item({ produtoId: `p${i}`, varianteId: `v${i}` }, 2));
    expect(validarCarrinho(dez)).toEqual(["MAX_ITEMS"]);
  });
});
