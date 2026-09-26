// Teste de carga do lançamento (F11.1): 100 clientes ao mesmo tempo, pelo fluxo inteiro
// (sacola, tentativa, código pelo WhatsApp, reserva e PIX), com 40 delas disputando as 10
// últimas peças do mesmo produto. Nada pode ser vendido a mais, os saldos têm de bater com as
// reservas (verificador de invariantes) e nenhuma resposta pode ser erro do servidor.
// O volume informado pela loja é de menos de 50 pessoas ao mesmo tempo: 100 é a margem de 2×.
// Roda com o banco de verdade e os provedores falsos; o roteiro k6 (tests/carga) repete a parte
// pública contra o ambiente de teste.

import { assert, assertEquals } from "@std/assert";
import { criarApiPublica } from "../api-public/app.ts";
import { criarWebhookWhatsApp } from "../webhook-whatsapp/app.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { bancoPg } from "./banco_pg.ts";

const url = Deno.env.get("PGURL_TESTE");
const SEGREDO = "s3gredo";
const WEBHOOK = "w".repeat(40);
const CLIENTES = 100;
const DISPUTANDO = 40;
const ULTIMAS = 10;
const QUENTE = "6f1c2d3e-4b5a-4c6d-8e7f-0000000000c1";
const OUTROS = ["6f1c2d3e-4b5a-4c6d-8e7f-0000000000c2", "6f1c2d3e-4b5a-4c6d-8e7f-0000000000c3", "6f1c2d3e-4b5a-4c6d-8e7f-0000000000c4"];

function percentil(valores: number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)]!;
}

