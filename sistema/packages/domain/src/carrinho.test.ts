import { describe, expect, it } from "vitest";
import { adicionar, remover, totalPecas, validarCarrinho, type ItemCarrinho } from "./carrinho.ts";

const A = "a", B = "b";

describe("adicionar", () => {
  it("adiciona e soma quantidades", () => {
    let c: ItemCarrinho[] = [];
    for (const id of [A, A, B]) {
      const r = adicionar(c, id, 10);
      if (!r.ok) throw new Error(r.codigo);
      c = r.carrinho;
    }
    expect(c).toEqual([{ produtoId: A, qtd: 2 }, { produtoId: B, qtd: 1 }]);
    expect(totalPecas(c)).toBe(3);
  });

  it("no máximo 2 do mesmo modelo", () => {
    expect(adicionar([{ produtoId: A, qtd: 2 }], A, 10)).toEqual({ ok: false, codigo: "MAX_PER_MODEL" });
  });

  it("no máximo 9 peças", () => {
    const cheio = Array.from({ length: 9 }, (_, i) => ({ produtoId: `p${i}`, qtd: 1 }));
    expect(adicionar(cheio, "novo", 10)).toEqual({ ok: false, codigo: "MAX_ITEMS" });
  });

  it("não passa do que a vitrine mostrou disponível", () => {
    expect(adicionar([{ produtoId: A, qtd: 1 }], A, 1)).toEqual({ ok: false, codigo: "INSUFFICIENT_STOCK" });
    expect(adicionar([], A, 0)).toEqual({ ok: false, codigo: "INSUFFICIENT_STOCK" });
  });

  it("respeita limites vindos das configurações", () => {
    expect(adicionar([{ produtoId: A, qtd: 1 }], B, 5, { maxPecas: 1, maxPorProduto: 2 })).toEqual({ ok: false, codigo: "MAX_ITEMS" });
  });

  it("não altera o carrinho original", () => {
    const original = Object.freeze([{ produtoId: A, qtd: 1 }]);
    adicionar(original, A, 5);
    expect(original).toEqual([{ produtoId: A, qtd: 1 }]);
  });
});

describe("remover", () => {
  it("diminui e tira quando chega a zero", () => {
    expect(remover([{ produtoId: A, qtd: 2 }], A)).toEqual([{ produtoId: A, qtd: 1 }]);
    expect(remover([{ produtoId: A, qtd: 1 }, { produtoId: B, qtd: 1 }], A)).toEqual([{ produtoId: B, qtd: 1 }]);
  });
});

describe("validarCarrinho", () => {
  it("carrinho válido não tem erro", () => {
    expect(validarCarrinho([{ produtoId: A, qtd: 2 }, { produtoId: B, qtd: 1 }])).toEqual([]);
  });

  it("aponta cada regra quebrada", () => {
    expect(validarCarrinho([])).toEqual(["VALIDATION_ERROR"]);
    expect(validarCarrinho([{ produtoId: A, qtd: 3 }])).toEqual(["MAX_PER_MODEL"]);
    expect(validarCarrinho([{ produtoId: A, qtd: 1 }, { produtoId: A, qtd: 1 }])).toContain("VALIDATION_ERROR");
    expect(validarCarrinho([{ produtoId: A, qtd: 0 }])).toContain("VALIDATION_ERROR");
    expect(validarCarrinho([{ produtoId: A, qtd: 1.5 }])).toContain("VALIDATION_ERROR");
    const dez = Array.from({ length: 5 }, (_, i) => ({ produtoId: `p${i}`, qtd: 2 }));
    expect(validarCarrinho(dez)).toEqual(["MAX_ITEMS"]);
  });
});
