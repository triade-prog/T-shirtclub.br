// Painel completo (F10, telas 6, 7 e 21): dashboard com o que pede ação, busca e detalhe da
// reserva com a linha do tempo, e a consulta da auditoria.

import type { Hono } from "hono";
import { ErroDominio, buscaAuditoriaSchema, buscaReservasSchema, decisaoBloqueioSchema, idSchema } from "@tshirtclub/domain";
import { lerCorpo } from "../_shared/validar.ts";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import type { WhatsAppProvider } from "../_shared/whatsapp.ts";
import type { VarsAdmin } from "./auth.ts";

export interface DepsPainel {
  banco: Banco;
  whatsapp: WhatsAppProvider;
  agora?: () => Date;
}

function consulta<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, valores: Record<string, string>): T {
  const r = schema.safeParse(valores);
  if (!r.success) throw new ErroDominio("VALIDATION_ERROR");
  return r.data;
}

/** Início do dia na loja (America/Bahia, UTC-3 o ano todo). */
function inicioDoDia(agora: Date): Date {
  const local = new Date(agora.getTime() - 3 * 3600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + 3 * 3600_000);
}

export function rotasPainel(app: Hono<VarsAdmin>, deps: DepsPainel): void {
  const agora = () => deps.agora?.() ?? new Date();

  app.get("/v1/admin/dashboard", async (c) => {
    const [painel, conectado] = await Promise.all([
      chamar<Record<string, unknown>>(deps.banco, "admin_dashboard"),
      deps.whatsapp.conectado(),
    ]);
    return c.json({ ...painel, whatsapp: { conectado } });
  });

  app.get("/v1/admin/reservations", async (c) => {
    const q = consulta(buscaReservasSchema, c.req.query());
    return c.json(await chamar(deps.banco, "admin_search_reservations", { p_status: q.status ?? null, p_q: q.q ?? null, p_page: q.page }));
  });

  app.get("/v1/admin/reservations/:id", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    const detalhe = await chamar(deps.banco, "admin_reservation_detail", { p_id: id.data });
    if (!detalhe) throw new ErroDominio("NOT_FOUND");
    return c.json(detalhe);
  });

  app.get("/v1/admin/audit", async (c) => {
    const q = consulta(buscaAuditoriaSchema, c.req.query());
    const desde = q.periodo === "HOJE"
      ? inicioDoDia(agora())
      : q.periodo
      ? new Date(agora().getTime() - (q.periodo === "7_DIAS" ? 7 : 30) * 86_400_000)
      : null;
    return c.json(await chamar(deps.banco, "admin_list_audit", {
      p_actor: q.autor ?? null, p_subject: q.assunto ?? null, p_since: desde?.toISOString() ?? null,
      p_entity: q.entidade ?? null, p_entity_id: q.id ?? null, p_page: q.pagina,
    }));
  });

  // Alertas do sistema (F11): estoque divergente, job atrasado, fila parada, pagamentos parados.
  app.get("/v1/admin/alerts", async (c) => {
    return c.json(await chamar(deps.banco, "admin_list_alerts", { p_open: c.req.query("resolvidos") !== "1" }));
  });

  app.post("/v1/admin/alerts/:id/resolve", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    const { motivo } = await lerCorpo(c, decisaoBloqueioSchema);
    return c.json(await chamar(deps.banco, "admin_resolve_alert", { p_id: id.data, p_admin: c.get("admin").userId, p_note: motivo }));
  });
}
