// Consulta (F9) de ponta a ponta, com o banco de verdade e o WhatsApp falso: consulta pelo
// site com código (só as reservas dela, T22), link aberto em outro aparelho (paga, mas vê
// telefone mascarado e não mexe na entrega, T23 e T24), código pedido pelo link para
// liberar a entrega (D13), "Minha reserva" no WhatsApp e o link 30 dias depois do fim.

import { assert, assertEquals, assertMatch } from "@std/assert";
import { criarRepasse, opcoesLoja } from "../../../packages/servidor/src/repasse.ts";
import { criarApiPublica } from "../api-public/app.ts";
import { criarWebhookWhatsApp } from "../webhook-whatsapp/app.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { chaveLink } from "../_shared/otp.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { bancoPg } from "./banco_pg.ts";

const url = Deno.env.get("PGURL_TESTE");
const SEGREDO = "s3gredo";
const WEBHOOK = "w".repeat(40);
const PRODUTO = "6f1c2d3e-4b5a-4c6d-8e7f-000000000005";
const TELEFONE = "+5577998160001";
const REMETENTE = "557798160001"; // o mesmo número, sem o nono dígito (R17)

Deno.test({
  name: "consulta: pelo site com código, pelo link (mascarado, sem mexer na entrega), entrega liberada com código e Minha reserva",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const banco = bancoPg(url!);
    const whatsapp = whatsappFalso();
    const pagamentos = pagamentosFalso("mp-consulta");
    pagamentos.conta = "";
    try {
      await banco.sql.unsafe(`
        insert into collections (id, name, slug, color_key) values ('6f1c2d3e-4b5a-4c6d-8e7f-00000000c005', 'Consulta', 'consulta', 'MENTA');
        insert into products (id, collection_id, code, slug, name, price_cents, qty_total)
          values ('${PRODUTO}', '6f1c2d3e-4b5a-4c6d-8e7f-00000000c005', 'CSL-01', 'consulta-1', 'Limone Consulta', 4999, 10);
        insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
          values ('${PRODUTO}', 'produtos/csl-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
        update products set published_at = now() where code = 'CSL-01';
      `);

      /** Reserva de 1 peça pelo banco (o fluxo do código tem o próprio teste); devolve a chave do link. */
      const reservar = async (telefone: string) => {
        const token = crypto.randomUUID();
        const hash = await sha256Hex(token);
        const chave = chaveLink();
        const [s] = await banco.sql`insert into otp_sessions (phone_e164, purpose, status, verified_at) values (${telefone}, 'RESERVA', 'VERIFICADA', app_now()) returning id`;
        const [a] = await banco.sql`
          insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id, status, verified_until, browser_token_hash)
          values (gen_attempt_ref(), 'Marina Souza', ${telefone}, 'RETIRADA', ${banco.sql.json([{ produtoId: PRODUTO, qtd: 1 }])}, 4999, ${s!.id},
                  'VERIFICADA', app_now() + interval '10 minutes', ${hash}) returning id`;
        const { reserva } = await banco.rpc<{ reserva: { id: string; numero: number } }>("create_reservation", {
          p_attempt_id: a!.id, p_token_hash: hash,
          p: {
            linhas: [{ produtoId: PRODUTO, qtd: 1, precoTabelaCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999 }],
            subtotalCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999, aplicada: null, chaveHash: await sha256Hex(chave), link: `https://tshirtclub.pt/r#${chave}`,
          },
        });
        return { ...reserva, chave };
      };

      const api = criarApiPublica(SEGREDO, {
        banco, whatsapp, pagamentos, turnstile: { verificar: () => Promise.resolve(true) },
        pepper: "p".repeat(40), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt",
      });
      const webhook = criarWebhookWhatsApp({ banco, whatsapp, pepper: "p".repeat(40), segredo: WEBHOOK, sorteio: () => 0 });
      let nMensagem = 0;
      const mensagem = async (remetente: string, texto: string) =>
        (await (await webhook.request(`/webhook-whatsapp/${WEBHOOK}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "ReceivedCallback", messageId: `consulta-${++nMensagem}`, phone: remetente, fromMe: false, isGroup: false, momment: Date.now(), text: { message: texto } }),
        })).json()).tratamento;

      // O navegador fala com o /api do site: o mesmo repasse da loja (cookies que vão e voltam,
      // cabeçalhos que passam), com o fetch indo direto para a função, sem rede
      const repassar = criarRepasse(() => ({
        ...opcoesLoja({ SUPABASE_FUNCTIONS_URL: "http://funcoes", REPASSE_SEGREDO: SEGREDO }),
        buscar: async (destino, init) => await api.fetch(new Request(destino, init)),
      }));

      /** Um aparelho: guarda os próprios cookies. */
      const aparelho = () => {
        let cookies = "";
        return async (metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}) => {
          const r = await repassar(new Request(`https://tshirtclub.pt/api${caminho}`, {
            method: metodo,
            headers: { "x-real-ip": "200.1.2.3", cookie: cookies, ...(corpo === undefined ? {} : { "content-type": "application/json" }), ...extra },
            body: corpo === undefined ? undefined : JSON.stringify(corpo),
          }), { params: Promise.resolve({ path: caminho.slice(1).split("?")[0]!.split("/") }) });
          for (const s of r.headers.getSetCookie()) {
            const [par] = s.split(";");
            const [nome] = par!.split("=");
            cookies = [...cookies.split("; ").filter((x) => x && !x.startsWith(`${nome}=`)), ...(s.includes("Max-Age=0") ? [] : [par!])].join("; ");
          }
          return r;
        };
      };

      const antiga = await reservar(TELEFONE);
      await banco.rpc("expire_reservation", { p_id: antiga.id, p_reason: "PRAZO_ESGOTADO" });
      const atual = await reservar(TELEFONE);
      const deOutra = await reservar("+5577998160002");

      // ── Consulta pelo site com código ──
      const celular = aparelho();
      assertEquals((await celular("GET", "/v1/me/reservations")).status, 401);
      const c = await celular("POST", "/v1/lookup-attempts", { motivo: "CONSULTA", telefone: "(77) 99816-0001", turnstileToken: "ok" });
      assertEquals(c.status, 201);
      const consulta = await c.json();
      assertEquals(consulta.whatsapp.texto, `Quero consultar minhas reservas (ref. ${consulta.ref})`);
      assertEquals(consulta.telefone, "(77) •••••-0001");
      assertEquals(await mensagem("5571999990000", consulta.whatsapp.texto), "NUMERO_DIFERENTE");
      assertEquals(await mensagem(REMETENTE, consulta.whatsapp.texto), "CODIGO_ENVIADO");
      const codigo = whatsapp.enviadas.at(-1)!.codigo!;
      assertEquals((await (await celular("GET", `/v1/lookup-attempts/${consulta.id}`)).json()).situacao, "CODIGO_ENVIADO");
      const errado = await celular("POST", `/v1/lookup-attempts/${consulta.id}/verify`, { codigo: codigo === "000000" ? "111111" : "000000" });
      assertEquals((await errado.json()).erro.codigo, "OTP_INVALID");
      assertEquals((await celular("POST", `/v1/lookup-attempts/${consulta.id}/verify`, { codigo })).status, 200);

      const { reservas } = await (await celular("GET", "/v1/me/reservations")).json();
      assertEquals(reservas.map((r: { numero: number }) => r.numero), [atual.numero, antiga.numero], "só as dela, a mais nova primeiro");
      assertEquals((await celular("GET", `/v1/reservations/${deOutra.id}`)).status, 404, "a de outra cliente não existe para ela (T22)");

      // ── Link aberto em outro aparelho (T23) ──
      const outro = aparelho();
      assertEquals((await outro("POST", "/v1/r", { chave: "x".repeat(22) })).status, 404);
      const link = await outro("POST", "/v1/r", { chave: atual.chave });
      assertEquals([link.status, link.headers.get("cache-control")], [200, "no-store"]);
      const aberto = await link.json();
      assertEquals([aberto.escopo, aberto.reserva.numero, aberto.reserva.telefone], ["RESERVA", atual.numero, "(77) •••••-0001"]);
      assertEquals((await outro("GET", `/v1/reservations/${antiga.id}`)).status, 404, "o link vê só a reserva dele");
      assertEquals((await (await outro("GET", "/v1/me/reservations")).json()).erro.codigo, "PHONE_VERIFICATION_REQUIRED");
      const pix = await outro("POST", `/v1/reservations/${atual.id}/payments`, { forma: "PIX" }, { "idempotency-key": crypto.randomUUID() });
      assertEquals(pix.status, 201, "pelo link, paga");
      const { pagamento } = await pix.json();
      await banco.rpc("apply_payment_result", {
        p_payment_id: pagamento.id,
        p: { status: "APROVADO", aprovadoEm: new Date().toISOString(), valorCentavos: 4999, moeda: "BRL", referencia: pagamento.id, statusProvedor: "approved" },
      });
      const semCodigo = await outro("PUT", `/v1/reservations/${atual.id}/fulfillment`, { modalidade: "RETIRADA" });
      assertEquals([semCodigo.status, (await semCodigo.json()).erro.codigo], [401, "PHONE_VERIFICATION_REQUIRED"], "entrega pelo link pede o código (T24)");

      // ── Código pedido pelo link para liberar a entrega (D13) ──
      const e = await (await outro("POST", "/v1/lookup-attempts", { motivo: "ENTREGA", reservaId: atual.id })).json();
      assertEquals(e.whatsapp.texto, `Quero confirmar a entrega do pedido (ref. ${e.ref})`);
      assertEquals((await outro("POST", "/v1/lookup-attempts", { motivo: "ENTREGA", reservaId: antiga.id })).status, 404, "só a reserva do link");
      assertEquals(await mensagem(REMETENTE, e.whatsapp.texto), "CODIGO_ENVIADO");
      const liberada = await (await outro("POST", `/v1/lookup-attempts/${e.id}/verify`, { codigo: whatsapp.enviadas.at(-1)!.codigo })).json();
      assertEquals(liberada, { ok: true, reservaId: atual.id });
      const entrega = await outro("PUT", `/v1/reservations/${atual.id}/fulfillment`, { modalidade: "RETIRADA" });
      assertEquals([entrega.status, (await entrega.json()).logistica.substatus], [200, "EM_PREPARACAO"]);
      assertEquals((await (await outro("POST", "/v1/r", { chave: atual.chave })).json()).escopo, "TELEFONE", "abrir o link de novo não tira a sessão do telefone");

      // ── "Minha reserva" no WhatsApp ──
      assertEquals(await mensagem(REMETENTE, "Minha reserva"), "MINHA_RESERVA");
      assertEquals(whatsapp.enviadas.at(-1)!.texto, `Sua reserva:\n• #${atual.numero}: paga · em preparação\nDetalhes e pagamento no site: tshirtclub.pt`);
      assertEquals(whatsapp.enviadas.at(-1)!.telefone, TELEFONE, "responde no número guardado na reserva, não no remetente");

      // ── O link 30 dias depois do fim: só número e estado ──
      await banco.sql`select set_app_clock(interval '31 days')`;
      const velho = await (await aparelho()("POST", "/v1/r", { chave: antiga.chave })).json();
      assertEquals(velho.reserva, { id: antiga.id, numero: antiga.numero, status: "EXPIRADO", motivoEncerramento: "PRAZO_ESGOTADO", limitada: true });
      assert(!("itens" in velho.reserva));
      assertMatch(JSON.stringify(velho), /limitada/);
    } finally {
      await banco.sql`select set_app_clock(interval '0')`;
      await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE'`;
      await banco.fechar();
    }
  },
});
