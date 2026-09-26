// Pós-pagamento (F8), com o banco de verdade e o Mercado Pago falso: modalidade e endereço
// pelo site (só com a sessão do telefone), frete informado pelo painel e pago no cartão,
// saiu para entrega e Entregue; e um PIX de frete cancelado no provedor quando a cliente
// troca para retirada.

import { assert, assertEquals, assertMatch } from "@std/assert";
import { criarApiPublica } from "../api-public/app.ts";
import { despacharOutbox } from "../worker/outbox.ts";
import { processarPagamentos } from "../worker/pagamentos.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { bancoPg } from "./banco_pg.ts";

const url = Deno.env.get("PGURL_TESTE");
const SEGREDO = "s3gredo";
const PRODUTO = "6f1c2d3e-4b5a-4c6d-8e7f-000000000004";
const ADMIN = "6f1c2d3e-4b5a-4c6d-8e7f-0000000000d8";
const ENDERECO = { cep: "45000-000", rua: "Rua das Flores", numero: "12", bairro: "Centro", cidade: "Vitória da Conquista", uf: "BA" };
const CARTAO = { forma: "CARTAO", cartao: { token: "tok_12345678", paymentMethodId: "master", email: "m@exemplo.com" } };

Deno.test({
  name: "entrega: motoboy com frete no cartão até Entregue; PIX do frete cancelado na troca para retirada",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const banco = bancoPg(url!);
    const whatsapp = whatsappFalso();
    const pagamentos = pagamentosFalso("mp-entrega");
    pagamentos.conta = "";
    try {
      await banco.sql.unsafe(`
        insert into auth.users (id) values ('${ADMIN}');
        insert into admin_users (id, name) values ('${ADMIN}', 'Loja');
        insert into collections (id, name, slug, color_key) values ('6f1c2d3e-4b5a-4c6d-8e7f-00000000c004', 'Entrega', 'entrega', 'MENTA');
        insert into products (id, collection_id, code, slug, name, price_cents, qty_total)
          values ('${PRODUTO}', '6f1c2d3e-4b5a-4c6d-8e7f-00000000c004', 'ENT-01', 'entrega-1', 'Limone Entrega', 4999, 10);
        insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
          values ('${PRODUTO}', 'produtos/ent-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
        update products set published_at = now() where code = 'ENT-01';
      `);

      /** Reserva de 1 peça com a sessão do telefone e, se pedido, uma do link (escopo da reserva). */
      const reservar = async (telefone: string, entrega: string) => {
        const token = crypto.randomUUID();
        const hash = await sha256Hex(token);
        const [s] = await banco.sql`insert into otp_sessions (phone_e164, purpose, status, verified_at) values (${telefone}, 'RESERVA', 'VERIFICADA', app_now()) returning id`;
        const [a] = await banco.sql`
          insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id, status, verified_until, browser_token_hash)
          values (gen_attempt_ref(), 'Marina Souza', ${telefone}, ${entrega}, ${banco.sql.json([{ produtoId: PRODUTO, qtd: 1 }])}, 4999, ${s!.id},
                  'VERIFICADA', app_now() + interval '10 minutes', ${hash}) returning id`;
        const { reserva } = await banco.rpc<{ reserva: { id: string; numero: number } }>("create_reservation", {
          p_attempt_id: a!.id, p_token_hash: hash,
          p: {
            linhas: [{ produtoId: PRODUTO, qtd: 1, precoTabelaCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999 }],
            subtotalCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999, aplicada: null, chaveHash: await sha256Hex(`${token}k`), link: "https://tshirtclub.pt/r#x",
          },
        });
        const sessao = crypto.randomUUID();
        const doLink = crypto.randomUUID();
        await banco.rpc("create_customer_session", { p_phone: telefone, p_token_hash: await sha256Hex(sessao), p_scope: "TELEFONE" });
        await banco.rpc("create_customer_session", { p_phone: telefone, p_token_hash: await sha256Hex(doLink), p_scope: `RESERVA:${reserva.id}` });
        return { ...reserva, cookie: `__Host-sessao=${sessao}`, cookieLink: `__Host-sessao=${doLink}` };
      };

      const api = criarApiPublica(SEGREDO, {
        banco, whatsapp, pagamentos, turnstile: { verificar: () => Promise.resolve(true) },
        pepper: "p".repeat(40), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt",
      });
      const chamarApi = (cookie: string, caminho: string, method = "GET", corpo?: unknown) =>
        api.request(`/api-public/v1/reservations/${caminho}`, {
          method,
          headers: { "x-repasse-segredo": SEGREDO, "content-type": "application/json", "idempotency-key": crypto.randomUUID(), cookie },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
      /** Envia a última mensagem na fila (as anteriores já saíram ou são descartadas). */
      const enviar = async () => {
        await banco.sql`update outbox_messages set status = 'DESCARTADA'
                         where status = 'PENDENTE' and id <> (select id from outbox_messages where status = 'PENDENTE' order by created_at desc, id desc limit 1)`;
        await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
        await despacharOutbox({ banco, whatsapp, dormir: () => Promise.resolve(), orcamentoMs: 5000, sorteio: () => 0 });
        return whatsapp.enviadas.at(-1)!.texto;
      };
      const ver = async (r: { id: string; cookie: string }) => await (await chamarApi(r.cookie, r.id)).json();

      // ── Motoboy: cartão nos produtos, endereço, frete no cartão, saiu para entrega, Entregue ──
      const r1 = await reservar("+5577998150001", "MOTOBOY");
      assertEquals((await chamarApi(r1.cookie, `${r1.id}/fulfillment`, "PUT", { modalidade: "RETIRADA" })).status, 409, "antes de pagar: NOT_PAID");
      assertEquals((await (await chamarApi(r1.cookie, `${r1.id}/payments`, "POST", CARTAO)).json()).pagamento.reservaStatus, "PAGAMENTO_CONFIRMADO");
      assertEquals((await ver(r1)).logistica.substatus, "AGUARDANDO_MODALIDADE");

      const peloLink = await chamarApi(r1.cookieLink, `${r1.id}/fulfillment`, "PUT", { modalidade: "MOTOBOY", endereco: ENDERECO });
      assertEquals([peloLink.status, (await peloLink.json()).erro.codigo], [401, "PHONE_VERIFICATION_REQUIRED"], "pelo link, pede o código antes (D13)");
      assertEquals((await chamarApi(r1.cookie, `${r1.id}/fulfillment`, "PUT", { modalidade: "MOTOBOY" })).status, 400);
      const confirmada = await (await chamarApi(r1.cookie, `${r1.id}/fulfillment`, "PUT", { modalidade: "MOTOBOY", endereco: ENDERECO })).json();
      assertEquals(confirmada.logistica.substatus, "AGUARDANDO_CALCULO_FRETE");
      assertEquals(confirmada.logistica.endereco, { bairro: "Centro", cidade: "Vitória da Conquista", uf: "BA" });
      const [{ address }] = await banco.sql`select address from fulfillments where reservation_id = ${r1.id}`;
      assertEquals(address.cep, "45000000", "o painel tem o endereço completo, com o CEP normalizado");

      await banco.rpc("admin_shipping_quote", { p_reservation_id: r1.id, p_admin: ADMIN, p_amount_cents: 1200, p_days: 1 });
      assertMatch(await enviar(), new RegExp(`^Frete do pedido #${r1.numero}: R\\$ 12,00\\. Pague até \\*\\d{2}:\\d{2}\\*`));
      const tela = await ver(r1);
      assertEquals([tela.logistica.substatus, tela.logistica.frete.valorCentavos], ["AGUARDANDO_PAGAMENTO_FRETE", 1200]);
      const frete = await (await chamarApi(r1.cookie, `${r1.id}/shipping-payments`, "POST", CARTAO)).json();
      assertEquals([frete.pagamento.finalidade, frete.pagamento.status, frete.pagamento.valorCentavos], ["FRETE", "APROVADO", 1200]);
      assertEquals((await ver(r1)).logistica.substatus, "EM_PREPARACAO");
      assertMatch([...pagamentos.pagamentos.values()].at(-1)!.referencia!, /^[0-9a-f-]{36}$/);

      await banco.rpc("admin_set_substatus", { p_reservation_id: r1.id, p_admin: ADMIN, p_substatus: "SAIU_PARA_ENTREGA" });
      await banco.rpc("deliver_reservation", { p_reservation_id: r1.id, p_admin: ADMIN });
      assertEquals((await ver(r1)).status, "ENTREGUE");
      const [{ qty_sold }] = await banco.sql`select qty_sold from products where code = 'ENT-01'`;
      assertEquals(qty_sold, 1, "o frete não mexe no estoque");

      assert((await enviar()).startsWith(`Pedido #${r1.numero} entregue.`));

      // ── Envio com PIX do frete em aberto; a cliente troca para retirada ──
      const r2 = await reservar("+5577998150002", "ENVIO");
      const pix = (await (await chamarApi(r2.cookie, `${r2.id}/payments`, "POST", { forma: "PIX" })).json()).pagamento;
      const [{ provider_payment_id: mpProdutos }] = await banco.sql`select provider_payment_id from payments where id = ${pix.id}`;
      pagamentos.mudar(mpProdutos, "APROVADO");
      await banco.rpc("apply_payment_result", {
        p_payment_id: pix.id,
        p: { status: "APROVADO", aprovadoEm: new Date().toISOString(), valorCentavos: 4999, moeda: "BRL", referencia: pix.id, statusProvedor: "approved" },
      });
      await chamarApi(r2.cookie, `${r2.id}/fulfillment`, "PUT", { modalidade: "ENVIO", endereco: ENDERECO });
      await banco.rpc("admin_shipping_quote", { p_reservation_id: r2.id, p_admin: ADMIN, p_amount_cents: 2500, p_days: 5 });
      const pixFrete = (await (await chamarApi(r2.cookie, `${r2.id}/shipping-payments`, "POST", { forma: "PIX" })).json()).pagamento;
      assertEquals([pixFrete.status, pixFrete.finalidade], ["PENDENTE", "FRETE"]);
      const [{ provider_payment_id: mpFrete }] = await banco.sql`select provider_payment_id from payments where id = ${pixFrete.id}`;
      assertEquals(Date.parse(pagamentos.pagamentos.get(mpFrete)!.pix!.expiraEm!) - Date.now() > 110 * 60_000, true,
        "o PIX do frete vale até o fim das 2 h");

      const retirada = await (await chamarApi(r2.cookie, `${r2.id}/fulfillment`, "PUT", { modalidade: "RETIRADA" })).json();
      assertEquals(retirada.logistica.substatus, "EM_PREPARACAO");
      assertMatch(retirada.logistica.codigoRetirada, /^[2-9A-HJ-NP-Z]{6}$/);
      assert((await processarPagamentos({ banco, pagamentos })).cancelados >= 1);
      assertEquals(pagamentos.pagamentos.get(mpFrete)!.status, "CANCELADO", "o PIX do frete antigo é cancelado no provedor");
    } finally {
      await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE'`;
      await banco.fechar();
    }
  },
});
