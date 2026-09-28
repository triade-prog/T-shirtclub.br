// Lista VIP no painel (0390): quem entrou pelo pop-up ou pelo rodapé da loja, exportar para
// mandar as novidades, tirar da lista a pedido da cliente e escolher o cupom de boas-vindas.

import type { Hono } from "hono";
import { ErroDominio, cupomVipSchema, idSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export function rotasVipAdmin(app: Hono<VarsAdmin>, banco: Banco): void {
  app.get("/v1/admin/vip", async (c) => {
    const pagina = Number(c.req.query("pagina") ?? "1");
    const q = (c.req.query("q") ?? "").trim();
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10000 || q.length > 60) throw new ErroDominio("VALIDATION_ERROR");
    return c.json(await chamar(banco, "admin_list_vip", { p_q: q || null, p_page: pagina }));
  });

  // POST: a exportação fica registrada na auditoria
  app.post("/v1/admin/vip/export", async (c) => c.json(await chamar(banco, "admin_export_vip", { p_admin: c.get("admin").userId })));

  app.delete("/v1/admin/vip/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    await chamar(banco, "admin_remove_vip", { p_admin: c.get("admin").userId, p_id: id.data });
    return c.json({ ok: true });
  });

  app.get("/v1/admin/vip/config", async (c) => c.json(await chamar(banco, "admin_vip_settings")));
  app.put("/v1/admin/vip/config", async (c) => {
    const { cupom } = await lerCorpo(c, cupomVipSchema);
    return c.json(await chamar(banco, "admin_set_vip_coupon", { p_admin: c.get("admin").userId, p_code: cupom }));
  });
}
