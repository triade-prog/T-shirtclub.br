// Pagamentos no painel (D6, G2): fila de análise (estornar ou converter em novo pedido) e
// disputas de pagamentos já confirmados que voltaram (estorno, contestação).

import type { Hono } from "hono";
import { ErroDominio, idSchema, resolverAnaliseSchema, resolverDisputaSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { chaveLink } from "../_shared/otp.ts";
import type { PaymentProvider } from "../_shared/pagamentos.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export interface DepsPagamentosAdmin {
  banco: Banco;
  pagamentos: PaymentProvider;
}

function status(v: string | undefined): string | null {
  const s = v ?? "ABERTA";
  if (!["ABERTA", "RESOLVIDA", "TODAS"].includes(s)) throw new ErroDominio("VALIDATION_ERROR");
  return s === "TODAS" ? null : s;
}

export function rotasPagamentosAdmin(app: Hono<VarsAdmin>, { banco, pagamentos }: DepsPagamentosAdmin): void {
  app.get("/v1/admin/payment-reviews", async (c) =>
    c.json(await chamar(banco, "admin_list_payment_reviews", { p_status: status(c.req.query("status")) })));

  app.post("/v1/admin/payment-reviews/:id/resolve", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    const { resolucao, nota } = await lerCorpo(c, resolverAnaliseSchema);
    const admin = c.get("admin").userId;

    if (resolucao === "CONVERTER_EM_PEDIDO") {
      const reserva = await chamar(banco, "review_convert", {
        p_review_id: id.data, p_admin: admin, p_note: nota ?? null, p_key_hash: await sha256Hex(chaveLink()),
      });
      return c.json({ resolucao, reserva });
    }

    const ref = await chamar<{ status: string; providerPaymentId: string | null } | null>(banco, "review_payment_ref", { p_review_id: id.data });
    if (!ref) throw new ErroDominio("NOT_FOUND");
    if (ref.status !== "ABERTA") throw new ErroDominio("ALREADY_APPLIED");
    if (!ref.providerPaymentId) throw new ErroDominio("VALIDATION_ERROR");
    try {
      await pagamentos.estornar(ref.providerPaymentId, `estorno:${id.data}`);
    } catch {
      throw new ErroDominio("UPSTREAM_UNAVAILABLE");
    }
    await chamar(banco, "review_refunded", { p_review_id: id.data, p_admin: admin, p_note: nota ?? null });
    return c.json({ resolucao });
  });

  app.get("/v1/admin/payment-disputes", async (c) =>
    c.json(await chamar(banco, "admin_list_payment_disputes", { p_status: status(c.req.query("status")) })));

  app.post("/v1/admin/payment-disputes/:id/resolve", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    const { nota } = await lerCorpo(c, resolverDisputaSchema);
    await chamar(banco, "resolve_dispute", { p_dispute_id: id.data, p_admin: c.get("admin").userId, p_note: nota });
    return c.json({ ok: true });
  });
}
