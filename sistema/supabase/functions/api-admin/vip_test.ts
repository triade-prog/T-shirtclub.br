import { assertEquals } from "@std/assert";
import { ADMIN, logado } from "./teste_util.ts";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

Deno.test("lista VIP: lista com busca e página validadas", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: (f) => (f === "admin_list_vip" ? { total: 1, itens: [{ id: ID, telefone: "+5577998128809" }] } : undefined) });
  assertEquals((await (await pedir("/v1/admin/vip?q=9981&pagina=2")).json()).total, 1);
  assertEquals(rpcs.find((r) => r.funcao === "admin_list_vip")!.args, { p_q: "9981", p_page: 2 });
  assertEquals((await pedir("/v1/admin/vip?pagina=0")).status, 400);
});

Deno.test("lista VIP: exportar e tirar da lista levam a administradora (auditoria)", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: (f) => ({ admin_export_vip: [], admin_remove_vip: null } as Record<string, unknown>)[f] });
  assertEquals((await pedir("/v1/admin/vip/export", {})).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_export_vip")!.args, { p_admin: ADMIN });
  assertEquals((await pedir(`/v1/admin/vip/${ID}`, undefined, "DELETE")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_remove_vip")!.args, { p_admin: ADMIN, p_id: ID });
  assertEquals((await pedir("/v1/admin/vip/nao-e-id", undefined, "DELETE")).status, 404);
});

Deno.test("lista VIP: cupom de boas-vindas em maiúsculas, ou nenhum, e a loja é avisada", async () => {
  const { pedir, rpcs, revalidacoes } = await logado({
    rpcExtra: (f) => ({ admin_vip_settings: { cupom: null }, admin_set_vip_coupon: { cupom: "VIP10" } } as Record<string, unknown>)[f],
  });
  assertEquals((await pedir("/v1/admin/vip/config", { cupom: " vip10 " }, "PUT")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_set_vip_coupon")!.args, { p_admin: ADMIN, p_code: "VIP10" });
  assertEquals((await pedir("/v1/admin/vip/config", { cupom: null }, "PUT")).status, 200);
  assertEquals((await pedir("/v1/admin/vip/config", { cupom: "com espaço" }, "PUT")).status, 400);
  assertEquals(revalidacoes.length, 2);
});
