import { describe, expect, it } from "vitest";
import {
  calcularPreco,
  precoPromocional,
  situacaoPromocao,
  type CompreMaisGrupo,
  type CompreMaisNiveis,
  type Cupom,
  type DescontoProduto,
  type LinhaEntrada,
  type Promocao,
} from "./preco.ts";

const agora = new Date("2026-10-10T15:00:00Z");
const dia = 86_400_000;
const periodo = { inicio: new Date(agora.getTime() - dia), fim: new Date(agora.getTime() + 30 * dia) };

const club: CompreMaisGrupo = {
  id: "club", tipo: "COMPRE_MAIS", modo: "PRECO_POR_GRUPO", nome: "Monte seu Club", ...periodo,
  escopo: "TODOS", produtos: [], umaPorCliente: false, grupo: { qtd: 3, precoCentavos: 11999 },
};

const leveMais: CompreMaisNiveis = {
  id: "niveis", tipo: "COMPRE_MAIS", modo: "NIVEIS", nome: "Leve mais", ...periodo,
  escopo: "TODOS", produtos: [], umaPorCliente: false, niveis: [{ qtdMin: 3, pct: 20 }, { qtdMin: 6, pct: 25 }],
};

const bemVinda: Cupom = {
  id: "cupom", tipo: "CUPOM", nome: "Boas-vindas", ...periodo, escopo: "TODOS", produtos: [],
  codigo: "BEMVINDA10", modo: "VALOR", valor: 1000, gastoMinimoCentavos: 8990,
  quantidadeTotal: 1000, quantidadeUsada: 37, limitePorCliente: 1, validadeDias: 3,
};

/** n peças de R$ 49,99, no máximo 2 por produto (regra 3). */
function pecas(n: number, preco = 4999): LinhaEntrada[] {
  const linhas: LinhaEntrada[] = [];
  for (let i = 0; i < Math.ceil(n / 2); i++) linhas.push({ produto: { id: `p${i}`, precoCentavos: preco }, qtd: Math.min(2, n - i * 2) });
  return linhas;
}

function total(itens: LinhaEntrada[], promocoes: Promocao[], codigoCupom?: string) {
  return calcularPreco({ itens, promocoes, agora, codigoCupom }).totalCentavos;
}

describe("Monte seu Club: 3 por R$ 119,99, a cada 3 (regra 3)", () => {
  it.each([
    [1, 4999], [2, 9998], [3, 11999], [4, 16998], [5, 21997], [6, 23998], [7, 28997], [8, 33996], [9, 35997],
  ])("%i peça(s) = %i centavos", (n, esperado) => {
    expect(total(pecas(n), [club])).toBe(esperado);
  });

  it("mostra o grupo, não porcentagem, e reparte o desconto entre as 3 peças", () => {
    const r = calcularPreco({ itens: pecas(3), promocoes: [club], agora });
    expect(r.aplicada?.rotulo).toBe("Monte seu Club (3 por R$ 119,99)");
    expect(r.descontoCentavos).toBe(2998);
    expect(r.linhas.map((l) => l.descontoCentavos)).toEqual([1998, 1000]);
    expect(r.linhas.reduce((a, l) => a + l.totalCentavos, 0)).toBe(11999);
  });

  it("dois grupos aparecem no rótulo", () => {
    expect(calcularPreco({ itens: pecas(6), promocoes: [club], agora }).aplicada?.rotulo).toBe("Monte seu Club (2× 3 por R$ 119,99)");
  });

  it("monta os grupos com as peças mais caras primeiro; a que sobra paga o preço normal", () => {
    const itens: LinhaEntrada[] = [
      { produto: { id: "barata", precoCentavos: 3999 }, qtd: 1 },
      { produto: { id: "cara", precoCentavos: 5999 }, qtd: 1 },
      { produto: { id: "media", precoCentavos: 4999 }, qtd: 2 },
    ];
    const r = calcularPreco({ itens, promocoes: [club], agora });
    expect(r.totalCentavos).toBe(11999 + 3999);
    expect(r.linhas.find((l) => l.produtoId === "barata")?.descontoCentavos).toBe(0);
  });

  it("grupo que não economiza não conta", () => {
    expect(calcularPreco({ itens: pecas(3, 3000), promocoes: [club], agora }).aplicada).toBeNull();
  });

  it("só peças participantes formam grupo", () => {
    const soAlgumas: CompreMaisGrupo = { ...club, escopo: "ESPECIFICOS", produtos: ["p0"] };
    expect(total(pecas(3), [soAlgumas])).toBe(3 * 4999);
  });

  it("diz quanto falta para o próximo grupo", () => {
    expect(calcularPreco({ itens: pecas(2), promocoes: [club], agora }).proximoGrupo).toMatchObject({ faltam: 1, qtd: 3, precoCentavos: 11999 });
    expect(calcularPreco({ itens: pecas(3), promocoes: [club], agora }).proximoGrupo?.faltam).toBe(3);
    expect(calcularPreco({ itens: pecas(2), promocoes: [], agora }).proximoGrupo).toBeNull();
  });
});

