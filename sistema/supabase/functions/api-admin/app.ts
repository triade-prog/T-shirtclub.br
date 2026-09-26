// Monta a API do painel a partir das dependências (reais no index.ts, falsas nos testes).

import { criarApp } from "../_shared/app.ts";
import { exigirAdmin, rotasAuthAdmin, type DepsAuthAdmin, type VarsAdmin } from "./auth.ts";
import { rotasEstoque } from "./estoque.ts";
import { rotasCatalogoAdmin, type DepsCatalogo } from "./catalogo.ts";
import { rotasBloqueios } from "./bloqueios.ts";
import { rotasCancelamentos } from "./cancelamentos.ts";
import { rotasPagamentosAdmin, type DepsPagamentosAdmin } from "./pagamentos.ts";

export type DepsAdmin = DepsAuthAdmin & DepsCatalogo & DepsPagamentosAdmin;

export function criarApiAdmin(segredo: string | undefined, deps: DepsAdmin) {
  const app = criarApp<VarsAdmin>("api-admin", segredo);

  app.get("/v1/health", (c) => c.json({ ok: true, servico: "api-admin" }));
  rotasAuthAdmin(app, deps);

  // Daqui para baixo, só com a sessão de dois fatores (aal2) de um administrador ativo.
  app.use("/v1/admin/*", async (c, next) => {
    if (c.req.path.includes("/v1/admin/auth/")) return await next();
    return await exigirAdmin(deps)(c, next);
  });
  app.get("/v1/admin/me", (c) => c.json({ userId: c.get("admin").userId }));
  rotasEstoque(app, deps.banco);
  rotasCatalogoAdmin(app, deps);
  rotasBloqueios(app, deps.banco);
  rotasCancelamentos(app, deps.banco);
  rotasPagamentosAdmin(app, deps);

  return app;
}
