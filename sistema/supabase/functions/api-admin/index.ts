// API do painel. A autenticação (Supabase Auth + admin_users, com autenticador) chega na F2.

import { criarApp } from "../_shared/app.ts";

const app = criarApp("api-admin", Deno.env.get("REPASSE_SEGREDO"));

app.get("/v1/health", (c) => c.json({ ok: true, servico: "api-admin" }));

Deno.serve(app.fetch);
