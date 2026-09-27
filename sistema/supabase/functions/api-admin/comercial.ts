// Dashboard comercial e metas de vendas (F12, D25 e D26): como a loja está vendendo, com o
// faturamento pelas regras contábeis (a venda conta na confirmação do pagamento, 0360).

import type { Hono } from "hono";
import { ErroDominio, metasVendasSchema, periodoComercialSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { WhatsAppProvider } from "../_shared/whatsapp.ts";
import type { VarsAdmin } from "./auth.ts";

export function rotasComercial(app: Hono<VarsAdmin>, deps: { banco: Banco; whatsapp: WhatsAppProvider }): void {
  app.get("/v1/admin/comercial", async (c) => {
    const q = periodoComercialSchema.safeParse(c.req.query());
    if (!q.success) throw new ErroDominio("VALIDATION_ERROR");
    const [painel, conectado] = await Promise.all([
      chamar<Record<string, unknown>>(deps.banco, "admin_sales_dashboard", { p_periodo: q.data.periodo }),
      deps.whatsapp.conectado(),
    ]);
    return c.json({ ...painel, whatsapp: { conectado } });
  });

  app.get("/v1/admin/settings/metas", async (c) => c.json(await chamar(deps.banco, "admin_sales_goals")));

  app.put("/v1/admin/settings/metas", async (c) => {
    const metas = await lerCorpo(c, metasVendasSchema);
    return c.json(await chamar(deps.banco, "admin_update_sales_goals", { p_admin: c.get("admin").userId, p: metas }));
  });
}
