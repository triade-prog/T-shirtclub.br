import { describe, expect, it } from "vitest";
import { textoAcao } from "./rotulos";

describe("auditoria", () => {
  it("traduz a ação e mostra o código quando ainda não tem rótulo", () => {
    expect(textoAcao("pagamento.convertido")).toBe("Pagamento convertido em novo pedido");
    expect(textoAcao("nova.acao")).toBe("nova.acao");
  });
});
