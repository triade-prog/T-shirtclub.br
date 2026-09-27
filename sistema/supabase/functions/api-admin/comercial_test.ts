import { assertEquals } from "@std/assert";
import { ADMIN, logado } from "./teste_util.ts";

Deno.test("dashboard comercial: período validado, com a conexão do WhatsApp", async () => {
  const { pedir, rpcs } = await logado({
    rpcExtra: (f) => ({ admin_sales_dashboard: { periodo: "MES", atual: { pedidos: 4 } } } as Record<string, unknown>)[f],
  });
  const painel = await (await pedir("/v1/admin/comercial?periodo=MES")).json();
  assertEquals([painel.atual.pedidos, painel.whatsapp.conectado], [4, true]);
  assertEquals(rpcs.find((r) => r.funcao === "admin_sales_dashboard")!.args, { p_periodo: "MES" });
  await pedir("/v1/admin/comercial");
  assertEquals(rpcs.filter((r) => r.funcao === "admin_sales_dashboard").at(-1)!.args, { p_periodo: "HOJE" }, "sem período, hoje");
  assertEquals((await pedir("/v1/admin/comercial?periodo=SEMANA")).status, 400);
});

Deno.test("metas de vendas: lê e grava diária, mensal e anual em centavos", async () => {
  const metas = { diaCentavos: 60000, mesCentavos: 1500000, anoCentavos: 18000000 };
  const { pedir, rpcs } = await logado({
    rpcExtra: (f) => ({ admin_sales_goals: metas, admin_update_sales_goals: metas } as Record<string, unknown>)[f],
  });
  assertEquals(await (await pedir("/v1/admin/settings/metas")).json(), metas);
  assertEquals((await pedir("/v1/admin/settings/metas", metas, "PUT")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_update_sales_goals")!.args, { p_admin: ADMIN, p: metas });
  assertEquals((await pedir("/v1/admin/settings/metas", { diaCentavos: -1 }, "PUT")).status, 400);
  assertEquals((await pedir("/v1/admin/settings/metas", { mesCentavos: 10.5 }, "PUT")).status, 400);
});
