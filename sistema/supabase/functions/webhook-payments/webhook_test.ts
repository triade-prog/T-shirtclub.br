import { assertEquals } from "@std/assert";
import type { Banco } from "../_shared/banco.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { criarWebhookPagamentos } from "./app.ts";

const SEGREDO = "segredo-do-webhook";
const AGORA = new Date("2026-10-10T12:00:00Z");

async function assinatura(dataId: string, requestId: string, ts = String(AGORA.getTime() / 1000)) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const v1 = [...new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`id:${dataId};request-id:${requestId};ts:${ts};`)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ts=${ts},v1=${v1}`;
}

function montar() {
  const rpcs: { funcao: string; args: Record<string, unknown> }[] = [];
  const eventos = new Set<string>();
  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      rpcs.push({ funcao, args });
      if (funcao === "payment_event_register") {
        const novo = !eventos.has(String(args.p_event_id));
        eventos.add(String(args.p_event_id));
        return Promise.resolve((novo ? eventos.size : null) as T);
      }
      if (funcao === "apply_payment_result") return Promise.resolve({ resultado: "CONFIRMADO" } as T);
      return Promise.resolve(null as T);
    },
  };
  const pagamentos = pagamentosFalso();
  const tarefas: Promise<unknown>[] = [];
  const app = criarWebhookPagamentos({ banco, pagamentos, segredo: SEGREDO, agora: () => AGORA, processarDepois: (p) => tarefas.push(p) });
  const enviar = async (dataId: string, cabecalho: string | null, corpo: Record<string, unknown> = { id: 777, type: "payment", data: { id: dataId } }, tipo = "payment") =>
    await app.request(`/webhook-payments?data.id=${dataId}${tipo ? `&type=${tipo}` : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-1", ...(cabecalho ? { "x-signature": cabecalho } : {}) },
      body: JSON.stringify(corpo),
    });
  return { enviar, rpcs, pagamentos, tarefas };
}

Deno.test("sem assinatura, assinatura errada ou antiga: 401 e nada gravado (T19)", async () => {
  const { enviar, rpcs } = montar();
  assertEquals((await enviar("123", null)).status, 401);
  assertEquals((await enviar("123", "ts=1,v1=abc")).status, 401);
  assertEquals((await enviar("123", await assinatura("123", "req-1", String(AGORA.getTime() / 1000 - 360)))).status, 401);
  assertEquals((await enviar("123", await assinatura("999", "req-1"))).status, 401);
  assertEquals(rpcs.length, 0);
});

Deno.test("assinado: grava na inbox, responde 200 e processa fora da requisição, consultando o provedor", async () => {
  const { enviar, rpcs, pagamentos, tarefas } = montar();
  const pix = await pagamentos.criarPix({ pagamentoId: "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f", valorCentavos: 9998, descricao: "x", expiraEm: AGORA });
  pagamentos.mudar(pix.providerPaymentId, "APROVADO");
  const id = pix.providerPaymentId;
  const r = await enviar(id, await assinatura(id, "req-1"));
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { ok: true, repetido: false });
  await Promise.all(tarefas);
  const aplicado = rpcs.find((x) => x.funcao === "apply_payment_result")!.args;
  assertEquals(aplicado.p_payment_id, "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f");
  assertEquals((aplicado.p as { status: string }).status, "APROVADO");
  assertEquals(rpcs.at(-1), { funcao: "payment_event_done", args: { p_id: 1 } });

  const repetido = await enviar(id, await assinatura(id, "req-1"));
  assertEquals(await repetido.json(), { ok: true, repetido: true });
});

Deno.test("outros tópicos são ignorados depois de conferir a assinatura", async () => {
  const { enviar, rpcs } = montar();
  const r = await enviar("123", await assinatura("123", "req-1"), { id: 1, type: "merchant_order", data: { id: "123" } }, "");
  assertEquals(await r.json(), { ok: true, ignorado: true });
  assertEquals(rpcs.length, 0);
});
