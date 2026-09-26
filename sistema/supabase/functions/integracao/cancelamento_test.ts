// Cancelamento pedido pela cliente (F7), com o banco de verdade: pedido pelo site, recusa e
// novo pedido, aprovação pelo painel com o PIX pendente cancelado no provedor, e as
// mensagens de cada passo no WhatsApp.

import { assertEquals, assertMatch } from "@std/assert";
import { criarApiPublica } from "../api-public/app.ts";
import { despacharOutbox } from "../worker/outbox.ts";
import { processarPagamentos } from "../worker/pagamentos.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { bancoPg } from "./banco_pg.ts";

const url = Deno.env.get("PGURL_TESTE");
const SEGREDO = "s3gredo";
const PRODUTO = "6f1c2d3e-4b5a-4c6d-8e7f-000000000003";
const ADMIN = "6f1c2d3e-4b5a-4c6d-8e7f-0000000000d7";

Deno.test({
  name: "cancelamento: pedido pelo site, recusa, aprovação com PIX pendente cancelado no provedor",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const banco = bancoPg(url!);
    const whatsapp = whatsappFalso();
    const pagamentos = pagamentosFalso("mp-cancelamento");
    pagamentos.conta = "";
    try {
      await banco.sql.unsafe(`
        insert into auth.users (id) values ('${ADMIN}');
        insert into admin_users (id, name) values ('${ADMIN}', 'Loja');
        insert into collections (id, name, slug, color_key) values ('6f1c2d3e-4b5a-4c6d-8e7f-00000000c003', 'Cancelamento', 'cancelamento', 'MENTA');
        insert into products (id, collection_id, code, slug, name, price_cents, qty_total)
          values ('${PRODUTO}', '6f1c2d3e-4b5a-4c6d-8e7f-00000000c003', 'CAN-01', 'cancelamento-1', 'Limone Cancelamento', 4999, 10);
        insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
          values ('${PRODUTO}', 'produtos/can-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
        update products set published_at = now() where code = 'CAN-01';
      `);

      const telefone = "+5577998140001";
      const token = crypto.randomUUID();
      const hash = await sha256Hex(token);
      const [s] = await banco.sql`insert into otp_sessions (phone_e164, purpose, status, verified_at) values (${telefone}, 'RESERVA', 'VERIFICADA', app_now()) returning id`;
      const [a] = await banco.sql`
        insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id, status, verified_until, browser_token_hash)
        values (gen_attempt_ref(), 'Marina Souza', ${telefone}, 'RETIRADA', ${banco.sql.json([{ produtoId: PRODUTO, qtd: 1 }])}, 4999, ${s!.id},
                'VERIFICADA', app_now() + interval '10 minutes', ${hash}) returning id`;
      const { reserva } = await banco.rpc<{ reserva: { id: string; numero: number } }>("create_reservation", {
        p_attempt_id: a!.id, p_token_hash: hash,
        p: {
          linhas: [{ produtoId: PRODUTO, qtd: 1, precoTabelaCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999 }],
          subtotalCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999, aplicada: null, chaveHash: await sha256Hex(`${token}k`), link: "https://tshirtclub.pt/r#x",
        },
      });
      const sessao = crypto.randomUUID();
      await banco.rpc("create_customer_session", { p_phone: telefone, p_token_hash: await sha256Hex(sessao), p_scope: "TELEFONE" });

      const api = criarApiPublica(SEGREDO, {
        banco, whatsapp, pagamentos, turnstile: { verificar: () => Promise.resolve(true) },
        pepper: "p".repeat(40), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt",
      });
      const cabecalhos = { "x-repasse-segredo": SEGREDO, "content-type": "application/json", cookie: `__Host-sessao=${sessao}` };
      const pedir = (corpo: unknown = {}, cookie = cabecalhos.cookie) =>
        api.request(`/api-public/v1/reservations/${reserva.id}/cancellation-request`, {
          method: "POST", headers: { ...cabecalhos, cookie }, body: JSON.stringify(corpo),
        });
      const ver = async () => await (await api.request(`/api-public/v1/reservations/${reserva.id}`, { headers: cabecalhos })).json();
      const enviar = async () => {
        await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
        await despacharOutbox({ banco, whatsapp, dormir: () => Promise.resolve(), orcamentoMs: 5000, sorteio: () => 0 });
        return whatsapp.enviadas.at(-1)!.texto;
      };
      const pedidoPendente = async () =>
        (await banco.sql`select id from cancellation_requests where reservation_id = ${reserva.id} and status = 'PENDENTE'`)[0]!.id as string;

      // A cliente começa um PIX e depois desiste
      const pix = await api.request(`/api-public/v1/reservations/${reserva.id}/payments`, {
        method: "POST", headers: { ...cabecalhos, "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ forma: "PIX" }),
      });
      assertEquals(pix.status, 201);
      const { pagamento } = await pix.json();

      assertEquals((await pedir({}, "")).status, 401, "sem a sessão do celular");
      assertEquals((await pedir({ observacao: "x".repeat(501) })).status, 400);
      const pedido = await pedir({ observacao: "Escolhi o tamanho errado" });
      assertEquals(pedido.status, 201);
      assertEquals((await pedido.json()).cancelamento.status, "PENDENTE");
      assertEquals((await (await pedir()).json()).erro.codigo, "ALREADY_REQUESTED");
      const tela = await ver();
      assertEquals([tela.status, tela.cancelamento.status], ["RESERVADO", "PENDENTE"]);
      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE' and template <> 'cancelamento_recebido'`;
      assertMatch(await enviar(), new RegExp(`^Recebemos seu pedido de cancelamento da reserva #${reserva.numero}\\.`));

      // A loja recusa: a reserva segue no prazo
      await banco.rpc("reject_cancellation", { p_request_id: await pedidoPendente(), p_admin: ADMIN, p_reason: "Troca é na loja" });
      assertEquals((await ver()).status, "RESERVADO");
      assertMatch(await enviar(), new RegExp(`^A loja manteve a reserva #${reserva.numero}\\. Ela segue valendo até \\*\\d{2}:\\d{2}\\*\\.$`));

      // Novo pedido, e a loja aprova: T4, estoque de volta e o PIX cancelado no provedor
      assertEquals((await pedir()).status, 201);
      const aprovado = await banco.rpc<{ status: string }>("approve_cancellation", { p_request_id: await pedidoPendente(), p_admin: ADMIN, p_reason: "Pedido da cliente" });
      assertEquals(aprovado.status, "APROVADA");
      const encerrada = await ver();
      assertEquals([encerrada.status, encerrada.cancelamento.status], ["EXPIRADO", "APROVADA"]);
      const [{ qty_reserved }] = await banco.sql`select qty_reserved from products where code = 'CAN-01'`;
      assertEquals(qty_reserved, 0);
      assertEquals((await pedir()).status, 409, "reserva encerrada não aceita outro pedido");

      const [{ provider_payment_id: mp }] = await banco.sql`select provider_payment_id from payments where id = ${pagamento.id}`;
      assertEquals((await processarPagamentos({ banco, pagamentos })).cancelados, 1);
      assertEquals(pagamentos.pagamentos.get(mp)!.status, "CANCELADO", "a cobrança não fica aberta depois do cancelamento");
      assertEquals(await enviar(), `Cancelamento aprovado: a reserva #${reserva.numero} foi encerrada e nada foi cobrado.`);
    } finally {
      // Não deixa envios recentes nem fila para os outros testes (o ritmo da fila é global)
      await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE'`;
      await banco.fechar();
    }
  },
});
