import { assertEquals } from "@std/assert";
import { ADMIN, logado } from "./teste_util.ts";

const LISTA = { abertos: [{ numero: 12, status: "ABERTO", motivo: "DUVIDA" }], finalizados: [], notas: { media: null, total: 0 } };
const extra = (f: string) => (f === "admin_tickets" || f.endsWith("_ticket") ? LISTA : undefined);

Deno.test("chamados: a tela vê a lista; assumir e finalizar vão para o banco com quem fez", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: extra });
  assertEquals(await (await pedir("/v1/admin/whatsapp/chamados")).json(), LISTA);

  assertEquals((await pedir("/v1/admin/whatsapp/chamados/12/assumir", {})).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_take_ticket")!.args, { p_admin: ADMIN, p_id: 12 });
  assertEquals((await pedir("/v1/admin/whatsapp/chamados/12/finalizar", {})).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_resolve_ticket")!.args, { p_admin: ADMIN, p_id: 12 });

  assertEquals((await pedir("/v1/admin/whatsapp/chamados/abc/finalizar", {})).status, 404);
  assertEquals((await pedir("/v1/admin/whatsapp/chamados/0/assumir", {})).status, 404);
});
