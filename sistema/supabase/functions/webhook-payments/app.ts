// Webhook do Mercado Pago (seção 08, G3). Confere a assinatura (x-signature, janela de 5 min),
// grava na inbox (um reenvio vira no-op) e responde 200; o processamento sai da requisição:
// consulta o pagamento no provedor (fonte da verdade) e aplica. Assinatura inválida: 401 e
// nada gravado. Erro ao gravar: 500, para o provedor reenviar.

import { Hono } from "hono";
import type { Banco } from "../_shared/banco.ts";
import { assinaturaMpValida, type PaymentProvider } from "../_shared/pagamentos.ts";
import { processarEvento } from "../worker/pagamentos.ts";

export interface DepsWebhookPagamentos {
  banco: Banco;
  pagamentos: PaymentProvider;
  segredo: string;
  agora?: () => Date;
  /** Continua depois da resposta (EdgeRuntime.waitUntil em produção). */
  processarDepois?: (p: Promise<unknown>) => void;
}

export function criarWebhookPagamentos(deps: DepsWebhookPagamentos) {
  const app = new Hono().basePath("/webhook-payments");

  app.post("/", async (c) => {
    const corpo = (await c.req.json().catch(() => null)) as { id?: unknown; type?: unknown; data?: { id?: unknown } } | null;
    const dataId = c.req.query("data.id") ?? (corpo?.data?.id != null ? String(corpo.data.id) : null);
    const tipo = c.req.query("type") ?? (typeof corpo?.type === "string" ? corpo.type : null);
    if (!dataId || !/^[A-Za-z0-9_-]{1,100}$/.test(dataId)) return c.json({ erro: { codigo: "UNAUTHORIZED" } }, 401);

    const valida = await assinaturaMpValida(c.req.header("x-signature") ?? null, c.req.header("x-request-id") ?? null, dataId, deps.segredo,
      deps.agora?.() ?? new Date());
    if (!valida) return c.json({ erro: { codigo: "UNAUTHORIZED" } }, 401);
    if (tipo !== "payment") return c.json({ ok: true, ignorado: true }); // só o tópico payment (G3)

    const ts = /ts=(\d+)/.exec(c.req.header("x-signature") ?? "")?.[1];
    const eventoId = corpo?.id != null ? String(corpo.id) : `${dataId}:${ts}`;
    const id = await deps.banco.rpc<number | null>("payment_event_register", {
      p_provider: "mercadopago",
      p_event_id: eventoId,
      p_ref: dataId,
      p_payload: corpo ?? {},
    });
    if (id !== null) {
      const tarefa = processarEvento({ banco: deps.banco, pagamentos: deps.pagamentos }, id, dataId)
        .catch((e) => console.error(JSON.stringify({ funcao: "webhook-payments", erro: String(e) }))); // a reconciliação cobre
      (deps.processarDepois ?? (() => {}))(tarefa);
    }
    return c.json({ ok: true, repetido: id === null });
  });

  app.onError((err, c) => {
    console.error(JSON.stringify({ funcao: "webhook-payments", erro: String(err) }));
    return c.json({ erro: { codigo: "INTERNAL_ERROR" } }, 500);
  });
  app.notFound((c) => c.json({ erro: { codigo: "NOT_FOUND" } }, 404));
  return app;
}
