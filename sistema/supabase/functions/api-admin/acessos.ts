// Acessos da loja no painel (0520): visitas e visitantes de hoje, de ontem, dos 7 dias e do
// período (7 a 90 dias), um ponto por dia, páginas mais vistas, origens e aparelhos.

import type { Hono } from "hono";
import { ErroDominio } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import type { VarsAdmin } from "./auth.ts";

export function rotasAcessosAdmin(app: Hono<VarsAdmin>, banco: Banco): void {
  app.get("/v1/admin/acessos", async (c) => {
    const dias = Number(c.req.query("dias") ?? "30");
    if (![7, 30, 90].includes(dias)) throw new ErroDominio("VALIDATION_ERROR");
    return c.json(await chamar(banco, "admin_site_traffic", { p_days: dias }));
  });
}
