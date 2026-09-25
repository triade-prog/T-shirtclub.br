import { describe, expect, it } from "vitest";
import { criarTentativaSchema, codigoOtpSchema, cupomSchema, nomeClienteSchema, telefoneSchema } from "./schemas.ts";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const valido = {
  nome: "Marina Souza",
  telefone: "(77) 99812-8809",
  entrega: "RETIRADA",
  itens: [{ produtoId: id(1), qtd: 2 }, { produtoId: id(2), qtd: 1 }],
  totalEsperadoCentavos: 11999,
  turnstileToken: "tok",
};

describe("schemas", () => {
  it("aceita a tentativa válida e normaliza o telefone", () => {
    const r = criarTentativaSchema.parse(valido);
    expect(r.telefone).toBe("+5577998128809");
  });

  it("recusa telefone inválido com o código PHONE_INVALID", () => {
    const r = telefoneSchema.safeParse("(77) 3422-1234");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("PHONE_INVALID");
  });

  it("recusa itens repetidos, acima de 2 por modelo e acima de 9 peças", () => {
    expect(criarTentativaSchema.safeParse({ ...valido, itens: [{ produtoId: id(1), qtd: 1 }, { produtoId: id(1), qtd: 1 }] }).success).toBe(false);
    expect(criarTentativaSchema.safeParse({ ...valido, itens: [{ produtoId: id(1), qtd: 3 }] }).success).toBe(false);
    const cinco = [1, 2, 3, 4, 5].map((n) => ({ produtoId: id(n), qtd: 2 }));
    expect(criarTentativaSchema.safeParse({ ...valido, itens: cinco }).success).toBe(false);
  });

  it("nome: letras, acentos, espaço, apóstrofo e hífen; nada de HTML", () => {
    expect(nomeClienteSchema.parse("  Ana D'Ávila-Souza ")).toBe("Ana D'Ávila-Souza");
    expect(nomeClienteSchema.safeParse("<script>").success).toBe(false);
    expect(nomeClienteSchema.safeParse("A").success).toBe(false);
  });

  it("cupom em maiúsculas e código de 6 dígitos", () => {
    expect(cupomSchema.parse(" bemvinda10 ")).toBe("BEMVINDA10");
    expect(codigoOtpSchema.safeParse("12345").success).toBe(false);
    expect(codigoOtpSchema.parse("482193")).toBe("482193");
  });
});
