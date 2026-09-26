import { describe, expect, it } from "vitest";
import { adicionarNaSacola, gravarSacola, lerSacola, ordinalClub, removerDaSacola, textoAviso } from "./sacola";

describe("sacola no cookie", () => {
  it("lê e grava o formato slug:qtd", () => {
    const itens = lerSacola("limone-amalfi:2,poodle:1");
    expect(itens).toEqual([{ produtoId: "limone-amalfi", qtd: 2 }, { produtoId: "poodle", qtd: 1 }]);
    expect(gravarSacola(itens)).toBe("limone-amalfi:2,poodle:1");
  });

  it("ignora partes inválidas e repetidas", () => {
    expect(lerSacola("A:1,x:0,y:10,../etc:1,ok:1,ok:2")).toEqual([{ produtoId: "ok", qtd: 1 }]);
    expect(lerSacola(undefined)).toEqual([]);
  });

  it("adiciona até 2 por modelo e 9 no total", () => {
    let r = adicionarNaSacola([], "a");
    r = adicionarNaSacola(r.itens, "a");
    expect(r).toEqual({ itens: [{ produtoId: "a", qtd: 2 }] });
    expect(adicionarNaSacola(r.itens, "a").aviso).toBe("MAX_PER_MODEL");
    const cheia = lerSacola("a:2,b:2,c:2,d:2,e:1");
    expect(adicionarNaSacola(cheia, "f")).toEqual({ itens: cheia, aviso: "MAX_ITEMS" });
    expect(adicionarNaSacola([], "Nao Vale").aviso).toBe("VALIDATION_ERROR");
  });

  it("remove uma peça por vez", () => {
    expect(removerDaSacola(lerSacola("a:2,b:1"), "a")).toEqual([{ produtoId: "a", qtd: 1 }, { produtoId: "b", qtd: 1 }]);
    expect(removerDaSacola(lerSacola("a:1,b:1"), "a")).toEqual([{ produtoId: "b", qtd: 1 }]);
  });

  it("textos de aviso e ordinal do Club", () => {
    expect(textoAviso("MAX_ITEMS")).toMatch(/9 peças/);
    expect(textoAviso("OUTRO")).toBeNull();
    expect([0, 2, 3, 5, 6].map((p) => ordinalClub(p, 3))).toEqual(["1º Club", "3º Club", "1º Club", "3º Club", "1º Club"]);
  });
});
