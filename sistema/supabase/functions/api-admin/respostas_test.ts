import { assertEquals } from "@std/assert";
import { ADMIN, logado } from "./teste_util.ts";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const LISTA = { pausaHoras: 4, respostas: [{ id: ID, acao: "TEXTO", titulo: "Pagamento", palavras: ["pix"], texto: "PIX ou cartão", ativa: true }] };
const extra = (f: string) => (f.startsWith("admin_") && f.includes("quick_repl") ? LISTA : undefined);

Deno.test("respostas rápidas: a tela vê a lista; nova e editada vão normalizadas para o banco", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: extra });
  assertEquals(await (await pedir("/v1/admin/whatsapp/respostas")).json(), LISTA);

  const nova = await pedir("/v1/admin/whatsapp/respostas", { titulo: " Brindes ", palavras: ["Brinde", "brinde", "Presente!"], texto: "Temos brinde." });
  assertEquals(nova.status, 201);
  assertEquals(rpcs.find((r) => r.funcao === "admin_save_quick_reply")!.args, {
    p_admin: ADMIN, p: { titulo: "Brindes", palavras: ["brinde", "presente"], texto: "Temos brinde." },
  });

  assertEquals((await pedir(`/v1/admin/whatsapp/respostas/${ID}`, { titulo: "Pagamento", palavras: ["pix"], ativa: false }, "PUT")).status, 200);
  assertEquals(rpcs.filter((r) => r.funcao === "admin_save_quick_reply")[1]!.args, {
    p_admin: ADMIN, p: { titulo: "Pagamento", palavras: ["pix"], ativa: false, id: ID },
  });

  assertEquals((await pedir("/v1/admin/whatsapp/respostas", { titulo: "X", palavras: [] })).status, 400, "título curto");
  assertEquals((await pedir("/v1/admin/whatsapp/respostas", { titulo: "Brindes", palavras: ["a"] })).status, 400, "palavra de 1 letra");
  assertEquals((await pedir("/v1/admin/whatsapp/respostas/nao-e-id", { titulo: "Brindes", palavras: [] }, "PUT")).status, 404);
});

Deno.test("respostas rápidas: ordem, pausa e exclusão", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: extra });
  assertEquals((await pedir("/v1/admin/whatsapp/respostas/ordem", { ids: [ID] }, "PUT")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_order_quick_replies")!.args, { p_admin: ADMIN, p_ids: [ID] });
  assertEquals((await pedir("/v1/admin/whatsapp/respostas/ordem", { ids: ["x"] }, "PUT")).status, 400);

  assertEquals((await pedir("/v1/admin/whatsapp/respostas/pausa", { pausaHoras: 6 }, "PUT")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_update_quick_reply_settings")!.args, { p_admin: ADMIN, p: { pausaHoras: 6 } });
  assertEquals((await pedir("/v1/admin/whatsapp/respostas/pausa", { pausaHoras: 0 }, "PUT")).status, 400);

  assertEquals((await pedir(`/v1/admin/whatsapp/respostas/${ID}`, undefined, "DELETE")).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "admin_remove_quick_reply")!.args, { p_admin: ADMIN, p_id: ID });
});
