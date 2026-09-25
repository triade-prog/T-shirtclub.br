import { describe, expect, it } from "vitest";
import { CODIGOS_ERRO, ErroDominio, ehCodigoErro, type CodigoErro } from "./erros.ts";
import { textoErro } from "./textos.ts";
import { formatarReais } from "./dinheiro.ts";

describe("códigos de erro", () => {
  it("todo código tem texto próprio em português, sem o código cru", () => {
    for (const codigo of Object.keys(CODIGOS_ERRO) as CodigoErro[]) {
      const t = textoErro(codigo);
      expect(t.mensagem.length).toBeGreaterThan(10);
      expect(t.mensagem).not.toContain(codigo);
    }
  });

  it("ErroDominio serializa no corpo padrão e sabe o status HTTP", () => {
    const e = new ErroDominio("STOCK_UNAVAILABLE", { produtos: ["p1"] });
    expect(e.status).toBe(409);
    expect(JSON.parse(JSON.stringify(e))).toEqual({ erro: { codigo: "STOCK_UNAVAILABLE", detalhes: { produtos: ["p1"] } } });
    expect(new ErroDominio("NOT_FOUND").toJSON()).toEqual({ erro: { codigo: "NOT_FOUND" } });
  });

  it("reconhece códigos válidos", () => {
    expect(ehCodigoErro("OTP_LOCKED")).toBe(true);
    expect(ehCodigoErro("toString")).toBe(false);
    expect(ehCodigoErro(42)).toBe(false);
  });
});

describe("textos com contexto", () => {
  it("usa os dados da situação", () => {
    expect(textoErro("STOCK_UNAVAILABLE", { produtos: ["Limone Amalfi Coast"] }).mensagem).toMatch(/^Limone Amalfi Coast acabou agora/);
    expect(textoErro("STOCK_UNAVAILABLE", { produtos: ["A", "B", "C"] }).mensagem).toMatch(/^A, B e C acabaram agora/);
    expect(textoErro("PRICE_CHANGED", { totalCentavos: 12499 }).mensagem).toContain("R$ 124,99");
    expect(textoErro("OTP_INVALID", { tentativasRestantes: 1 }).mensagem).toContain("Resta 1 tentativa");
    expect(textoErro("ACTIVE_RESERVATION_EXISTS", { numeroReserva: 1048, horario: "14:32" }).mensagem).toContain("#1048 aberta até 14:32");
  });
});

describe("formatarReais", () => {
  it("formata centavos", () => {
    expect(formatarReais(11999)).toBe("R$ 119,99");
    expect(formatarReais(4999)).toBe("R$ 49,99");
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
  });
  it("recusa valor quebrado", () => {
    expect(() => formatarReais(10.5)).toThrow();
  });
});
