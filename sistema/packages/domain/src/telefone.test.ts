import { describe, expect, it } from "vitest";
import { formatarTelefone, mascararTelefone, mesmoTelefone, normalizarTelefone, variantesWhatsApp } from "./telefone.ts";

describe("normalizarTelefone", () => {
  it.each([
    ["(77) 99812-8809", "+5577998128809"],
    ["77998128809", "+5577998128809"],
    ["+55 77 99812-8809", "+5577998128809"],
    ["55 77 99812 8809", "+5577998128809"],
    ["077 99812-8809", "+5577998128809"],
    ["(11) 9 8765-4321", "+5511987654321"],
  ])("%s vira %s", (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toEqual({ ok: true, e164: esperado });
  });

  it("acrescenta o nono dígito em celular antigo de 8 dígitos", () => {
    expect(normalizarTelefone("(77) 9812-8809")).toEqual({ ok: true, e164: "+5577998128809" });
    expect(normalizarTelefone("(21) 8765-4321")).toEqual({ ok: true, e164: "+5521987654321" });
  });

  it.each([
    ["fixo", "(77) 3422-1234"],
    ["DDD inexistente", "(20) 99812-8809"],
    ["curto", "99812-8809"],
    ["longo", "(77) 99812-88090"],
    ["todos iguais", "(77) 99999-9999"],
    ["vazio", ""],
    ["letras", "abc"],
    ["celular sem 9 na frente com 9 dígitos", "(77) 89812-8809"],
  ])("recusa %s", (_caso, entrada) => {
    expect(normalizarTelefone(entrada)).toEqual({ ok: false, codigo: "PHONE_INVALID" });
  });
});

describe("formatação", () => {
  it("formata e mascara", () => {
    expect(formatarTelefone("+5577998128809")).toBe("(77) 99812-8809");
    expect(mascararTelefone("+5577998128809")).toBe("(77) •••••-8809");
  });

  it("recusa telefone fora do E.164 esperado", () => {
    expect(() => mascararTelefone("77998128809")).toThrow();
  });
});

describe("WhatsApp com e sem o nono dígito (G4)", () => {
  it("gera as duas variantes", () => {
    expect(variantesWhatsApp("+5577998128809")).toEqual(["5577998128809", "557798128809"]);
  });

  it("reconhece o remetente nas duas formas e recusa outro número", () => {
    expect(mesmoTelefone("557798128809", "+5577998128809")).toBe(true);
    expect(mesmoTelefone("5577998128809@c.us", "+5577998128809")).toBe(true);
    expect(mesmoTelefone("557798128800", "+5577998128809")).toBe(false);
  });
});
