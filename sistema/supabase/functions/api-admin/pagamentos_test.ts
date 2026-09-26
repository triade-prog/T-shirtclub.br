import { assertEquals } from "@std/assert";
import { ErroBanco } from "../_shared/banco.ts";
import { ADMIN, erro, logado } from "./teste_util.ts";

const ANALISE = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

Deno.test("análise: estornar chama o provedor e depois registra (D6)", async () => {
  const m = await logado({
    rpcExtra: (f) => ({ review_payment_ref: { status: "ABERTA", providerPaymentId: "mp-falso-1" }, review_refunded: null } as Record<string, unknown>)[f],
  });
  await m.pagamentos.criarPix({ pagamentoId: "p1", valorCentavos: 4999, descricao: "x", expiraEm: new Date() });
  const r = await m.pedir(`/v1/admin/payment-reviews/${ANALISE}/resolve`, { resolucao: "ESTORNAR", nota: "Pagou depois do prazo" });
  assertEquals(await r.json(), { resolucao: "ESTORNAR" });
  assertEquals(m.pagamentos.pagamentos.get("mp-falso-1")!.status, "ESTORNADO");
  assertEquals(m.rpcs.find((x) => x.funcao === "review_refunded")!.args, { p_review_id: ANALISE, p_admin: ADMIN, p_note: "Pagou depois do prazo" });
});

Deno.test("análise: converter em novo pedido; sem estoque, a loja é avisada", async () => {
  const ok = await logado({ rpcExtra: (f) => (f === "review_convert" ? { numero: 1050, status: "PAGAMENTO_CONFIRMADO" } : undefined) });
  const r = await ok.pedir(`/v1/admin/payment-reviews/${ANALISE}/resolve`, { resolucao: "CONVERTER_EM_PEDIDO" });
  assertEquals((await r.json()).reserva.numero, 1050);
  const semEstoque = await logado({ rpcExtra: (f) => (f === "review_convert" ? new ErroBanco("TS163", "Sem estoque") : undefined) });
  assertEquals((await erro(await semEstoque.pedir(`/v1/admin/payment-reviews/${ANALISE}/resolve`, { resolucao: "CONVERTER_EM_PEDIDO" }))).codigo, "INSUFFICIENT_STOCK");
  const resolvida = await logado({ rpcExtra: (f) => (f === "review_payment_ref" ? { status: "RESOLVIDA", providerPaymentId: "x" } : undefined) });
  assertEquals((await erro(await resolvida.pedir(`/v1/admin/payment-reviews/${ANALISE}/resolve`, { resolucao: "ESTORNAR" }))).codigo, "ALREADY_APPLIED");
});

Deno.test("disputas: listar e resolver com observação (G2)", async () => {
  const m = await logado({ rpcExtra: (f) => ({ admin_list_payment_disputes: [{ id: "d1" }], resolve_dispute: null } as Record<string, unknown>)[f] });
  assertEquals((await (await m.pedir("/v1/admin/payment-disputes?status=TODAS")).json())[0].id, "d1");
  assertEquals(m.rpcs.find((x) => x.funcao === "admin_list_payment_disputes")!.args, { p_status: null });
  assertEquals((await m.pedir(`/v1/admin/payment-disputes/${ANALISE}/resolve`, { nota: "" })).status, 400);
  assertEquals((await m.pedir(`/v1/admin/payment-disputes/${ANALISE}/resolve`, { nota: "Banco decidiu a favor da loja" })).status, 200);
});