describe("compre e economize mais em níveis", () => {
  it("vale o maior nível atingido", () => {
    expect(total(pecas(2), [leveMais])).toBe(9998);
    expect(total(pecas(3), [leveMais])).toBe(3 * (4999 - 1000));
    expect(total(pecas(6), [leveMais])).toBe(6 * (4999 - 1250));
  });
});

describe("só a mais vantajosa (P6)", () => {
  it("entre níveis e grupo, vence o menor total", () => {
    // 3 peças: 20% = R$ 30,00 de desconto; grupo = R$ 29,98
    expect(calcularPreco({ itens: pecas(3), promocoes: [club, leveMais], agora }).aplicada?.promocaoId).toBe("niveis");
    // 9 peças: 25% = R$ 112,50; grupos = R$ 89,94
    expect(calcularPreco({ itens: pecas(9), promocoes: [club, leveMais], agora }).aplicada?.promocaoId).toBe("niveis");
    const maisGeneroso: CompreMaisGrupo = { ...club, grupo: { qtd: 3, precoCentavos: 9999 } };
    expect(calcularPreco({ itens: pecas(3), promocoes: [maisGeneroso, leveMais], agora }).aplicada?.promocaoId).toBe("club");
  });

  it("não soma descontos", () => {
    const r = calcularPreco({ itens: pecas(3), promocoes: [club, leveMais], agora, codigoCupom: "BEMVINDA10" });
    expect(r.descontoCentavos).toBe(3000);
  });
});

describe("cupom", () => {
  it("aplica quando é a melhor opção", () => {
    const r = calcularPreco({ itens: pecas(2), promocoes: [club, bemVinda], agora, codigoCupom: " bemvinda10 " });
    expect(r.cupom).toEqual({ codigo: "BEMVINDA10", situacao: "APLICADO" });
    expect(r.totalCentavos).toBe(8998);
    expect(r.linhas.reduce((a, l) => a + l.descontoCentavos, 0)).toBe(1000);
  });

  it("não é usado quando outra promoção é melhor (COUPON_NOT_BEST)", () => {
    const r = calcularPreco({ itens: pecas(3), promocoes: [club, bemVinda], agora, codigoCupom: "BEMVINDA10" });
    expect(r.cupom).toEqual({ codigo: "BEMVINDA10", situacao: "NAO_E_O_MELHOR" });
    expect(r.aplicada?.promocaoId).toBe("club");
  });

  it("no empate, fica a promoção automática e o cupom não é gasto", () => {
    const empata: Cupom = { ...bemVinda, valor: 2998, gastoMinimoCentavos: null };
    const r = calcularPreco({ itens: pecas(3), promocoes: [empata, club], agora, codigoCupom: "BEMVINDA10" });
    expect(r.aplicada?.promocaoId).toBe("club");
    expect(r.cupom?.situacao).toBe("NAO_E_O_MELHOR");
  });

  it("porcentagem com teto", () => {
    const quinze: Cupom = { ...bemVinda, codigo: "QUINZE", modo: "PERCENTUAL", valor: 15, descontoMaximoCentavos: 3000, gastoMinimoCentavos: null };
    expect(calcularPreco({ itens: pecas(1), promocoes: [quinze], agora, codigoCupom: "QUINZE" }).descontoCentavos).toBe(750);
    expect(calcularPreco({ itens: pecas(6), promocoes: [quinze], agora, codigoCupom: "QUINZE" }).descontoCentavos).toBe(3000);
  });

  it.each<[string, Partial<Cupom>, object, string]>([
    ["não existe", {}, {}, "NAO_ENCONTRADO"],
    ["ainda não começou", { inicio: new Date(agora.getTime() + dia) }, {}, "AGENDADO"],
    ["encerrado pelo painel", { encerradaEm: new Date(agora.getTime() - 1000) }, {}, "ENCERRADO"],
    ["esgotado", { quantidadeUsada: 1000 }, {}, "ESGOTADO"],
    ["abaixo do gasto mínimo", { gastoMinimoCentavos: 20000 }, {}, "GASTO_MINIMO"],
    ["só para outros produtos", { escopo: "ESPECIFICOS", produtos: ["outro"] }, {}, "SEM_PRODUTOS"],
    ["limite da cliente", {}, { usosDoCupom: 1 }, "LIMITE_CLIENTE"],
    ["validade depois do primeiro uso", {}, { usosDoCupom: 0, primeiroUsoDoCupom: new Date(agora.getTime() - 4 * dia) }, "VENCIDO"],
  ])("inválido quando %s", (_, cupom, cliente, motivo) => {
    const codigo = motivo === "NAO_ENCONTRADO" ? "OUTRO" : "BEMVINDA10";
    const r = calcularPreco({ itens: pecas(2), promocoes: [{ ...bemVinda, ...cupom }], agora, codigoCupom: codigo, cliente });
    expect(r.cupom).toMatchObject({ codigo, situacao: "INVALIDO", motivo });
    expect(r.descontoCentavos).toBe(0);
  });
});

