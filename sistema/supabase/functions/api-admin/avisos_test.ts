import { assertEquals } from "@std/assert";
import { ADMIN, logado } from "./teste_util.ts";

Deno.test("avisos da loja: a tela vê cada aviso ligado ou não, e o número normalizado vai para o banco", async () => {
  const { pedir, rpcs } = await logado({
    rpcExtra: (f) => ({
      admin_store_alerts: { telefone: null, desligados: ["lista_vip"] },
      admin_update_store_alerts: { telefone: "+5577998887777", desligados: [] },
    } as Record<string, unknown>)[f],
  });
  const tela = await (await pedir("/v1/admin/whatsapp/avisos")).json();
  assertEquals(tela.telefone, null);
  assertEquals(tela.avisos.find((a: { id: string }) => a.id === "lista_vip").ligado, false);
  assertEquals(tela.avisos.find((a: { id: string }) => a.id === "nova_reserva").ligado, true);

  assertEquals((await pedir("/v1/admin/whatsapp/avisos", { telefone: "(77) 99888-7777", desligados: [] }, "PUT")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_update_store_alerts")!.args, { p_admin: ADMIN, p: { telefone: "+5577998887777", desligados: [] } });
  // null desliga todos; aviso desconhecido e número inválido não passam
  assertEquals((await pedir("/v1/admin/whatsapp/avisos", { telefone: null }, "PUT")).status, 200);
  assertEquals(rpcs.filter((r) => r.funcao === "admin_update_store_alerts")[1]!.args, { p_admin: ADMIN, p: { telefone: null } });
  assertEquals((await pedir("/v1/admin/whatsapp/avisos", { desligados: ["outro"] }, "PUT")).status, 400);
  assertEquals((await pedir("/v1/admin/whatsapp/avisos", { telefone: "123" }, "PUT")).status, 400);
});

Deno.test("avisos da loja: teste vai para a fila, com limite por hora", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: (f) => (f === "admin_store_alert_test" ? "m1" : undefined) });
  assertEquals((await pedir("/v1/admin/whatsapp/avisos/teste", {})).status, 202);
  assertEquals(rpcs.find((r) => r.funcao === "admin_store_alert_test")!.args, { p_admin: ADMIN });
  const limitado = await logado({ limite: (k) => (k.startsWith("avisos_teste:") ? false : undefined), rpcExtra: (f) => (f === "admin_store_alert_test" ? "m1" : undefined) });
  assertEquals((await limitado.pedir("/v1/admin/whatsapp/avisos/teste", {})).status, 429);
  assertEquals(limitado.rpcs.some((r) => r.funcao === "admin_store_alert_test"), false);
});
