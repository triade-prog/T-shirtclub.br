// Monta a API da loja a partir das dependências (reais no index.ts, falsas nos testes).

import { criarApp } from "../_shared/app.ts";
import { rotasCatalogo } from "./catalogo.ts";
import { rotasReserva, type DepsReserva } from "./reservas.ts";

export function criarApiPublica(segredo: string | undefined, deps: DepsReserva) {
  const app = criarApp("api-public", segredo);
  app.get("/v1/health", (c) => c.json({ ok: true, servico: "api-public" }));
  rotasCatalogo(app, deps);
  rotasReserva(app, deps);
  return app;
}
