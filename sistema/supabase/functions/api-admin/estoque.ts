// Ajuste de estoque pelo painel (F2.3): delta com motivo, sob o mesmo lock da reserva (0180).

import type { Hono } from "hono";
import { ErroDominio, ajusteEstoqueSchema, idSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export function rotasEstoque(app: Hono<VarsAdmin>, banco: Banco): void {
  app.post("/v1/admin/products/:id/stock-adjustments", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    const { delta, motivo, tipo } = await lerCorpo(c, ajusteEstoqueSchema);
    const total = await chamar<number>(banco, "adjust_stock", {
      p_product_id: id.data,
      p_delta: delta,
      p_reason: motivo,
      p_admin_id: c.get("admin").userId,
      p_kind: tipo,
    });
    return c.json({ total });
  });
}
