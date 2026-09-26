import { assertEquals } from "@std/assert";
import { assinaturaMpValida, lerPagamentoMp, mercadoPago } from "./pagamentos.ts";

const SEGREDO = "segredo-do-webhook";
const AGORA = new Date("2026-10-10T12:00:00Z");

async function assinar(manifesto: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("x-signature: HMAC do manifesto, janela de 5 min e tempo constante (G3)", async () => {
  const ts = String(AGORA.getTime() / 1000);
  const v1 = await assinar(`id:123456;request-id:req-1;ts:${ts};`);
  assertEquals(await assinaturaMpValida(`ts=${ts},v1=${v1}`, "req-1", "123456", SEGREDO, AGORA), true);
  assertEquals(await assinaturaMpValida(`ts=${ts},v1=${v1}`, "req-2", "123456", SEGREDO, AGORA), false, "outro request-id");
  assertEquals(await assinaturaMpValida(`ts=${ts},v1=${v1}`, "req-1", "999999", SEGREDO, AGORA), false, "outro pagamento");
  assertEquals(await assinaturaMpValida(`ts=${ts},v1=${v1}`, "req-1", "123456", "outro", AGORA), false, "outro segredo");
  assertEquals(await assinaturaMpValida(null, "req-1", "123456", SEGREDO, AGORA), false, "sem assinatura");
  const velho = String(AGORA.getTime() / 1000 - 6 * 60);
  const v1Velho = await assinar(`id:123456;request-id:req-1;ts:${velho};`);
  assertEquals(await assinaturaMpValida(`ts=${velho},v1=${v1Velho}`, "req-1", "123456", SEGREDO, AGORA), false, "ts de 6 min atrás");
  const v1Maiusc = await assinar(`id:abc123;request-id:req-1;ts:${ts};`);
  assertEquals(await assinaturaMpValida(`ts=${ts},v1=${v1Maiusc}`, "req-1", "ABC123", SEGREDO, AGORA), true, "id alfanumérico vai em minúsculas");
});

Deno.test("lê o pagamento do Mercado Pago no formato do banco", () => {
  assertEquals(lerPagamentoMp({
    id: 555, status: "approved", status_detail: "accredited", date_approved: "2026-10-10T09:19:30.000-03:00",
    transaction_amount: 119.99, currency_id: "BRL", external_reference: "ref-1", collector_id: 123,
  }), {
    providerPaymentId: "555", status: "APROVADO", statusProvedor: "approved", detalhe: "accredited",
    aprovadoEm: "2026-10-10T09:19:30.000-03:00", valorCentavos: 11999, moeda: "BRL", referencia: "ref-1", conta: "123",
  });
  assertEquals(lerPagamentoMp({ id: 1, status: "charged_back", transaction_amount: 1, currency_id: "BRL" }).status, "CONTESTADO");
  assertEquals(lerPagamentoMp({ id: 1, status: "in_process", transaction_amount: 1, currency_id: "BRL" }).status, "PENDENTE");
});

Deno.test("PIX de 30 min e cartão em binary_mode, com a chave de idempotência", async () => {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const buscar: typeof fetch = (url, init) => {
    pedidos.push({ url: String(url), init: init! });
    return Promise.resolve(new Response(JSON.stringify({
      id: 9, status: "pending", transaction_amount: 99.98, currency_id: "BRL", external_reference: "pag-1", collector_id: 123,
      date_of_expiration: "2026-10-10T09:30:00.000-03:00",
      point_of_interaction: { transaction_data: { qr_code: "00020126...", qr_code_base64: "iVBOR..." } },
    }), { status: 201 }));
  };
  const mp = mercadoPago({ accessToken: "TEST-1", urlWebhook: "https://p.supabase.co/functions/v1/webhook-payments", emailPix: "pagamentos@tshirtclub.pt" }, buscar);
  const pix = await mp.criarPix({ pagamentoId: "pag-1", valorCentavos: 9998, descricao: "Reserva #1048", expiraEm: new Date("2026-10-10T12:30:00Z") });
  assertEquals(pix.pix, { copiaECola: "00020126...", qrBase64: "iVBOR...", expiraEm: "2026-10-10T09:30:00.000-03:00" });
  const corpo = JSON.parse(String(pedidos[0]!.init.body));
  assertEquals(corpo.transaction_amount, 99.98);
  assertEquals(corpo.payment_method_id, "pix");
  assertEquals(corpo.date_of_expiration, "2026-10-10T09:30:00.000-03:00");
  assertEquals(corpo.external_reference, "pag-1");
  assertEquals((pedidos[0]!.init.headers as Record<string, string>)["x-idempotency-key"], "pag-1");

  await mp.criarCartao({ pagamentoId: "pag-2", valorCentavos: 9998, descricao: "Reserva #1048", token: "tok_123", metodo: "master", email: "marina@exemplo.com" });
  const cartao = JSON.parse(String(pedidos[1]!.init.body));
  assertEquals([cartao.binary_mode, cartao.installments, cartao.token], [true, 1, "tok_123"]);

  await mp.cancelar("9");
  assertEquals([pedidos[2]!.url, pedidos[2]!.init.method, String(pedidos[2]!.init.body)], ["https://api.mercadopago.com/v1/payments/9", "PUT", '{"status":"cancelled"}']);
});
