import { describe, expect, it } from "vitest";
import { destinoCompra, eventosCompra, idAnuncios } from "./anuncios";

describe("Google Ads", () => {
  it("ID da conta (AW-) ou da tag do Google (G-), só no formato do Google (entram na URL da tag e na CSP)", () => {
    expect(idAnuncios("AW-123456789")).toBe("AW-123456789");
    expect(idAnuncios("G-GNL9V6ZGE3")).toBe("G-GNL9V6ZGE3");
    expect([idAnuncios(undefined), idAnuncios(""), idAnuncios("AW-12"), idAnuncios("G-ab12cd"), idAnuncios("G-ABC"), idAnuncios("AW-123456789 https://x"), idAnuncios("UA-123456-1")])
      .toEqual([null, null, null, null, null, null, null]);
  });

  it("destino da compra: o snippet inteiro (AW-…/rótulo) ou só o rótulo com a conta AW-", () => {
    expect(destinoCompra("AW-123456789", "abCD_ef-12")).toBe("AW-123456789/abCD_ef-12");
    expect(destinoCompra("G-GNL9V6ZGE3", "AW-987654321/abCD_ef-12")).toBe("AW-987654321/abCD_ef-12");
    expect(destinoCompra("AW-123456789", "AW-987654321/abCD_ef-12")).toBe("AW-987654321/abCD_ef-12");
    // Com a tag G- e só o rótulo, não dá para saber a conta: a compra conta só pelo endereço
    expect(destinoCompra("G-GNL9V6ZGE3", "abCD_ef-12")).toBeNull();
    expect([destinoCompra("AW-123456789", undefined), destinoCompra("AW-123456789", "abc"), destinoCompra("AW-123456789", "ab cd ef"),
      destinoCompra("AW-123456789", "a/b/c/d"), destinoCompra("G-GNL9V6ZGE3", "G-GNL9V6ZGE3/abCD_ef-12")]).toEqual([null, null, null, null, null]);
  });

  it("compra: conversão do Google Ads com destino e, com a tag G-, a compra do Google Analytics", () => {
    const reserva = { numero: 1042, totalCentavos: 11999 };
    const dados = { value: 119.99, currency: "BRL", transaction_id: "1042" };
    expect(eventosCompra("AW-123456789", "AW-123456789/compraX1", reserva)).toEqual([["event", "conversion", { send_to: "AW-123456789/compraX1", ...dados }]]);
    expect(eventosCompra("G-GNL9V6ZGE3", null, reserva)).toEqual([["event", "purchase", dados]]);
    expect(eventosCompra("G-GNL9V6ZGE3", "AW-987654321/compraX1", reserva)).toEqual([
      ["event", "conversion", { send_to: "AW-987654321/compraX1", ...dados }], ["event", "purchase", dados],
    ]);
    expect(eventosCompra("AW-123456789", null, reserva)).toEqual([]);
  });
});
