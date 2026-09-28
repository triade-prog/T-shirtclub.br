// Lista VIP (0390): quem quer receber drops e ofertas pelo WhatsApp. O texto do consentimento
// (vip-textos.ts) é o mesmo que a loja mostra e o banco guarda (LGPD, art. 7º, I e 8º).

import { z } from "zod";
import { telefoneSchema } from "./schemas.ts";
import { ORIGENS_VIP } from "./vip-textos.ts";

export const vipSchema = z.object({
  telefone: telefoneSchema,
  nome: z.string().trim().max(60).optional().transform((v) => v || undefined),
  origem: z.enum(ORIGENS_VIP),
  // Os dois aceites são obrigatórios e separados: marketing e a política de privacidade
  consentimento: z.literal(true),
  privacidade: z.literal(true),
});
export type EntradaVip = z.input<typeof vipSchema>;

/** Painel: o cupom de boas-vindas da lista VIP (um cupom cadastrado em Promoções) ou nenhum. */
export const cupomVipSchema = z.object({ cupom: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/).nullable() });
