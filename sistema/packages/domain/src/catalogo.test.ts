import { describe, expect, it } from "vitest";
import {
  blocosInicioSchema,
  colecaoEntradaSchema,
  cotacaoSchema,
  lookEntradaSchema,
  nomesTamanhosSchema,
  produtoEntradaSchema,
  promocaoDoBancoSchema,
  promocaoEntradaSchema,
} from "./catalogo.ts";
import { calcularPreco } from "./preco.ts";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const periodo = { nome: "Teste", inicio: "2026-10-01T00:00:00-03:00", fim: "2026-10-31T23:59:00-03:00" };

describe("painel: catálogo", () => {
  it("coleção: endereço em minúsculas, cor da lista e capa com texto alternativo", () => {
    expect(colecaoEntradaSchema.parse({ nome: "Limone", slug: "Limone", cor: "LIMAO" })).toMatchObject({ slug: "limone", capa: null, ativa: true });
    expect(colecaoEntradaSchema.safeParse({ nome: "X", slug: "x", cor: "ROSA" }).success).toBe(false);
    expect(colecaoEntradaSchema.safeParse({ nome: "X", slug: "x", cor: "MENTA", capa: { caminho: "colecoes/x.webp", alt: "" } }).success).toBe(false);
    expect(colecaoEntradaSchema.safeParse({ nome: "X", slug: "com espaço", cor: "MENTA" }).success).toBe(false);
    // Campanha (0420): sem os campos, nada muda; com eles, até 3 capítulos de até 8 estampas
    expect(colecaoEntradaSchema.parse({ nome: "X", slug: "x", cor: "MENTA" })).not.toHaveProperty("paleta");
    const estate = colecaoEntradaSchema.parse({ nome: "Estate Italiana", slug: "estate-italiana", cor: "LIMAO", campanha: " Ciao, Estate! ", paleta: "ESTATE_ITALIANA",
      capitulos: [{ rotulo: "Mattina — Mercato", titulo: "Il mercato apre cedo.", produtos: ["00000000-0000-4000-8000-00000000a001"] }] });
    expect(estate).toMatchObject({ campanha: "Ciao, Estate!", paleta: "ESTATE_ITALIANA", capaCelular: null, capitulos: [{ foto: null }] });
    expect(colecaoEntradaSchema.safeParse({ nome: "X", slug: "x", cor: "MENTA", paleta: "NEON" }).success).toBe(false);
    const capitulo = { rotulo: "A", titulo: "B" };
    expect(colecaoEntradaSchema.safeParse({ nome: "X", slug: "x", cor: "MENTA", capitulos: [capitulo, capitulo, capitulo, capitulo] }).success).toBe(false);
  });

  it("produto: código em maiúsculas, preço em centavos inteiros e medidas curtas", () => {
    const unico = { tamanho: "UNICO", sku: "lim-01-uni", ativa: true, medidas: { busto: 104 } };
    const p = produtoEntradaSchema.parse({ colecaoId: ID, codigo: "lim-01", slug: "limone-amalfi", nome: "Limone Amalfi", precoCentavos: 4999, variantes: [unico] });
    expect(p).toMatchObject({ codigo: "LIM-01", publicado: false, descricao: null, variantes: [{ tamanho: "UNICO", sku: "LIM-01-UNI", ativa: true }] });
    expect(produtoEntradaSchema.safeParse({ ...p, precoCentavos: 49.99 }).success).toBe(false);
    expect(produtoEntradaSchema.safeParse({ ...p, variantes: [{ ...unico, medidas: { busto: "x".repeat(61) } }] }).success).toBe(false);
  });

  it("produto: cada tamanho uma vez, com SKU próprio", () => {
    const base = { colecaoId: ID, codigo: "LIM-01", slug: "limone-amalfi", nome: "Limone Amalfi", precoCentavos: 4999 };
    const unico = { tamanho: "UNICO", sku: "LIM-01-UNI", ativa: true };
    expect(produtoEntradaSchema.parse(base).variantes).toEqual([]);
    expect(produtoEntradaSchema.safeParse({ ...base, variantes: [unico, { tamanho: "PLUS", sku: "LIM-01-PLUS", ativa: false }] }).success).toBe(true);
    expect(produtoEntradaSchema.safeParse({ ...base, variantes: [unico, { ...unico, sku: "OUTRO" }] }).success).toBe(false);
    expect(produtoEntradaSchema.safeParse({ ...base, variantes: [unico, { tamanho: "PLUS", sku: "lim-01-uni", ativa: true }] }).success).toBe(false);
    expect(produtoEntradaSchema.safeParse({ ...base, variantes: [{ ...unico, tamanho: "GG" }] }).success).toBe(false);
  });

  it("nomes dos tamanhos: um ou os dois, de 2 a 40 letras", () => {
    expect(nomesTamanhosSchema.parse({ plus: " Plus · 44 ao 50 " })).toEqual({ plus: "Plus · 44 ao 50" });
    expect(nomesTamanhosSchema.safeParse({}).success).toBe(false);
    expect(nomesTamanhosSchema.safeParse({ unico: "U" }).success).toBe(false);
  });

  it("look: pontos dentro da foto e sem produto repetido", () => {
    const base = { titulo: "Verão", foto: { caminho: "looks/v.webp", alt: "Modelo" } };
    expect(lookEntradaSchema.safeParse({ ...base, produtos: [{ produtoId: ID, x: 0.5, y: 0.5 }] }).success).toBe(true);
    expect(lookEntradaSchema.safeParse({ ...base, produtos: [{ produtoId: ID, x: 1.5, y: 0.5 }] }).success).toBe(false);
    expect(lookEntradaSchema.safeParse({ ...base, produtos: [{ produtoId: ID, x: 0, y: 0 }, { produtoId: ID, x: 1, y: 1 }] }).success).toBe(false);
  });

  it("página inicial: tipos conhecidos", () => {
    expect(blocosInicioSchema.parse({ blocos: [{ tipo: "MONTE_SEU_CLUB" }] }).blocos[0]).toEqual({ tipo: "MONTE_SEU_CLUB", refId: null, titulo: null, ativo: true });
    expect(blocosInicioSchema.safeParse({ blocos: [{ tipo: "BANNER" }] }).success).toBe(false);
    expect(blocosInicioSchema.parse({ blocos: [{ tipo: "QUASE_ESGOTADAS", titulo: "Almost Gone" }] }).blocos[0]!.tipo).toBe("QUASE_ESGOTADAS");
  });
});