describe("desconto do produto", () => {
  const semana: DescontoProduto = {
    id: "semana", tipo: "DESCONTO_PRODUTO", nome: "Semana Limone", ...periodo,
    produtos: { p0: { modo: "PERCENTUAL", valor: 20 }, p1: { modo: "PRECO_FIXO", valor: 3999 } },
  };

  it("preço promocional por produto, arredondado por peça", () => {
    const r = calcularPreco({ itens: pecas(3), promocoes: [semana], agora });
    expect(r.linhas.map((l) => l.descontoCentavos)).toEqual([2000, 1000]);
    expect(r.aplicada?.rotulo).toBe("Semana Limone");
  });

  it("vitrine mostra o preço promocional", () => {
    expect(precoPromocional({ id: "p0", precoCentavos: 4999 }, [semana], agora)).toEqual({ precoCentavos: 3999, promocaoId: "semana" });
    expect(precoPromocional({ id: "p1", precoCentavos: 4999 }, [semana], agora)).toEqual({ precoCentavos: 3999, promocaoId: "semana" });
    expect(precoPromocional({ id: "p9", precoCentavos: 4999 }, [semana], agora)).toBeNull();
  });

  it("descontos de produtos diferentes formam um preço promocional só", () => {
    const outra: DescontoProduto = { ...semana, id: "outra", nome: "Outra", produtos: { p2: { modo: "PERCENTUAL", valor: 10 } } };
    const r = calcularPreco({ itens: pecas(5), promocoes: [semana, outra], agora });
    expect(r.descontoCentavos).toBe(2000 + 2000 + 500);
    expect(r.aplicada?.rotulo).toBe("Preço promocional");
  });
});

describe("período, orçamento e uma por cliente", () => {
  it("situação calculada como no banco", () => {
    expect(situacaoPromocao(periodo, agora)).toBe("ATIVA");
    expect(situacaoPromocao({ ...periodo, inicio: new Date(agora.getTime() + 1) }, agora)).toBe("AGENDADA");
    expect(situacaoPromocao({ ...periodo, fim: agora }, agora)).toBe("ENCERRADA");
    expect(situacaoPromocao({ ...periodo, encerradaEm: agora }, agora)).toBe("ENCERRADA");
  });

  it("promoção agendada ou encerrada não vale", () => {
    expect(total(pecas(3), [{ ...club, inicio: new Date(agora.getTime() + dia) }])).toBe(3 * 4999);
    expect(total(pecas(3), [{ ...club, encerradaEm: agora }])).toBe(3 * 4999);
  });

  it("orçamento esgotado tira a promoção", () => {
    expect(total(pecas(3), [{ ...club, orcamento: { totalCentavos: 10000, usadoCentavos: 8000 } }])).toBe(3 * 4999);
    expect(total(pecas(3), [{ ...club, orcamento: { totalCentavos: 10000, usadoCentavos: 7002 } }])).toBe(11999);
  });

  it("uma por cliente", () => {
    const uma: CompreMaisGrupo = { ...club, umaPorCliente: true };
    expect(calcularPreco({ itens: pecas(3), promocoes: [uma], agora, cliente: { promocoesUsadas: new Set(["club"]) } }).totalCentavos).toBe(3 * 4999);
    expect(calcularPreco({ itens: pecas(3), promocoes: [uma], agora }).totalCentavos).toBe(11999);
  });
});

describe("invariantes", () => {
  it("em qualquer sacola, desconto das linhas soma o total e nenhuma peça fica negativa", () => {
    let semente = 7;
    const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const precos = [2999, 3999, 4999, 5999, 7999];
    for (let rodada = 0; rodada < 300; rodada++) {
      const itens: LinhaEntrada[] = [];
      let n = 0;
      for (let i = 0; i < 5 && n < 9; i++) {
        const qtd = Math.min(Math.floor(aleatorio() * 3), 9 - n);
        if (qtd) itens.push({ produto: { id: `p${i}`, precoCentavos: precos[Math.floor(aleatorio() * precos.length)]! }, qtd });
        n += qtd;
      }
      const r = calcularPreco({ itens, promocoes: [club, leveMais, bemVinda], agora, codigoCupom: aleatorio() > 0.5 ? "BEMVINDA10" : undefined });
      expect(r.linhas.reduce((a, l) => a + l.descontoCentavos, 0)).toBe(r.descontoCentavos);
      expect(r.totalCentavos).toBe(r.subtotalCentavos - r.descontoCentavos);
      for (const l of r.linhas) {
        expect(l.totalCentavos).toBeGreaterThanOrEqual(0);
        expect(l.descontoCentavos).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("recusa quantidade ou preço quebrados", () => {
    expect(() => calcularPreco({ itens: [{ produto: { id: "x", precoCentavos: 49.99 }, qtd: 1 }], promocoes: [], agora })).toThrow();
  });
});
