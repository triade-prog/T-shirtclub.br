// Ações da loja na reserva (0590): cancelar, sempre com motivo, e escolher a entrega e o
// endereço pelo painel. No pedido pago, cada pagamento aplicado no Mercado Pago é estornado
// antes (chave de idempotência por pagamento: repetir a ação não estorna duas vezes) e só
// então o banco encerra a reserva, devolve as peças e avisa a cliente.

import type { Context, Hono } from "hono";
import { ErroDominio, cancelarReservaSchema, entregaSchema, idSchema } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import type { PaymentProvider } from "../_shared/pagamentos.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export interface DepsAcoesReserva {
  banco: Banco;
  pagamentos: PaymentProvider;
}

interface Previa {
  pode: boolean;
  bloqueio?: "ENCERRADA" | "CONTESTACAO" | "FRETE_EM_PAGAMENTO";
  pago: boolean;
  estornar: { id: string; finalidade: string; forma: string; valorCentavos: number; idProvedor: string }[];
  devolverPorForaCentavos?: number;
  pecas: number;
}

const ERRO_DO_BLOQUEIO = { ENCERRADA: "RESERVATION_NOT_ACTIVE", CONTESTACAO: "DISPUTE_OPEN", FRETE_EM_PAGAMENTO: "PAYMENT_IN_PROGRESS" } as const;

function reservaDaRota(c: Context): string {
  const id = idSchema.safeParse(c.req.param("id"));
  if (!id.success) throw new ErroDominio("NOT_FOUND");
  return id.data;
}

export function rotasAcoesReserva(app: Hono<VarsAdmin>, { banco, pagamentos }: DepsAcoesReserva): void {
  // O que o cancelamento faz: as peças que voltam e o que é estornado (a tela confirma antes)
  app.get("/v1/admin/reservations/:id/cancel", async (c) =>
    c.json(await chamar<Previa>(banco, "admin_cancel_preview", { p_id: reservaDaRota(c) })));

  app.post("/v1/admin/reservations/:id/cancel", async (c) => {
    const id = reservaDaRota(c);
    const { motivo } = await lerCorpo(c, cancelarReservaSchema);
    const previa = await chamar<Previa>(banco, "admin_cancel_preview", { p_id: id });
    if (previa.bloqueio) throw new ErroDominio(ERRO_DO_BLOQUEIO[previa.bloqueio]);
    for (const p of previa.estornar) {
      try {
        await pagamentos.estornar(p.idProvedor, `cancelamento:${p.id}`);
      } catch {
        throw new ErroDominio("UPSTREAM_UNAVAILABLE");
      }
    }
    return c.json(await chamar(banco, "admin_cancel_reservation", {
      p_admin: c.get("admin").userId, p_id: id, p_reason: motivo, p_refunded: previa.estornar.map((p) => p.id),
    }));
  });

  // A loja escolhe a modalidade e preenche ou corrige o endereço (a cliente recebe a confirmação)
  app.put("/v1/admin/reservations/:id/fulfillment", async (c) => {
    const id = reservaDaRota(c);
    const dados = await lerCorpo(c, entregaSchema);
    return c.json(await chamar(banco, "admin_set_fulfillment", {
      p_admin: c.get("admin").userId, p_reservation_id: id, p_mode: dados.modalidade,
      p_address: dados.modalidade === "RETIRADA" ? null : dados.endereco,
    }));
  });
}