Deno.test({
  name: "carga: 100 clientes ao mesmo tempo, 40 pelas 10 últimas peças, sem vender a mais e sem erro do servidor",
  ignore: !url,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const banco = bancoPg(url!);
    const whatsapp = whatsappFalso();
    const pagamentos = pagamentosFalso("mp-carga");
    pagamentos.conta = "";
    try {
      await banco.sql.unsafe(`
        insert into collections (id, name, slug, color_key) values ('6f1c2d3e-4b5a-4c6d-8e7f-0000000000c0', 'Carga', 'carga', 'LIMAO');
        insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
          ('${QUENTE}', '6f1c2d3e-4b5a-4c6d-8e7f-0000000000c0', 'CRG-01', 'carga-1', 'Limone Lançamento', 4999, ${ULTIMAS}),
          ${OUTROS.map((id, i) => `('${id}', '6f1c2d3e-4b5a-4c6d-8e7f-0000000000c0', 'CRG-0${i + 2}', 'carga-${i + 2}', 'Limone ${i + 2}', 4999, 200)`).join(",\n")};
        insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
          select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', 'Frente', 10, 10, 1 from products where code like 'CRG-%';
        update products set published_at = now() where code like 'CRG-%';
      `);

      const api = criarApiPublica(SEGREDO, {
        banco, whatsapp, pagamentos, turnstile: { verificar: () => Promise.resolve(true) },
        pepper: "p".repeat(40), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt",
      });
      const webhook = criarWebhookWhatsApp({ banco, whatsapp, pepper: "p".repeat(40), segredo: WEBHOOK, sorteio: () => 0 });
      const status5xx: string[] = [];
      const tempos: Record<string, number[]> = { cotacao: [], tentativa: [], codigo: [], reserva: [], pix: [] };

      const cliente = async (i: number): Promise<"RESERVADA" | "SEM_ESTOQUE"> => {
        const numero = String(170000 + i).padStart(6, "0");
        const celular = `998${numero}`; // 9 dígitos, começando pelo nono dígito
        const telefone = `+5577${celular}`;
        let cookies = "";
        const pedir = async (etapa: string, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}) => {
          const inicio = performance.now();
          const r = await api.request(`/api-public${caminho}`, {
            method: metodo,
            headers: {
              "x-repasse-segredo": SEGREDO, "x-cliente-ip": `10.${Math.floor(i / 250)}.${i % 250}.7`, cookie: cookies,
              ...(corpo === undefined ? {} : { "content-type": "application/json" }), ...extra,
            },
            body: corpo === undefined ? undefined : JSON.stringify(corpo),
          });
          tempos[etapa]?.push(performance.now() - inicio);
          if (r.status >= 500) status5xx.push(`${etapa} ${r.status}`);
          for (const s of r.headers.getSetCookie()) {
            const [par] = s.split(";");
            const [nome] = par!.split("=");
            cookies = [...cookies.split("; ").filter((x) => x && !x.startsWith(`${nome}=`)), ...(s.includes("Max-Age=0") ? [] : [par!])].join("; ");
          }
          return r;
        };

        const itens = i < DISPUTANDO ? [{ produtoId: QUENTE, qtd: 1 }] : [{ produtoId: OUTROS[i % 3]!, qtd: 1 + (i % 2) }];
        const cotacao = await (await pedir("cotacao", "POST", "/v1/cart/quote", { itens })).json();
        const t = await (await pedir("tentativa", "POST", "/v1/reservation-attempts", {
          nome: `Cliente ${String.fromCharCode(65 + (i % 26), 97 + Math.floor(i / 26))}`, telefone: `(77) ${celular.slice(0, 5)}-${celular.slice(5)}`,
          entrega: "RETIRADA", itens, totalEsperadoCentavos: cotacao.totalCentavos, turnstileToken: "ok",
        })).json();
        assert(t.ref, `tentativa ${i}: ${JSON.stringify(t)}`);

        // A cliente manda a mensagem pelo WhatsApp (sem o nono dígito, como a Z-API entrega)
        const inicio = performance.now();
        const w = await webhook.request(`/webhook-whatsapp/${WEBHOOK}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "ReceivedCallback", messageId: `carga-${i}`, phone: `557798${numero}`, fromMe: false, isGroup: false, momment: Date.now(),
            text: { message: t.whatsapp.texto },
          }),
        });
        tempos.codigo!.push(performance.now() - inicio);
        assertEquals((await w.json()).tratamento, "CODIGO_ENVIADO", `código ${i}`);
        const codigo = whatsapp.enviadas.findLast((m) => m.telefone === telefone && m.codigo)!.codigo!;

        const r = await pedir("reserva", "POST", `/v1/reservation-attempts/${t.id}/confirm`, { codigo });
        if (r.status === 409) {
          assertEquals((await r.json()).erro.codigo, "STOCK_UNAVAILABLE", `cliente ${i}`);
          return "SEM_ESTOQUE";
        }
        assertEquals(r.status, 201, `cliente ${i}`);
        const { reserva } = await r.json();
        if (i % 2 === 0) {
          const pix = await (await pedir("pix", "POST", `/v1/reservations/${reserva.id}/payments`, { forma: "PIX" }, { "idempotency-key": crypto.randomUUID() })).json();
          await banco.rpc("apply_payment_result", {
            p_payment_id: pix.pagamento.id,
            p: { status: "APROVADO", aprovadoEm: new Date().toISOString(), valorCentavos: reserva.totalCentavos, moeda: "BRL", referencia: pix.pagamento.id, statusProvedor: "approved" },
          });
        }
        return "RESERVADA";
      };

      const inicio = performance.now();
      const resultados = await Promise.all(Array.from({ length: CLIENTES }, (_, i) => cliente(i)));
      const total = performance.now() - inicio;

      assertEquals(status5xx, [], "nenhum erro do servidor");
      const disputa = resultados.slice(0, DISPUTANDO);
      assertEquals(disputa.filter((r) => r === "RESERVADA").length, ULTIMAS, "exatamente as 10 últimas peças foram reservadas");
      assertEquals(resultados.slice(DISPUTANDO).every((r) => r === "RESERVADA"), true, "quem pediu produto com estoque reservou");
      const [q] = await banco.sql`select qty_total, qty_reserved, qty_sold from products where id = ${QUENTE}`;
      assertEquals(q!.qty_reserved + q!.qty_sold, ULTIMAS, "nada vendido a mais");
      assert(q!.qty_sold > 0 && q!.qty_reserved > 0, "parte paga, parte ainda reservada");
      assertEquals((await banco.rpc<{ divergencias: number }>("check_stock_invariants")).divergencias, 0, "verificador de invariantes sem divergência");

      const p95 = Object.fromEntries(Object.entries(tempos).map(([k, v]) => [k, Math.round(percentil(v, 95))]));
      console.log(JSON.stringify({ carga: { clientes: CLIENTES, totalMs: Math.round(total), p95Ms: p95 } }));
      // Aqui tudo roda num processo só, com o banco local: a meta é não travar, não a latência de produção
      assert(p95.reserva! < 5000, `p95 da reserva ${p95.reserva} ms`);
    } finally {
      await banco.sql`update outbox_messages set sent_at = sent_at - interval '1 hour' where sent_at is not null`;
      await banco.sql`update outbox_messages set status = 'DESCARTADA' where status = 'PENDENTE'`;
      await banco.fechar();
    }
  },
});
