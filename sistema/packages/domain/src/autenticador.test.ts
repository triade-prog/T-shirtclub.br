import { describe, expect, it } from "vitest";
import { qrComoDataUrl } from "./autenticador.ts";

describe("qrComoDataUrl", () => {
  it("transforma o SVG puro do Supabase Auth em data URL (com # e aspas codificados)", () => {
    const url = qrComoDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).not.toContain("#");
    expect(decodeURIComponent(url.slice(url.indexOf(",") + 1))).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>');
  });

  it("mantém o que já é data URL", () => {
    expect(qrComoDataUrl("data:image/svg+xml;utf-8,<svg/>")).toBe("data:image/svg+xml;utf-8,<svg/>");
  });
});
