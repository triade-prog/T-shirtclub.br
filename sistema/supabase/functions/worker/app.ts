// Worker das tarefas de fundo (seção 12). A varredura SQL (pg_cron + pg_net, 0300) chama só
// quando há trabalho (G21), com o segredo do worker no cabeçalho.

import { Hono } from "hono";
import { segredoConfere } from "../_shared/repasse.ts";
import { despacharOutbox, type DepsOutbox } from "./outbox.ts";
import { processarPagamentos, type DepsPagamentos } from "./pagamentos.ts";

export const CABECALHO_WORKER = "x-worker-segredo";

export function criarWorker(segredo: string | undefined, deps: DepsOutbox & DepsPagamentos) {
  const app = new Hono().basePath("/worker");
  app.use("*", async (c, next) => {
    if (!segredo || !segredoConfere(c.req.header(CABECALHO_WORKER) ?? null, segredo)) return c.json({ erro: { codigo: "FORBIDDEN" } }, 403);
    await next();
  });
  app.post("/outbox", async (c) => c.json(await despacharOutbox(deps)));
  // Uma rodada completa: primeiro os pagamentos (podem gerar mensagens), depois a fila.
  app.post("/tick", async (c) => {
    const pagamentos = await processarPagamentos(deps);
    return c.json({ pagamentos, outbox: await despacharOutbox(deps) });
  });
  app.onError((err, c) => {
    console.error(JSON.stringify({ funcao: "worker", erro: String(err) }));
    return c.json({ erro: { codigo: "INTERNAL_ERROR" } }, 500);
  });
  app.notFound((c) => c.json({ erro: { codigo: "NOT_FOUND" } }, 404));
  return app;
}
