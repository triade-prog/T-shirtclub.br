// Fluxo da reserva de ponta a ponta no servidor (F3 a F5), com o banco de verdade e o
// WhatsApp falso: sacola → tentativa → a cliente pede o código pelo WhatsApp → código
// errado e certo → reserva → mensagem "reserva criada" sai da fila → expira aos 15 min.
// Roda dentro do scripts/test-db.sh (PGURL_TESTE aponta para o Postgres temporário).

import { assert, assertEquals, assertMatch } from "@std/assert";
import { criarApiPublica } from "../api-public/app.ts";
import { criarWebhookWhatsApp } from "../webhook-whatsapp/app.ts";
import { despacharOutbox } from "../worker/outbox.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { bancoPg } from "./banco_pg.ts";

const url = Deno.env.get("PGURL_TESTE");
const SEGREDO = "s3gredo";
const WEBHOOK = "w".repeat(40);
const PRODUTO = "6f1c2d3e-4b5a-4c6d-8e7f-000000000001";
const TELEFONE = "+5577998120001";

Deno.test({
  name: "da sacola à reserva criada (código pelo WhatsApp) e expirada pela varredura",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const banco = bancoPg(url!);
    const whatsapp = whatsappFalso();
    try {
      await banco.sql.unsafe(`
        insert into collections (id, name, slug, color_key) values ('6f1c2d3e-4b5a-4c6d-8e7f-00000000c001', 'Integração', 'integracao', 'LAVANDA');
        insert into products (id, collection_id, code, slug, name, price_cents, qty_total)
          values ('${PRODUTO}', '6f1c2d3e-4b5a-4c6d-8e7f-00000000c001', 'INT-01', 'integracao-1', 'Teddy Integração', 4999, 1);
        insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
          values ('${PRODUTO}', 'produtos/int-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
        update products set published_at = now() where code = 'INT-01';
      `);

      const api = criarApiPublica(SEGREDO, {
        banco, whatsapp, turnstile: { verificar: () => Promise.resolve(true) }, pagamentos: pagamentosFalso(),
        pepper: "p".repeat(40), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt",
      });
      const webhook = criarWebhookWhatsApp({ banco, whatsapp, pepper: "p".repeat(40), segredo: WEBHOOK, sorteio: () => 0 });
      let cookies = "";
      const pedir = async (caminho: string, corpo?: unknown) => {
        const r = await api.request(`/api-public${caminho}`, {
          method: corpo === undefined ? "GET" : "POST",
          headers: { "x-repasse-segredo": SEGREDO, "x-cliente-ip": "200.1.2.3", cookie: cookies, ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
        for (const s of r.headers.getSetCookie()) {
          const [par] = s.split(";");
          const [nome] = par!.split("=");
          cookies = [...cookies.split("; ").filter((x) => x && !x.startsWith(`${nome}=`)), ...(s.includes("Max-Age=0") ? [] : [par!])].join("; ");
        }
        return r;
      };
      const mensagem = (remetente: string, texto: string, id: string) =>
        webhook.request(`/webhook-whatsapp/${WEBHOOK}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "ReceivedCallback", messageId: id, phone: remetente, fromMe: false, isGroup: false, momment: Date.now(), text: { message: texto } }),
        });

      // Sacola
      const cotacao = await (await pedir("/v1/cart/quote", { itens: [{ produtoId: PRODUTO, qtd: 1 }] })).json();
      assertEquals(cotacao.totalCentavos, 4999);

      // Seus dados → tentativa com referência e cookie
      const t = await pedir("/v1/reservation-attempts", {
        nome: "Marina Souza", telefone: "(77) 99812-0001", entrega: "RETIRADA",
        itens: [{ produtoId: PRODUTO, qtd: 1 }], totalEsperadoCentavos: 4999, turnstileToken: "ok",
      });
      assertEquals(t.status, 201);
      const tentativa = await t.json();
      assertMatch(tentativa.ref, /^[2-9A-HJ-NP-Z]{4}$/);
      assertMatch(tentativa.whatsapp.url, /^https:\/\/wa\.me\/5577998155772\?text=Quero%20meu%20c%C3%B3digo/);
      assertEquals(tentativa.telefone, "(77) •••••-0001");
      assertEquals((await (await pedir(`/v1/reservation-attempts/${tentativa.id}`)).json()).situacao, "AGUARDANDO_MENSAGEM");

      // Mensagem de outro número: nada de código
      await mensagem("5571999990000", tentativa.whatsapp.texto, "int-1");
      assertEquals(whatsapp.enviadas.at(-1)?.texto, "Este número não é o da reserva. Envie a mensagem pelo WhatsApp que você informou no site.");

      // Do número dela, sem o nono dígito: recebe o código
      const r = await mensagem("557798120001", tentativa.whatsapp.texto, "int-2");
      assertEquals((await r.json()).tratamento, "CODIGO_ENVIADO");
      const enviado = whatsapp.enviadas.at(-1)!;
      assertEquals(enviado.telefone, TELEFONE);
      assertMatch(enviado.texto, /^Seu código da T-shirt Club\.br é \*\d{6}\*/);
      assertEquals((await (await pedir(`/v1/reservation-attempts/${tentativa.id}`)).json()).situacao, "CODIGO_ENVIADO");
      assertEquals((await (await mensagem("557798120001", tentativa.whatsapp.texto, "int-2")).json()).tratamento, "REPETIDA");

      // Código errado, depois o certo colado com espaço
      const errado = await pedir(`/v1/reservation-attempts/${tentativa.id}/confirm`, { codigo: enviado.codigo === "000000" ? "111111" : "000000" });
      assertEquals((await errado.json()).erro, { codigo: "OTP_INVALID", detalhes: { tentativasRestantes: 1 } });
      const certo = await pedir(`/v1/reservation-attempts/${tentativa.id}/confirm`, { codigo: `${enviado.codigo!.slice(0, 3)} ${enviado.codigo!.slice(3)}` });
      assertEquals(certo.status, 201);
      const { reserva } = await certo.json();
      assertEquals(reserva.status, "RESERVADO");
      assertEquals(reserva.totalCentavos, 4999);
      assertEquals(reserva.telefone, "(77) •••••-0001");
      assert(cookies.includes("__Host-sessao="), "sessão da cliente gravada");
      assert(!cookies.includes("__Host-tentativa="), "cookie da tentativa apagado");

      // A cliente vê a reserva com a sessão; sem ela, não
      assertEquals((await (await pedir(`/v1/reservations/${reserva.id}`)).json()).numero, reserva.numero);
      const semSessao = cookies;
      cookies = "";
      assertEquals((await pedir(`/v1/reservations/${reserva.id}`)).status, 401);
      cookies = semSessao;

      // "Reserva criada" sai da fila com o link da loja (as mensagens de outros testes saem do caminho)
      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE' and reservation_id <> ${reserva.id}`;
      assertEquals(await despacharOutbox({ banco, whatsapp, dormir: () => Promise.resolve(), orcamentoMs: 5000, sorteio: () => 0 }), { enviadas: 1, falhas: 0 });
      assertMatch(whatsapp.enviadas.at(-1)!.texto, new RegExp(`^Oi, Marina! Sua peça está guardada até \\*\\d{2}:\\d{2}\\* \\(reserva #${reserva.numero}, R\\$ 49,99\\)\\. Pague por aqui: https://tshirtclub\\.pt/r#[0-9A-Za-z]{22} 💖$`));
      const [fila] = await banco.sql`select params, status from outbox_messages where reservation_id = ${reserva.id}`;
      assertEquals(fila!.status, "ENVIADA");
      assertEquals(fila!.params.link, undefined, "o link com a chave saiu da fila depois do envio");

      // Sem pagamento, aos 15 min a varredura expira: o estoque volta e a mensagem sai (F5)
      await banco.sql`select set_app_clock(interval '16 minutes')`;
      const varredura = await banco.rpc<{ expiradas: number }>("run_sweep");
      assertEquals(varredura.expiradas >= 1, true);
      assertEquals((await (await pedir(`/v1/reservations/${reserva.id}`)).json()).status, "EXPIRADO");
      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE' and reservation_id <> ${reserva.id}`;
      await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
      assertEquals((await despacharOutbox({ banco, whatsapp, dormir: () => Promise.resolve(), orcamentoMs: 5000, sorteio: () => 0 })).enviadas, 1);
      assertMatch(whatsapp.enviadas.at(-1)!.texto, new RegExp(`^A reserva #${reserva.numero} terminou às \\d{2}:\\d{2} sem pagamento`));
      const disponivel = await (await pedir("/v1/cart/quote", { itens: [{ produtoId: PRODUTO, qtd: 1 }] })).json();
      assertEquals(disponivel.totalCentavos, 4999, "a peça voltou para a loja");

      // Com a unidade de novo presa numa reserva, outra cliente é avisada antes de pedir código
      await banco.sql`update products set qty_reserved = 1 where code = 'INT-01'`;
      cookies = "";
      const outra = await pedir("/v1/reservation-attempts", {
        nome: "Joana", telefone: "(77) 99812-0002", entrega: "RETIRADA",
        itens: [{ produtoId: PRODUTO, qtd: 1 }], totalEsperadoCentavos: 4999, turnstileToken: "ok",
      });
      assertEquals((await outra.json()).erro.codigo, "INSUFFICIENT_STOCK");
    } finally {
      await banco.sql`select set_app_clock(interval '0')`;
      await banco.fechar();
    }
  },
});
