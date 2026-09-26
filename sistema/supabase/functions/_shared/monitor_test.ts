import { assert, assertEquals } from "@std/assert";
import { criarApp } from "./app.ts";
import { configurarMonitor, relatarErro } from "./monitor.ts";

Deno.test("monitor: erro inesperado vai limpo para o Sentry, com o padrão da rota; erro de negócio não vai", async () => {
  const enviados: { url: string; corpo: string }[] = [];
  const erroOriginal = console.error;
  const logs: string[] = [];
  console.error = (m: string) => logs.push(m);
  try {
    configurarMonitor({
      funcao: "api-public", ambiente: "teste", dsn: "https://abc@o1.ingest.sentry.io/7",
      buscar: (url, init) => {
        enviados.push({ url: String(url), corpo: String(init?.body) });
        return Promise.resolve(new Response(null, { status: 200 }));
      },
    });
    const app = criarApp("api-public", "s3gredo");
    app.get("/v1/reservations/:id", () => {
      throw new Error("falhou para +5577998128809");
    });
    const r = await app.request("/api-public/v1/reservations/6f1c2d3e-4b5a-4c6d-8e7f-000000000001", { headers: { "x-repasse-segredo": "s3gredo" } });
    assertEquals(r.status, 500);
    assertEquals(enviados.length, 1);
    const evento = JSON.parse(enviados[0]!.corpo.split("\n")[2]!);
    assertEquals(evento.tags.rota, "/api-public/v1/reservations/:id");
    assertEquals(evento.exception.values[0].value, "falhou para [telefone]");
    assert(!enviados[0]!.corpo.includes("998128809") && !logs.join().includes("998128809"), "nem no Sentry nem no log");

    // Monitor fora do ar não derruba nada
    configurarMonitor({ funcao: "worker", ambiente: "teste", dsn: "https://abc@o1.ingest.sentry.io/7", buscar: () => Promise.reject(new Error("fora")) });
    await relatarErro(new Error("x"));
    configurarMonitor({ funcao: "worker", ambiente: "teste" });
    await relatarErro(new Error("sem DSN, só o log"));
    assertEquals(enviados.length, 1);
  } finally {
    console.error = erroOriginal;
  }
});
