// API pública da loja. Nesta fase só a rota de saúde; as rotas de catálogo, tentativas,
// OTP, reservas, pagamentos e consulta chegam nas fases seguintes (seção 11).

import { criarApp } from "../_shared/app.ts";

const app = criarApp("api-public", Deno.env.get("REPASSE_SEGREDO"));

app.get("/v1/health", (c) => c.json({ ok: true, servico: "api-public" }));

Deno.serve(app.fetch);
