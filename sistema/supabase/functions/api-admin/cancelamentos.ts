// Pedidos de cancelamento das clientes (regra 12): listar e decidir, sempre com motivo. E os
// cancelamentos feitos pela loja, para o histórico.
// Aprovado encerra a reserva (T4) e devolve o estoque; recusado, ela segue no prazo.

import type { Hono } from "hono";
import { ErroDominio, decisaoCancelamentoSchema, idSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

const STATUS = ["PENDENTE", "APROVADA", "RECUSADA", "PREJUDICADA", "TODOS"];

export function rotasCancelamentos(app: Hono<VarsAdmin>, banco: Banco): void {
  app.get("/v1/admin/cancellation-requests", async (c) => {
    const status = c.req.query("status") ?? "PENDENTE";
    if (!STATUS.includes(status)) throw new ErroDominio("VALIDATION_ERROR");
    return c.json(await chamar(banco, "admin_list_cancellation_requests", { p_status: status === "TODOS" ? null : status }));
  });

  // Os cancelamentos feitos pela loja (0590), para o histórico da tela (0600)
  app.get("/v1/admin/store-cancellations", async (c) => c.json(await chamar(banco, "admin_list_store_cancellations", {})));

  for (const [acao, funcao] of [["approve", "approve_cancellation"], ["reject", "reject_cancellation"]] as const) {
    app.post(`/v1/admin/cancellation-requests/:id/${acao}`, async (c) => {
      const id = idSchema.safeParse(c.req.param("id"));
      if (!id.success) throw new ErroDominio("NOT_FOUND");
      const { motivo } = await lerCorpo(c, decisaoCancelamentoSchema);
      return c.json(await chamar(banco, funcao, { p_request_id: id.data, p_admin: c.get("admin").userId, p_reason: motivo }));
    });
  }
}
