import { describe, expect, it } from "vitest";
import {
  ajusteEstoqueSchema,
  codigoAutenticadorSchema,
  criarTentativaSchema,
  codigoOtpSchema,
  cupomSchema,
  consultaSchema,
  decisaoCancelamentoSchema,
  linkReservaSchema,
  entregaSchema,
  freteSchema,
  substatusSchema,
  loginAdminSchema,
  nomeClienteSchema,
  pedidoCancelamentoSchema,
  reservaManualSchema,
  telefoneSchema,
} from "./schemas.ts";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
// Peça n no Único (variante 5n) ou no Plus (5n + 1): o id da variante só precisa ser outro uuid
const v = (n: number, plus = false) => `00000000-0000-4000-8000-0000000001${n}${plus ? 1 : 0}`;
const valido = {
  nome: "Marina Souza",
  telefone: "(77) 99812-8809",
  entrega: "RETIRADA",
  itens: [{ produtoId: id(1), varianteId: v(1), qtd: 2 }, { produtoId: id(2), varianteId: v(2), qtd: 1 }],
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

  it("recusa itens repetidos, acima de 2 por modelo, acima de 9 peças e sem o tamanho", () => {
    expect(criarTentativaSchema.safeParse({ ...valido, itens: [{ produtoId: id(1), varianteId: v(1), qtd: 1 }, { produtoId: id(1), varianteId: v(1), qtd: 1 }] }).success).toBe(false);
    expect(criarTentativaSchema.safeParse({ ...valido, itens: [{ produtoId: id(1), varianteId: v(1), qtd: 1 }, { produtoId: id(1), varianteId: v(1, true), qtd: 1 }] }).success).toBe(true);
    expect(criarTentativaSchema.safeParse({ ...valido, itens: [{ produtoId: id(1), varianteId: v(1), qtd: 3 }] }).success).toBe(false);
    expect(criarTentativaSchema.safeParse({ ...valido, itens: [{ produtoId: id(1), qtd: 1 }] }).success).toBe(false);
    const cinco = [1, 2, 3, 4, 5].map((n) => ({ produtoId: id(n), varianteId: v(n), qtd: 2 }));
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
    expect(ajusteEstoqueSchema.parse({ varianteId: v(1), delta: -2, motivo: " Peça com defeito " }))
      .toEqual({ varianteId: v(1), delta: -2, motivo: "Peça com defeito", tipo: "AJUSTE" });
    expect(ajusteEstoqueSchema.safeParse({ varianteId: v(1), delta: 0, motivo: "Nada" }).success).toBe(false);
    expect(ajusteEstoqueSchema.safeParse({ varianteId: v(1), delta: 1, motivo: "  " }).success).toBe(false);
    expect(ajusteEstoqueSchema.safeParse({ delta: 1, motivo: "Lote" }).success).toBe(false);
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

  it("consulta: pelo telefone com Turnstile, ou pela reserva do link", () => {
    expect(consultaSchema.parse({ motivo: "CONSULTA", telefone: "(77) 99812-8809", turnstileToken: "t" })).toEqual({
      motivo: "CONSULTA", telefone: "+5577998128809", turnstileToken: "t",
    });
    expect(consultaSchema.safeParse({ motivo: "CONSULTA", telefone: "(77) 99812-8809" }).success).toBe(false);
    expect(consultaSchema.safeParse({ motivo: "ENTREGA", reservaId: "x" }).success).toBe(false);
    expect(linkReservaSchema.safeParse({ chave: "a".repeat(22) }).success).toBe(true);
    expect(linkReservaSchema.safeParse({ chave: "a/".repeat(11) }).success).toBe(false);
  });
});

describe("reserva manual pelo painel (0470)", () => {
  const base = { nome: "Ana Paula", telefone: "(77) 99812-8809", entrega: "RETIRADA", pagamento: "LINK", totalEsperadoCentavos: 4999,
    itens: [{ produtoId: "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f", varianteId: "9c4d5e6f-7a8b-4c3d-9e4f-5a6b7c8d9e0f", qtd: 1 }] };
  it("aceita link e as formas pagas fora do site; telefone em E.164", () => {
    for (const pagamento of ["LINK", "DINHEIRO", "PIX_DIRETO", "MAQUININHA"]) expect(reservaManualSchema.safeParse({ ...base, pagamento }).success).toBe(true);
    expect(reservaManualSchema.parse(base).telefone).toBe("+5577998128809");
    expect(reservaManualSchema.safeParse({ ...base, pagamento: "CHEQUE" }).success).toBe(false);
  });
  it("desconto manual só com motivo", () => {
    expect(reservaManualSchema.safeParse({ ...base, descontoManualCentavos: 500 }).success).toBe(false);
    expect(reservaManualSchema.safeParse({ ...base, descontoManualCentavos: 500, motivoDesconto: "ok" }).success).toBe(false);
    expect(reservaManualSchema.safeParse({ ...base, descontoManualCentavos: 500, motivoDesconto: "Cliente fiel" }).success).toBe(true);
  });
  it("endereço só para motoboy ou envio, pago ou pelo link (0590, 0620)", () => {
    const endereco = { cep: "46400-000", rua: "R. Sátiro Santos", numero: "38", bairro: "Centro", cidade: "Caetité", uf: "BA" };
    expect(reservaManualSchema.safeParse({ ...base, entrega: "MOTOBOY", pagamento: "DINHEIRO", endereco }).success).toBe(true);
    expect(reservaManualSchema.safeParse({ ...base, entrega: "MOTOBOY", pagamento: "LINK", endereco }).success).toBe(true);
    expect(reservaManualSchema.safeParse({ ...base, pagamento: "DINHEIRO", endereco }).success).toBe(false);
  });
});
