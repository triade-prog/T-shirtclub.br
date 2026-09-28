import { describe, expect, it } from "vitest";
import type { CartaoProduto } from "./catalogo";
import { dividirNome, filtrarProdutos, lerFiltro, tamanhoRapido, textoMedidas, textoOferta, textoSelo } from "./vitrine";

const produto = (slug: string, selo: CartaoProduto["selo"]): CartaoProduto => ({
  id: slug, slug, nome: slug, precoCentavos: 4999, precoPromocionalCentavos: null, noClub: true,
  colecao: null, capa: null, disponivel: selo === "ESGOTADO" ? 0 : 5, selo, tamanhos: [],
});
const tamanho = (t: "UNICO" | "PLUS", disponivel: number) => ({ id: t, tamanho: t, rotulo: t, disponivel, selo: "DISPONIVEL" as const });

describe("vitrine", () => {
  const lista = [produto("a", "DISPONIVEL"), produto("b", "ULTIMAS_UNIDADES"), produto("c", "ESGOTADO")];

  it("filtra por disponibilidade sem perder a ordem", () => {
    expect(filtrarProdutos(lista, "todas").map((p) => p.slug)).toEqual(["a", "b", "c"]);
    expect(filtrarProdutos(lista, "disponiveis").map((p) => p.slug)).toEqual(["a", "b"]);
    expect(filtrarProdutos(lista, "ultimas").map((p) => p.slug)).toEqual(["b"]);
  });

  it("selo com a quantidade real: última, só 2, últimas 3 e 4, e nada acima", () => {
    expect([0, 1, 2, 3, 4, 5, 12].map(textoSelo)).toEqual(["Esgotado", "Última unidade", "Só 2 no Club", "Últimas 3", "Últimas 4", null, null]);
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

describe("tamanhos (0370)", () => {
  it("o + do cartão adiciona direto só quando há um tamanho à venda", () => {
    expect(tamanhoRapido({ tamanhos: [tamanho("UNICO", 3)] })?.tamanho).toBe("UNICO");
    expect(tamanhoRapido({ tamanhos: [tamanho("UNICO", 0), tamanho("PLUS", 2)] })?.tamanho).toBe("PLUS");
    expect(tamanhoRapido({ tamanhos: [tamanho("UNICO", 3), tamanho("PLUS", 2)] })).toBeNull();
    expect(tamanhoRapido({ tamanhos: [tamanho("UNICO", 0)] })).toBeNull();
  });

  it("medidas em centímetros, na ordem do cadastro", () => {
    expect(textoMedidas({ busto: 104, comprimento: 68.5 })).toBe("busto 104 cm · comprimento 68,5 cm");
    expect(textoMedidas({ caimento: "amplo" })).toBe("caimento amplo");
    expect(textoMedidas({})).toBeNull();
    expect(textoMedidas(undefined)).toBeNull();
  });
});
