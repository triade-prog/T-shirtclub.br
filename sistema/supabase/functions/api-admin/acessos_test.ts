import { assertEquals } from "@std/assert";
import { logado } from "./teste_util.ts";

Deno.test("acessos: período de 7, 30 ou 90 dias", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: (f) => (f === "admin_site_traffic" ? { hoje: { visitas: 3, visitantes: 2 } } : undefined) });
  assertEquals((await (await pedir("/v1/admin/acessos")).json()).hoje.visitas, 3);
  assertEquals(rpcs.find((r) => r.funcao === "admin_site_traffic")!.args, { p_days: 30 });
  assertEquals((await pedir("/v1/admin/acessos?dias=90")).status, 200);
  assertEquals((await pedir("/v1/admin/acessos?dias=1000")).status, 400);
});
