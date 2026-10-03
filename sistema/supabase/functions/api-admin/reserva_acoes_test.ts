import { assertEquals } from "@std/assert";
import { ADMIN, erro, logado } from "./teste_util.ts";

const R = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const PG = "7a1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

Deno.test("cancelar pela loja: estorna no Mercado Pago antes e passa o estorno ao banco (0590)", async () => {
  const m = await logado({
    rpcExtra: (f) => ({
      admin_cancel_preview: { pode: true, pago: true, pecas: 1, estornar: [{ id: PG, finalidade: "PRODUTOS", forma: "PIX", valorCentavos: 4999, idProvedor: "mp-falso-1" }] },
      admin_cancel_reservation: { id: R, status: "EXPIRADO" },
    } as Record<string, unknown>)[f],
  });
  await m.pagamentos.criarPix({ pagamentoId: PG, valorCentavos: 4999, descricao: "x", expiraEm: new Date() });
  assertEquals((await m.pedir(`/v1/admin/reservations/${R}/cancel`, { motivo: "x" })).status, 400);
  const r = await m.pedir(`/v1/admin/reservations/${R}/cancel`, { motivo: "Peça com defeito" });
  assertEquals((await r.json()).status, "EXPIRADO");
  assertEquals(m.pagamentos.pagamentos.get("mp-falso-1")!.status, "ESTORNADO");
  assertEquals(m.rpcs.find((x) => x.funcao === "admin_cancel_reservation")!.args,
    { p_admin: ADMIN, p_id: R, p_reason: "Peça com defeito", p_refunded: [PG] });
});

Deno.test("cancelar pela loja: bloqueios viram o erro certo e nada é estornado", async () => {
  for (const [bloqueio, codigo] of [["ENCERRADA", "RESERVATION_NOT_ACTIVE"], ["CONTESTACAO", "DISPUTE_OPEN"], ["FRETE_EM_PAGAMENTO", "PAYMENT_IN_PROGRESS"]]) {
    const m = await logado({ rpcExtra: (f) => (f === "admin_cancel_preview" ? { pode: false, bloqueio, pago: true, pecas: 1, estornar: [] } : undefined) });
    assertEquals((await erro(await m.pedir(`/v1/admin/reservations/${R}/cancel`, { motivo: "Cliente desistiu" }))).codigo, codigo);
    assertEquals(m.rpcs.some((x) => x.funcao === "admin_cancel_reservation"), false);
  }
});

Deno.test("cancelar pela loja: o Mercado Pago fora do ar não encerra a reserva", async () => {
  const m = await logado({
    rpcExtra: (f) => (f === "admin_cancel_preview"
      ? { pode: true, pago: true, pecas: 1, estornar: [{ id: PG, finalidade: "PRODUTOS", forma: "PIX", valorCentavos: 4999, idProvedor: "nao-existe" }] }
      : undefined),
  });
  assertEquals((await erro(await m.pedir(`/v1/admin/reservations/${R}/cancel`, { motivo: "Cliente desistiu" }))).codigo, "UPSTREAM_UNAVAILABLE");
  assertEquals(m.rpcs.some((x) => x.funcao === "admin_cancel_reservation"), false);
});

Deno.test("entrega pelo painel: modalidade e endereço validados (0590)", async () => {
  const m = await logado({ rpcExtra: (f) => (f === "admin_set_fulfillment" ? { id: R } : undefined) });
  assertEquals((await m.pedir(`/v1/admin/reservations/${R}/fulfillment`, { modalidade: "MOTOBOY" }, "PUT")).status, 400);
  const endereco = { cep: "46400-000", rua: "R. Sátiro Santos", numero: "38", bairro: "Centro", cidade: "Caetité", uf: "ba" };
  assertEquals((await m.pedir(`/v1/admin/reservations/${R}/fulfillment`, { modalidade: "MOTOBOY", endereco }, "PUT")).status, 200);
  assertEquals(m.rpcs.find((x) => x.funcao === "admin_set_fulfillment")!.args, {
    p_admin: ADMIN, p_reservation_id: R, p_mode: "MOTOBOY",
    p_address: { cep: "46400000", rua: "R. Sátiro Santos", numero: "38", bairro: "Centro", cidade: "Caetité", uf: "BA" },
  });
});
