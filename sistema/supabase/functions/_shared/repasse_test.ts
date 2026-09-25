import { assertEquals } from "@std/assert";
import { normalizarTelefone } from "@tshirtclub/domain";
import { ipDaCliente, segredoConfere } from "./repasse.ts";
import { criarApp } from "./app.ts";

Deno.test("segredo de repasse: só o valor exato passa", () => {
  assertEquals(segredoConfere("abc", "abc"), true);
  assertEquals(segredoConfere("abd", "abc"), false);
  assertEquals(segredoConfere("ab", "abc"), false);
  assertEquals(segredoConfere(null, "abc"), false);
  assertEquals(segredoConfere("abc", ""), false);
});

Deno.test("IP da cliente vem só do cabeçalho do repasse", () => {
  assertEquals(ipDaCliente(new Headers({ "x-cliente-ip": "200.1.2.3" })), "200.1.2.3");
  assertEquals(ipDaCliente(new Headers({ "x-forwarded-for": "1.1.1.1" })), null);
});

Deno.test("app recusa chamada sem o segredo e responde no formato padrão", async () => {
  const app = criarApp("api-public", "s3gredo");
  app.get("/v1/health", (c) => c.json({ ok: true }));
  const sem = await app.request("/api-public/v1/health");
  assertEquals(sem.status, 403);
  assertEquals(await sem.json(), { erro: { codigo: "FORBIDDEN" } });
  const com = await app.request("/api-public/v1/health", { headers: { "x-repasse-segredo": "s3gredo" } });
  assertEquals(com.status, 200);
  const nada = await app.request("/api-public/v1/nada", { headers: { "x-repasse-segredo": "s3gredo" } });
  assertEquals(nada.status, 404);
});

Deno.test("o pacote domain roda no Deno (G22)", () => {
  assertEquals(normalizarTelefone("(77) 99812-8809"), { ok: true, e164: "+5577998128809" });
});
