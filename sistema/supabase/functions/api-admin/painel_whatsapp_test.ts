import { assertEquals } from "@std/assert";
import { ADMIN, logado } from "./teste_util.ts";

// Painel de WhatsApp em abas (0570): conversas, envios com "Tentar de novo", números e horário.

const ID = "0b8f3c1e-1111-4111-8111-111111111111";
const extra = (f: string) => {
  if (f === "admin_wa_conversations") return [{ chat: "5577991230001" }];
  if (f === "admin_wa_conversation") return { chat: "5577991230001", eventos: [] };
  if (f === "admin_outbox_list") return { mensagens: [], dias: [] };
  if (f === "admin_outbox_retry") return { ok: true };
  if (f === "admin_wa_report") return { dias: 7 };
  if (f === "admin_update_quick_reply_settings") return { pausaHoras: 4 };
  return undefined;
};

Deno.test("conversas: a lista e a conversa, com o número no corpo", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: extra });
  assertEquals(await (await pedir("/v1/admin/whatsapp/conversas")).json(), [{ chat: "5577991230001" }]);
  assertEquals((await pedir("/v1/admin/whatsapp/conversa", { chat: "5577991230001" })).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_wa_conversation")!.args, { p_chat: "5577991230001" });
  assertEquals((await pedir("/v1/admin/whatsapp/conversa", { chat: "x; select 1" })).status, 400);
  assertEquals((await pedir("/v1/admin/whatsapp/conversa", { chat: "5577991230001", outro: 1 })).status, 400);
});

Deno.test("envios: filtro e dias validados; tentar de novo com quem pediu", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: extra });
  assertEquals((await pedir("/v1/admin/whatsapp/envios")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_outbox_list")!.args, { p_status: null, p_dias: 7 });
  assertEquals((await pedir("/v1/admin/whatsapp/envios?status=FALHOU&dias=30")).status, 200);
  assertEquals(rpcs.findLast((r) => r.funcao === "admin_outbox_list")!.args, { p_status: "FALHOU", p_dias: 30 });
  assertEquals((await pedir("/v1/admin/whatsapp/envios?status=OUTRO")).status, 400);
  assertEquals((await pedir("/v1/admin/whatsapp/envios?dias=31")).status, 400);

  assertEquals(await (await pedir(`/v1/admin/whatsapp/envios/${ID}/reenviar`, {})).json(), { ok: true });
  assertEquals(rpcs.find((r) => r.funcao === "admin_outbox_retry")!.args, { p_admin: ADMIN, p_id: ID });
  assertEquals((await pedir("/v1/admin/whatsapp/envios/abc/reenviar", {})).status, 404);
});

Deno.test("números de 7 ou 30 dias; horário de atendimento com a pausa", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: extra });
  assertEquals((await pedir("/v1/admin/whatsapp/numeros?dias=30")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_wa_report")!.args, { p_dias: 30 });
  assertEquals((await pedir("/v1/admin/whatsapp/numeros?dias=10")).status, 400);

  assertEquals((await pedir("/v1/admin/whatsapp/respostas/pausa", { inicioHora: 9, fimHora: 18, lembreteMinutos: 30 }, "PUT")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_update_quick_reply_settings")!.args,
    { p_admin: ADMIN, p: { inicioHora: 9, fimHora: 18, lembreteMinutos: 30 } });
  assertEquals((await pedir("/v1/admin/whatsapp/respostas/pausa", { inicioHora: 19, fimHora: 18 }, "PUT")).status, 400);
  assertEquals((await pedir("/v1/admin/whatsapp/respostas/pausa", {}, "PUT")).status, 400);
});
