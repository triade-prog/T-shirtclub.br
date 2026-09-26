import { describe, expect, it } from "vitest";
import type { CartaoProduto } from "./catalogo";
import { dividirNome, filtrarProdutos, lerFiltro, textoOferta } from "./vitrine";

const produto = (slug: string, selo: CartaoProduto["selo"]): CartaoProduto => ({
  id: slug, slug, nome: slug, precoCentavos: 4999, precoPromocionalCentavos: null, noClub: true,
  colecao: null, capa: null, disponivel: selo === "ESGOTADO" ? 0 : 5, selo,
});

describe("vitrine", () => {
  const lista = [produto("a", "DISPONIVEL"), produto("b", "ULTIMAS_UNIDADES"), produto("c", "ESGOTADO")];

  it("filtra por disponibilidade sem perder a ordem", () => {
    expect(filtrarProdutos(lista, "todas").map((p) => p.slug)).toEqual(["a", "b", "c"]);
    expect(filtrarProdutos(lista, "disponiveis").map((p) => p.slug)).toEqual(["a", "b"]);
    expect(filtrarProdutos(lista, "ultimas").map((p) => p.slug)).toEqual(["b"]);
  });

  it("filtro desconhecido ou repetido na URL vira todas", () => {
    expect(lerFiltro("ultimas")).toBe("ultimas");
    expect(lerFiltro("esgotadas")).toBe("todas");
    expect(lerFiltro(["disponiveis", "ultimas"])).toBe("todas");
    expect(lerFiltro(undefined)).toBe("todas");
  });

  it("texto da oferta do Club", () => {
    expect(textoOferta({ nome: "Monte seu Club", qtd: 3, precoCentavos: 11999, fim: "" })).toBe("3 por R$ 119,99");
    expect(textoOferta(null)).toBeUndefined();
  });

  it("destaca a coleção só quando o nome começa com ela como palavra inteira", () => {
    expect(dividirNome("Limone Amalfi Coast", "Limone")).toEqual({ destaque: "Limone", resto: "Amalfi Coast" });
    expect(dividirNome("Limoncello Spritz", "Limone")).toEqual({ destaque: null, resto: "Limoncello Spritz" });
    expect(dividirNome("Limone", "Limone")).toEqual({ destaque: null, resto: "Limone" });
    expect(dividirNome("Il Limone Rosa", "Limone")).toEqual({ destaque: null, resto: "Il Limone Rosa" });
    expect(dividirNome("Teddy", undefined)).toEqual({ destaque: null, resto: "Teddy" });
  });
});
