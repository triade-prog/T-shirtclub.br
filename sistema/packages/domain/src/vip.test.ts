import { describe, expect, it } from "vitest";
import { condicaoBeneficioVip, textoBeneficioVip } from "./vip-textos.ts";
import { vipSchema } from "./vip.ts";

describe("lista VIP", () => {
  const base = { telefone: "(77) 99812-8809", origem: "POPUP", consentimento: true, privacidade: true };

  it("telefone normalizado, nome opcional e os dois aceites obrigatórios", () => {
    expect(vipSchema.parse({ ...base, nome: "  Marina " })).toEqual({ telefone: "+5577998128809", nome: "Marina", origem: "POPUP", consentimento: true, privacidade: true });
    expect(vipSchema.parse({ ...base, nome: "" }).nome).toBeUndefined();
    expect(vipSchema.safeParse({ ...base, consentimento: false }).success).toBe(false);
    expect(vipSchema.safeParse({ ...base, privacidade: undefined }).success).toBe(false);
    expect(vipSchema.safeParse({ ...base, origem: "INSTAGRAM" }).success).toBe(false);
    expect(vipSchema.safeParse({ ...base, telefone: "123" }).success).toBe(false);
  });

  it("benefício do cupom de boas-vindas em texto", () => {
    expect(textoBeneficioVip({ modo: "PERCENTUAL", valor: 10, minimoCentavos: null })).toBe("10% OFF");
    expect(textoBeneficioVip({ modo: "VALOR", valor: 1000, minimoCentavos: null })).toBe("R$ 10,00 OFF");
    expect(condicaoBeneficioVip({ modo: "VALOR", valor: 1000, minimoCentavos: 9990 })).toBe("na primeira compra acima de R$ 99,90");
    expect(condicaoBeneficioVip({ modo: "PERCENTUAL", valor: 10, minimoCentavos: null })).toBe("na primeira compra");
  });
});
