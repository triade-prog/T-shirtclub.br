import { describe, expect, it } from "vitest";
import { promocaoEntradaSchema } from "@tshirtclub/domain";
import { corpoClubComPeca, participaDoClub, promocaoDoClub, textoOfertaClub } from "./club";
import type { Promocao } from "./tiposCatalogo";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const club = (extra: Partial<Promocao> = {}): Promocao => ({
  id: "33333333-3333-4333-8333-333333333333", tipo: "COMPRE_MAIS", nome: "Club 3", modo: "PRECO_POR_GRUPO",
  inicio: "2026-09-01T03:00:00+00:00", fim: "2026-12-31T03:00:00+00:00", situacao: "ATIVA",
  escopo: "ESPECIFICOS", produtos: [A], grupo: { qtd: 3, precoCentavos: 11999 }, umaPorCliente: false,
  orcamento: { totalCentavos: 500000, usadoCentavos: 1200 }, ...extra,
});

describe("peça no Club", () => {
  it("acha a promoção ativa do Club; sem ela, a próxima agendada", () => {
    const niveis = club({ id: "n", modo: "NIVEIS", grupo: undefined });
    const agendada = club({ id: "ag", situacao: "AGENDADA", inicio: "2026-10-01T03:00:00+00:00" });
    const encerrada = club({ id: "enc", situacao: "ENCERRADA" });
    expect(promocaoDoClub([niveis, agendada, club(), encerrada])?.situacao).toBe("ATIVA");
    expect(promocaoDoClub([niveis, agendada, encerrada])?.id).toBe("ag");
    expect(promocaoDoClub([niveis, encerrada])).toBeNull();
  });

  it("todas as peças ou só as escolhidas", () => {
    expect(participaDoClub(club({ escopo: "TODOS", produtos: [] }), B)).toBe(true);
    expect(participaDoClub(club(), A)).toBe(true);
    expect(participaDoClub(club(), B)).toBe(false);
    expect(textoOfertaClub(club())).toBe("3 por R$ 119,99");
  });

  it("monta o mesmo corpo da tela de Promoções, aceito pelo schema da API", () => {
    const corpo = corpoClubComPeca(club(), B, true);
    expect(corpo).toMatchObject({ produtos: [{ produtoId: A }, { produtoId: B }], orcamentoCentavos: 500000, grupo: { qtd: 3, precoCentavos: 11999 } });
    expect(promocaoEntradaSchema.safeParse(corpo).success).toBe(true);
    expect(corpoClubComPeca(club({ produtos: [A, B] }), A, false)).toMatchObject({ produtos: [{ produtoId: B }] });
    // Marcar de novo não duplica a peça
    expect(corpoClubComPeca(club(), A, true)).toMatchObject({ produtos: [{ produtoId: A }] });
  });

  it("não deixa a promoção sem nenhuma peça", () => {
    expect(corpoClubComPeca(club(), A, false)).toBeNull();
  });
});
