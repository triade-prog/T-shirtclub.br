// Telefones bloqueados por 3 expirações (seção 09): listar, liberar ou manter, com motivo.

import type { Hono } from "hono";
import { ErroDominio, decisaoBloqueioSchema, idSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export function rotasBloqueios(app: Hono<VarsAdmin>, banco: Banco): void {
  app.get("/v1/admin/phone-blocks", async (c) => {
    const status = c.req.query("status") ?? "ATIVO";
    if (!["ATIVO", "LIBERADO", "TODOS"].includes(status)) throw new ErroDominio("VALIDATION_ERROR");
    return c.json(await chamar(banco, "admin_list_phone_blocks", { p_status: status === "TODOS" ? null : status }));
  });

  for (const [acao, funcao] of [["release", "release_phone_block"], ["keep", "keep_phone_block"]] as const) {
    app.post(`/v1/admin/phone-blocks/:id/${acao}`, async (c) => {
      const id = idSchema.safeParse(c.req.param("id"));
      if (!id.success) throw new ErroDominio("NOT_FOUND");
      const { motivo } = await lerCorpo(c, decisaoBloqueioSchema);
      await chamar(banco, funcao, { p_block_id: id.data, p_admin: c.get("admin").userId, p_reason: motivo });
      return c.json({ ok: true });
    });
  }
}
