// Ajuste de estoque pelo painel (F2.3): delta com motivo, sob o mesmo lock da reserva (0180).

import type { Hono } from "hono";
import { ErroDominio, ajusteEstoqueSchema, idSchema } from "@tshirtclub/domain";
import { ErroBanco, type Banco } from "../_shared/banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export function rotasEstoque(app: Hono<VarsAdmin>, banco: Banco): void {
  app.post("/v1/admin/products/:id/stock-adjustments", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    const { delta, motivo, tipo } = await lerCorpo(c, ajusteEstoqueSchema);
    try {
      const total = await banco.rpc<number>("adjust_stock", {
        p_product_id: id.data,
        p_delta: delta,
        p_reason: motivo,
        p_admin_id: c.get("admin").userId,
        p_kind: tipo,
      });
      return c.json({ total });
    } catch (e) {
      if (e instanceof ErroBanco) {
        if (e.codigo === "TS124") {
          const comprometido = Number(/\((\d+)\)/.exec(e.message)?.[1]);
          throw new ErroDominio("STOCK_BELOW_COMMITTED", Number.isFinite(comprometido) ? { comprometido } : undefined);
        }
        if (e.codigo === "TS123") throw new ErroDominio("NOT_FOUND");
        if (e.codigo === "TS122") throw new ErroDominio("FORBIDDEN");
        if (e.codigo === "TS120" || e.codigo === "TS121") throw new ErroDominio("VALIDATION_ERROR");
      }
      throw e;
    }
  });
}