describe("painel: promoções", () => {
  it("Monte seu Club: preço por grupo, sem níveis", () => {
    const r = promocaoEntradaSchema.safeParse({ ...periodo, tipo: "COMPRE_MAIS", modo: "PRECO_POR_GRUPO", grupo: { qtd: 3, precoCentavos: 11999 } });
    expect(r.success).toBe(true);
    expect(promocaoEntradaSchema.safeParse({ ...periodo, tipo: "COMPRE_MAIS", modo: "PRECO_POR_GRUPO" }).success).toBe(false);
  });

  it("níveis crescentes", () => {
    const niveis = (n: { qtdMin: number; pct: number }[]) => promocaoEntradaSchema.safeParse({ ...periodo, tipo: "COMPRE_MAIS", modo: "NIVEIS", niveis: n }).success;
    expect(niveis([{ qtdMin: 3, pct: 20 }, { qtdMin: 6, pct: 25 }])).toBe(true);
    expect(niveis([{ qtdMin: 6, pct: 20 }, { qtdMin: 3, pct: 25 }])).toBe(false);
    expect(niveis([])).toBe(false);
  });

  it("desconto do produto vale só para os produtos escolhidos", () => {
    const r = promocaoEntradaSchema.parse({ ...periodo, tipo: "DESCONTO_PRODUTO", produtos: [{ produtoId: ID, modo: "PERCENTUAL", valor: 20 }] });
    expect(r.escopo).toBe("ESPECIFICOS");
    expect(promocaoEntradaSchema.safeParse({ ...periodo, tipo: "DESCONTO_PRODUTO", produtos: [{ produtoId: ID, modo: "PERCENTUAL", valor: 95 }] }).success).toBe(false);
  });

  it("cupom: código válido, fim depois do início e teto só na porcentagem", () => {
    const cupom = { codigo: "bemvinda10", modo: "VALOR", valor: 1000, quantidadeTotal: 100, validadeDias: 3 };
    expect(promocaoEntradaSchema.parse({ ...periodo, tipo: "CUPOM", cupom })).toMatchObject({ cupom: { codigo: "BEMVINDA10", limitePorCliente: 1 } });
    expect(promocaoEntradaSchema.safeParse({ ...periodo, fim: periodo.inicio, tipo: "CUPOM", cupom }).success).toBe(false);
    expect(promocaoEntradaSchema.safeParse({ ...periodo, tipo: "CUPOM", cupom: { ...cupom, descontoMaximoCentavos: 500 } }).success).toBe(false);
    expect(promocaoEntradaSchema.safeParse({ ...periodo, tipo: "CUPOM", escopo: "ESPECIFICOS", cupom }).success).toBe(false);
  });
});

