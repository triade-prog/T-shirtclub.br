// Pós-pagamento no painel (regras 17 e 18, F8): fila de entregas e fretes, informar o
// frete (2 h para pagar), avançar o substatus e marcar como Entregue (T5).

import type { Context, Hono } from "hono";
import { ErroDominio, entregarSchema, freteSchema, idSchema, substatusSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

const SUBSTATUS = [
  "AGUARDANDO_MODALIDADE", "AGUARDANDO_CALCULO_FRETE", "AGUARDANDO_PAGAMENTO_FRETE", "FRETE_VENCIDO",
  "EM_PREPARACAO", "PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO",
];

function reservaDaRota(c: Context): string {
  const id = idSchema.safeParse(c.req.param("id"));
  if (!id.success) throw new ErroDominio("NOT_FOUND");
  return id.data;
}

export function rotasEntregas(app: Hono<VarsAdmin>, banco: Banco): void {
  app.get("/v1/admin/fulfillments", async (c) => {
    const substatus = c.req.query("substatus");
    if (substatus !== undefined && !SUBSTATUS.includes(substatus)) throw new ErroDominio("VALIDATION_ERROR");
    return c.json(await chamar(banco, "admin_list_fulfillments", { p_substatus: substatus ?? null }));
  });

  app.post("/v1/admin/reservations/:id/shipping-quote", async (c) => {
    const id = reservaDaRota(c);
    const dados = await lerCorpo(c, freteSchema);
    return c.json(await chamar(banco, "admin_shipping_quote", {
      p_reservation_id: id, p_admin: c.get("admin").userId, p_amount_cents: dados.valorCentavos,
      p_days: dados.prazoDias ?? null, p_note: dados.observacao ?? null,
    }), 201);
  });

  app.put("/v1/admin/reservations/:id/fulfillment/substatus", async (c) => {
    const id = reservaDaRota(c);
    const dados = await lerCorpo(c, substatusSchema);
    return c.json(await chamar(banco, "admin_set_substatus", {
      p_reservation_id: id, p_admin: c.get("admin").userId, p_substatus: dados.substatus, p_tracking: dados.rastreio ?? null,
    }));
  });

  app.post("/v1/admin/reservations/:id/deliver", async (c) => {
    const id = reservaDaRota(c);
    const dados = await lerCorpo(c, entregarSchema);
    return c.json(await chamar(banco, "deliver_reservation", {
      p_reservation_id: id, p_admin: c.get("admin").userId, p_note: dados.observacao ?? null,
    }));
  });
}
