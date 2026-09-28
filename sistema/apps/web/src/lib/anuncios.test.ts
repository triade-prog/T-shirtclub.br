import { describe, expect, it } from "vitest";
import { eventoCompra, idAnuncios, rotuloConversao } from "./anuncios";

describe("Google Ads", () => {
  it("ID e rótulo só no formato do Google (entram na URL da tag e na CSP)", () => {
    expect(idAnuncios("AW-123456789")).toBe("AW-123456789");
    expect([idAnuncios(undefined), idAnuncios(""), idAnuncios("AW-12"), idAnuncios("G-ABC123"), idAnuncios("AW-123456789 https://x")]).toEqual([null, null, null, null, null]);
    expect(rotuloConversao("abCD_ef-12")).toBe("abCD_ef-12");
    expect([rotuloConversao(undefined), rotuloConversao("abc"), rotuloConversao("ab cd ef"), rotuloConversao("a/b/c/d")]).toEqual([null, null, null, null]);
  });

  it("conversão da compra: valor em reais e o número da reserva como transação", () => {
    expect(eventoCompra("AW-123456789", "compraX1", { numero: 1042, totalCentavos: 11999 })).toEqual([
      "event", "conversion", { send_to: "AW-123456789/compraX1", value: 119.99, currency: "BRL", transaction_id: "1042" },
    ]);
  });
});
