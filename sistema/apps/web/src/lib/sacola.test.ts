import { describe, expect, it } from "vitest";
import { adicionarNaSacola, gravarSacola, lerSacola, lerTamanho, ordinalClub, pecasNaSacola, removerDaSacola, textoAviso } from "./sacola";

describe("sacola no cookie", () => {
  it("lê e grava o formato slug.tamanho:qtd", () => {
    const itens = lerSacola("limone-amalfi.unico:1,limone-amalfi.plus:1,poodle.unico:1");
    expect(itens).toEqual([
      { slug: "limone-amalfi", tamanho: "UNICO", qtd: 1 },
      { slug: "limone-amalfi", tamanho: "PLUS", qtd: 1 },
      { slug: "poodle", tamanho: "UNICO", qtd: 1 },
    ]);
    expect(gravarSacola(itens)).toBe("limone-amalfi.unico:1,limone-amalfi.plus:1,poodle.unico:1");
    expect(pecasNaSacola(itens)).toBe(3);
  });

  it("ignora partes inválidas, repetidas e sem tamanho", () => {
    expect(lerSacola("A.unico:1,x.unico:0,y.unico:10,../etc.unico:1,ok.gg:1,antigo:1,ok.plus:1,ok.plus:2")).toEqual([{ slug: "ok", tamanho: "PLUS", qtd: 1 }]);
    expect(lerSacola(undefined)).toEqual([]);
  });

  it("tamanho do formulário: só unico e plus", () => {
    expect([lerTamanho("unico"), lerTamanho("plus"), lerTamanho("UNICO"), lerTamanho(null)]).toEqual(["UNICO", "PLUS", null, null]);
  });

  it("adiciona até 2 por estampa (somando os tamanhos) e 9 no total", () => {
    let r = adicionarNaSacola([], "a", "UNICO");
    r = adicionarNaSacola(r.itens, "a", "PLUS");
    expect(r).toEqual({ itens: [{ slug: "a", tamanho: "UNICO", qtd: 1 }, { slug: "a", tamanho: "PLUS", qtd: 1 }] });
    expect(adicionarNaSacola(r.itens, "a", "UNICO").aviso).toBe("MAX_PER_MODEL");
    const cheia = lerSacola("a.unico:2,b.unico:2,c.unico:2,d.plus:2,e.unico:1");
    expect(adicionarNaSacola(cheia, "f", "UNICO")).toEqual({ itens: cheia, aviso: "MAX_ITEMS" });
    expect(adicionarNaSacola([], "Nao Vale", "UNICO").aviso).toBe("VALIDATION_ERROR");
  });

  it("remove uma peça por vez, do tamanho certo", () => {
    expect(removerDaSacola(lerSacola("a.unico:2,b.unico:1"), "a", "UNICO"))
      .toEqual([{ slug: "a", tamanho: "UNICO", qtd: 1 }, { slug: "b", tamanho: "UNICO", qtd: 1 }]);
    expect(removerDaSacola(lerSacola("a.unico:1,a.plus:1"), "a", "PLUS")).toEqual([{ slug: "a", tamanho: "UNICO", qtd: 1 }]);
  });

  it("textos de aviso e ordinal do Club", () => {
    expect(textoAviso("MAX_ITEMS")).toMatch(/9 peças/);
    expect(textoAviso("MAX_PER_MODEL")).toMatch(/somando os tamanhos/);
    expect(textoAviso("OUTRO")).toBeNull();
    expect([0, 2, 3, 5, 6].map((p) => ordinalClub(p, 3))).toEqual(["1º Club", "3º Club", "1º Club", "3º Club", "1º Club"]);
  });
});
