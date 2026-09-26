import { describe, expect, it } from "vitest";
import {
  ajusteEstoqueSchema,
  codigoAutenticadorSchema,
  criarTentativaSchema,
  codigoOtpSchema,
  cupomSchema,
  decisaoCancelamentoSchema,
  entregaSchema,
  freteSchema,
  substatusSchema,
  loginAdminSchema,
  nomeClienteSchema,
  pedidoCancelamentoSchema,
  telefoneSchema,
} from "./schemas.ts";

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
    expect(codigoOtpSchema.parse(" 482 193 ")).toBe("482193");
    expect(codigoOtpSchema.parse("482-193")).toBe("482193");
  });
});

describe("painel", () => {
  it("login: e-mail normalizado e senha de 12+ caracteres", () => {
    expect(loginAdminSchema.parse({ email: " Loja@TshirtClub.pt ", senha: "uma senha boa" }).email).toBe("loja@tshirtclub.pt");
    expect(loginAdminSchema.safeParse({ email: "loja@tshirtclub.pt", senha: "curta" }).success).toBe(false);
    expect(loginAdminSchema.safeParse({ email: "sem-arroba", senha: "uma senha boa" }).success).toBe(false);
  });

  it("código do autenticador aceita espaço ou traço", () => {
    expect(codigoAutenticadorSchema.parse("482 193")).toBe("482193");
    expect(codigoAutenticadorSchema.parse("482-193")).toBe("482193");
    expect(codigoAutenticadorSchema.safeParse("48219").success).toBe(false);
  });

  it("ajuste de estoque com motivo e sem zero", () => {
    expect(ajusteEstoqueSchema.parse({ delta: -2, motivo: " Peça com defeito " })).toEqual({ delta: -2, motivo: "Peça com defeito", tipo: "AJUSTE" });
    expect(ajusteEstoqueSchema.safeParse({ delta: 0, motivo: "Nada" }).success).toBe(false);
    expect(ajusteEstoqueSchema.safeParse({ delta: 1, motivo: "  " }).success).toBe(false);
  });

  it("cupom tem de 4 a 20 letras e números", () => {
    expect(cupomSchema.safeParse("ABC").success).toBe(false);
    expect(cupomSchema.parse("club")).toBe("CLUB");
  });

  it("cancelamento: observação opcional e decisão sempre com motivo", () => {
    expect(pedidoCancelamentoSchema.parse({})).toEqual({});
    expect(pedidoCancelamentoSchema.safeParse({ observacao: "x".repeat(501) }).success).toBe(false);
    expect(decisaoCancelamentoSchema.safeParse({ motivo: " " }).success).toBe(false);
    expect(decisaoCancelamentoSchema.parse({ motivo: " Pedido da cliente " }).motivo).toBe("Pedido da cliente");
  });

  it("entrega: retirada sem endereço; motoboy e envio com endereço completo", () => {
    expect(entregaSchema.parse({ modalidade: "RETIRADA", endereco: { cep: "x" } })).toEqual({ modalidade: "RETIRADA" });
    expect(entregaSchema.safeParse({ modalidade: "MOTOBOY" }).success).toBe(false);
    const e = entregaSchema.parse({
      modalidade: "ENVIO",
      endereco: { cep: "45000-000", rua: " Rua das Flores ", numero: "12", complemento: "", bairro: "Centro", cidade: "Vitória da Conquista", uf: "ba" },
    });
    expect(e).toEqual({
      modalidade: "ENVIO",
      endereco: { cep: "45000000", rua: "Rua das Flores", numero: "12", bairro: "Centro", cidade: "Vitória da Conquista", uf: "BA" },
    });
    expect(freteSchema.safeParse({ valorCentavos: 0 }).success).toBe(false);
    expect(substatusSchema.parse({ substatus: "ENVIADO", rastreio: "ab123456789br" }).rastreio).toBe("AB123456789BR");
  });
});
