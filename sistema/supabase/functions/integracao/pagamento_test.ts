// Pagamento de ponta a ponta no servidor (F6), com o banco de verdade e o Mercado Pago falso:
// PIX aprovado pelo webhook assinado, cartão recusado e depois aprovado, e PIX que não foi
// pago até o fim da tolerância (cancelado no provedor, reserva expirada).

import { assert, assertEquals, assertMatch } from "@std/assert";
import { criarApiPublica } from "../api-public/app.ts";
import { criarWebhookPagamentos } from "../webhook-payments/app.ts";
import { despacharOutbox } from "../worker/outbox.ts";
import { processarPagamentos } from "../worker/pagamentos.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { bancoPg } from "./banco_pg.ts";

const url = Deno.env.get("PGURL_TESTE");
const SEGREDO = "s3gredo";
const WEBHOOK = "segredo-do-webhook-mp";
const PRODUTO = "6f1c2d3e-4b5a-4c6d-8e7f-000000000002";

Deno.test({
  name: "pagamento: PIX pelo webhook, cartão recusado e aprovado, PIX cancelado no fim da tolerância",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const banco = bancoPg(url!);
    const whatsapp = whatsappFalso();
    const pagamentos = pagamentosFalso();
    pagamentos.conta = "";
    try {
      await banco.sql.unsafe(`
        insert into collections (id, name, slug, color_key) values ('6f1c2d3e-4b5a-4c6d-8e7f-00000000c002', 'Pagamento', 'pagamento', 'MENTA');
        insert into products (id, collection_id, code, slug, name, price_cents, qty_total)
          values ('${PRODUTO}', '6f1c2d3e-4b5a-4c6d-8e7f-00000000c002', 'PAG-01', 'pagamento-1', 'Limone Pagamento', 4999, 10);
        insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
          values ('${PRODUTO}', 'produtos/pag-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
        update products set published_at = now() where code = 'PAG-01';
      `);

      /** Reserva de 1 peça, já com a sessão da cliente (o fluxo do código tem o próprio teste). */
      const reservar = async (telefone: string): Promise<{ id: string; cookie: string }> => {
        const token = crypto.randomUUID();
        const hash = await sha256Hex(token);
        const [s] = await banco.sql`insert into otp_sessions (phone_e164, purpose, status, verified_at) values (${telefone}, 'RESERVA', 'VERIFICADA', app_now()) returning id`;
        const [a] = await banco.sql`
          insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id, status, verified_until, browser_token_hash)
          values (gen_attempt_ref(), 'Marina Souza', ${telefone}, 'RETIRADA', ${banco.sql.json([{ produtoId: PRODUTO, qtd: 1 }])}, 4999, ${s!.id},
                  'VERIFICADA', app_now() + interval '10 minutes', ${hash}) returning id`;
        const r = await banco.rpc<{ reserva: { id: string } }>("create_reservation", {
          p_attempt_id: a!.id, p_token_hash: hash,
          p: {
            linhas: [{ produtoId: PRODUTO, qtd: 1, precoTabelaCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999 }],
            subtotalCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999, aplicada: null, chaveHash: await sha256Hex(`${token}k`), link: "https://tshirtclub.pt/r#x",
          },
        });
        const sessao = crypto.randomUUID();
        await banco.rpc("create_customer_session", { p_phone: telefone, p_token_hash: await sha256Hex(sessao), p_scope: "TELEFONE" });
        return { id: r.reserva.id, cookie: `__Host-sessao=${sessao}` };
      };

      const api = criarApiPublica(SEGREDO, {
        banco, whatsapp, pagamentos, turnstile: { verificar: () => Promise.resolve(true) },
        pepper: "p".repeat(40), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt",
      });
      const tarefas: Promise<unknown>[] = [];
      const webhook = criarWebhookPagamentos({ banco, pagamentos, segredo: WEBHOOK, processarDepois: (p) => tarefas.push(p) });
      const pagar = (reserva: { id: string; cookie: string }, corpo: unknown, chave: string = crypto.randomUUID()) =>
        api.request(`/api-public/v1/reservations/${reserva.id}/payments`, {
          method: "POST",
          headers: { "x-repasse-segredo": SEGREDO, "content-type": "application/json", "idempotency-key": chave, cookie: reserva.cookie },
          body: JSON.stringify(corpo),
        });
      const ver = async (reserva: { id: string; cookie: string }) =>
        await (await api.request(`/api-public/v1/reservations/${reserva.id}`, { headers: { "x-repasse-segredo": SEGREDO, cookie: reserva.cookie } })).json();
      const avisarWebhook = async (providerPaymentId: string) => {
        const ts = String(Math.floor(Date.now() / 1000));
        const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const v1 = [...new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`id:${providerPaymentId};request-id:r1;ts:${ts};`)))]
          .map((b) => b.toString(16).padStart(2, "0")).join("");
        const r = await webhook.request(`/webhook-payments?data.id=${providerPaymentId}&type=payment`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": "r1", "x-signature": `ts=${ts},v1=${v1}` },
          body: JSON.stringify({ id: `${providerPaymentId}-${ts}`, type: "payment", data: { id: providerPaymentId } }),
        });
        assertEquals(r.status, 200);
        await Promise.all(tarefas.splice(0));
      };

      // ── PIX aprovado pelo webhook ──
      const r1 = await reservar("+5577998130001");
      const chave = crypto.randomUUID();
      const p1 = await pagar(r1, { forma: "PIX" }, chave);
      assertEquals(p1.status, 201);
      const pix = (await p1.json()).pagamento;
      assertEquals(pix.status, "PENDENTE");
      assertMatch(pix.pix.copiaECola, /^00020126PIXFALSO/);
      assertEquals((await (await pagar(r1, { forma: "PIX" }, chave)).json()).pagamento.id, pix.id, "o mesmo clique devolve a mesma cobrança");
      assertEquals((await (await pagar(r1, { forma: "PIX" })).json()).erro.codigo, "PAYMENT_IN_PROGRESS");
      assertEquals((await (await pagar(r1, { forma: "CARTAO", cartao: { token: "tok_12345678", paymentMethodId: "master", email: "m@exemplo.com" } })).json()).erro.codigo,
        "METHOD_LOCKED");

      const [{ provider_payment_id: mp1 }] = await banco.sql`select provider_payment_id from payments where id = ${pix.id}`;
      pagamentos.mudar(mp1, "APROVADO");
      await avisarWebhook(mp1);
      assertEquals((await ver(r1)).status, "PAGAMENTO_CONFIRMADO");
      const status = await (await api.request(`/api-public/v1/reservations/${r1.id}/payments/${pix.id}`, { headers: { "x-repasse-segredo": SEGREDO, cookie: r1.cookie } })).json();
      assertEquals([status.status, status.reservaStatus], ["APROVADO", "PAGAMENTO_CONFIRMADO"]);
      await avisarWebhook(mp1); // o provedor avisa de novo: nada muda
      const [{ qty_sold }] = await banco.sql`select qty_sold from products where code = 'PAG-01'`;
      assertEquals(qty_sold, 1, "vendido uma vez só");

      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE' and template <> 'pagamento_confirmado'`;
      await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
      await despacharOutbox({ banco, whatsapp, dormir: () => Promise.resolve(), orcamentoMs: 5000, sorteio: () => 0 });
      assertMatch(whatsapp.enviadas.at(-1)!.texto, /^Pagamento confirmado! Pedido #\d+, R\$ 49,99 no PIX\./);

      // ── Cartão recusado, depois aprovado na hora (binary_mode) ──
      const r2 = await reservar("+5577998130002");
      const cartao = { forma: "CARTAO", cartao: { token: "tok_12345678", paymentMethodId: "master", email: "m@exemplo.com" } };
      pagamentos.proximoCartao = "RECUSADO";
      const recusado = await (await pagar(r2, cartao)).json();
      assertEquals([recusado.pagamento.status, recusado.recusa], ["RECUSADO", "cc_rejected_insufficient_amount"]);
      pagamentos.proximoCartao = "APROVADO";
      const aprovado = await (await pagar(r2, cartao)).json();
      assertEquals([aprovado.pagamento.status, aprovado.pagamento.reservaStatus], ["APROVADO", "PAGAMENTO_CONFIRMADO"]);

      // ── PIX não pago até o fim da tolerância: cancelado no provedor e reserva expirada ──
      const r3 = await reservar("+5577998130003");
      const p3 = (await (await pagar(r3, { forma: "PIX" })).json()).pagamento;
      await banco.sql`select set_app_clock(interval '15 minutes 10 seconds')`;
      assertEquals((await banco.rpc<{ tolerancias: number }>("run_sweep")).tolerancias, 1, "PIX pendente inicia a tolerância");
      assertEquals((await ver(r3)).status, "RESERVADO");
      await banco.sql`select set_app_clock(interval '20 minutes 10 seconds')`;
      const rodada = await processarPagamentos({ banco, pagamentos });
      assert(rodada.tolerancias >= 1);
      const [{ provider_payment_id: mp3 }] = await banco.sql`select provider_payment_id from payments where id = ${p3.id}`;
      assertEquals(pagamentos.pagamentos.get(mp3)!.status, "CANCELADO", "cobrança cancelada no provedor (G14)");
      assertEquals((await ver(r3)).status, "EXPIRADO");
    } finally {
      await banco.sql`select set_app_clock(interval '0')`;
      await banco.fechar();
    }
  },
});
