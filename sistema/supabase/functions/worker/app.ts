// Worker das tarefas de fundo (seção 12). A varredura SQL (pg_cron + pg_net, 0300) chama só
// quando há trabalho (G21), com o segredo do worker no cabeçalho.

import { Hono } from "hono";
import { relatarErro } from "../_shared/monitor.ts";
import { segredoConfere } from "../_shared/repasse.ts";
import { despacharOutbox, type DepsOutbox } from "./outbox.ts";
import { processarPagamentos, type DepsPagamentos } from "./pagamentos.ts";

export const CABECALHO_WORKER = "x-worker-segredo";

export function criarWorker(segredo: string | undefined, deps: DepsOutbox & DepsPagamentos) {
  const app = new Hono().basePath("/worker");

  // Saúde dos jobs para o monitor de fora (F11.5): sem segredo, só diz o que está atrasado
  // (nenhum dado de reserva). 503 quando há problema, para o monitor avisar a loja.
  app.get("/saude", async (c) => {
    const s = await deps.banco.rpc<{ ok: boolean; problemas: { tipo: string; job?: string }[] }>("check_job_health");
    return c.json({ ok: s.ok, problemas: s.problemas }, s.ok ? 200 : 503);
  });

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
  app.onError(async (err, c) => {
    await relatarErro(err, { rota: c.req.routePath, metodo: c.req.method });
    return c.json({ erro: { codigo: "INTERNAL_ERROR" } }, 500);
  });
  app.notFound((c) => c.json({ erro: { codigo: "NOT_FOUND" } }, 404));
  return app;
}
