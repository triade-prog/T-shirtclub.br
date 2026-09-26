import { describe, expect, it, vi } from "vitest";
import { relatarErroNext } from "./monitor.ts";

describe("relato de erros dos apps", () => {
  it("envia limpo, com o padrão da rota, e só com SENTRY_DSN", async () => {
    const buscar = vi.fn(() => Promise.resolve(new Response(null)));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await relatarErroNext("web", new Error("reserva de marina@exemplo.com"), "GET", { routePath: "/r", routeType: "render" },
      { SENTRY_DSN: "https://abc@o1.ingest.sentry.io/7", AMBIENTE: "teste" }, buscar as unknown as typeof fetch);
    expect(buscar).toHaveBeenCalledTimes(1);
    const corpo = String((buscar.mock.calls[0] as unknown[])[1] && ((buscar.mock.calls[0] as unknown[])[1] as RequestInit).body);
    expect(corpo).toContain("reserva de [email]");
    expect(corpo).not.toContain("marina@");
    expect(String(log.mock.calls[0]?.[0])).not.toContain("marina@");
    await relatarErroNext("admin", new Error("x"), "GET", {}, {}, buscar as unknown as typeof fetch);
    expect(buscar).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
