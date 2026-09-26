import { describe, expect, it } from "vitest";
import { deCampoData, deMedidas, paraCampoData, paraCentavos, paraMedidas, paraReais, paraSlug } from "./catalogo";

describe("utilidades do catálogo no painel", () => {
  it("reais e centavos", () => {
    expect(paraCentavos("49,99")).toBe(4999);
    expect(paraCentavos("R$ 1.234,5")).toBe(123450);
    expect(paraCentavos("abc")).toBeNull();
    expect(paraReais(11999)).toBe("119,99");
    expect(paraReais(null)).toBe("");
  });
  it("slug sem acento", () => {
    expect(paraSlug("Il Limone — Rosa Açaí!")).toBe("il-limone-rosa-acai");
  });
  it("data no horário de Brasília", () => {
    expect(deCampoData("2026-10-01T09:30")).toBe("2026-10-01T09:30:00-03:00");
    expect(paraCampoData("2026-10-01T12:30:00.000Z")).toBe("2026-10-01T09:30");
    expect(deCampoData("01/10/2026")).toBeNull();
  });
  it("medidas em linhas", () => {
    expect(paraMedidas("busto: 104\ncomprimento: 68,5\nobs: veste largo")).toEqual({ busto: 104, comprimento: 68.5, obs: "veste largo" });
    expect(paraMedidas("sem dois pontos")).toBeNull();
    expect(deMedidas({ busto: 104, comprimento: 68.5 })).toBe("busto: 104\ncomprimento: 68,5");
  });
});
