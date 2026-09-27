import { describe, expect, it } from "vitest";
import { itensPublicacao, podePublicar, type EstadoPeca } from "./publicacao";

const pronta: EstadoPeca = {
  nova: false, dadosValidos: true, ativa: true,
  fotos: [{ tipo: "FRENTE" }, { tipo: "COSTAS" }, { tipo: "DETALHE" }, { tipo: "VESTIDA" }],
  descricao: "Verão italiano.", medidas: "busto: 104", disponivel: 12, colecaoAtiva: true, club: "3 por R$ 119,99",
};
const chaves = (e: EstadoPeca) => itensPublicacao(e).map((i) => `${i.chave}:${i.situacao}`);

describe("pronta para publicar", () => {
  it("peça completa: tudo certo", () => {
    expect(chaves(pronta)).toEqual(["dados:OK", "capa:OK", "estoque:OK", "club:OK"]);
    expect(podePublicar(itensPublicacao(pronta))).toBe(true);
    expect(itensPublicacao(pronta).find((i) => i.chave === "capa")?.texto).toBe("Capa e mais 3 fotos.");
  });

  it("só a capa, os dados e a peça ativa bloqueiam; o resto é sugestão", () => {
    expect(podePublicar(itensPublicacao({ ...pronta, fotos: [] }))).toBe(false);
    expect(podePublicar(itensPublicacao({ ...pronta, dadosValidos: false }))).toBe(false);
    expect(podePublicar(itensPublicacao({ ...pronta, ativa: false }))).toBe(false);
    const semNada = { ...pronta, fotos: [{ tipo: "FRENTE" }], descricao: " ", medidas: "", disponivel: 0, colecaoAtiva: false, club: null };
    expect(chaves(semNada)).toEqual(["dados:OK", "capa:OK", "angulos:SUGESTAO", "descricao:SUGESTAO", "medidas:SUGESTAO", "estoque:SUGESTAO", "colecao:SUGESTAO", "club:SUGESTAO"]);
    expect(podePublicar(itensPublicacao(semNada))).toBe(true);
    expect(itensPublicacao(semNada).find((i) => i.chave === "angulos")?.texto).toBe("Vale acrescentar: costas, detalhe e vestida.");
  });

  it("peça nova: fotos e estoque depois do rascunho; sem promoção do Club, nada sobre o Club", () => {
    expect(chaves({ ...pronta, nova: true, fotos: [], club: undefined })).toEqual(["dados:OK", "capa:FALTA"]);
  });
});