describe("banco → motor de preço", () => {
  it("lê o JSON de pricing_promotions() e calcula", () => {
    const linhas = [
      { id: "b1", tipo: "COMPRE_MAIS", nome: "Monte seu Club", inicio: "2026-09-01T00:00:00Z", fim: "2026-12-31T00:00:00Z",
        situacao: "ATIVA", escopo: "TODOS", produtos: [], modo: "PRECO_POR_GRUPO", grupo: { qtd: 3, precoCentavos: 11999 }, umaPorCliente: false },
      { id: "b2", tipo: "CUPOM", nome: "Boas-vindas", inicio: "2026-09-01T00:00:00Z", fim: "2026-12-31T00:00:00Z", situacao: "ATIVA",
        escopo: "TODOS", produtos: [], modo: "VALOR", codigo: "BEMVINDA10", valor: 1000, descontoMaximoCentavos: null, gastoMinimoCentavos: null,
        quantidadeTotal: 100, quantidadeUsada: 0, limitePorCliente: 1, validadeDias: 3 },
    ];
    const promocoes = linhas.map((l) => promocaoDoBancoSchema.parse(l));
    const r = calcularPreco({
      itens: [{ produto: { id: "a", precoCentavos: 4999 }, qtd: 2 }, { produto: { id: "b", precoCentavos: 4999 }, qtd: 1 }],
      promocoes,
      agora: new Date("2026-10-10T12:00:00Z"),
      codigoCupom: "BEMVINDA10",
    });
    expect(r.totalCentavos).toBe(11999);
    expect(r.cupom?.situacao).toBe("NAO_E_O_MELHOR");
  });
});

describe("loja: cotação", () => {
  it("itens sem repetir e cupom opcional", () => {
    const V2 = "8b3c4d5e-6f7a-4b2c-8d3e-4f5a6b7c8d9e";
    expect(cotacaoSchema.safeParse({ itens: [{ produtoId: ID, varianteId: ID, qtd: 1 }], cupom: " bemvinda10 " }).success).toBe(true);
    expect(cotacaoSchema.safeParse({ itens: [{ produtoId: ID, varianteId: ID, qtd: 1 }, { produtoId: ID, varianteId: V2, qtd: 1 }] }).success).toBe(true);
    expect(cotacaoSchema.safeParse({ itens: [{ produtoId: ID, varianteId: ID, qtd: 1 }, { produtoId: ID, varianteId: ID, qtd: 1 }] }).success).toBe(false);
    expect(cotacaoSchema.safeParse({ itens: [{ produtoId: ID, qtd: 1 }] }).success).toBe(false);
    expect(cotacaoSchema.safeParse({ itens: [] }).success).toBe(false);
  });
});
