// Schemas compartilhados entre a loja (formulários) e a API (validação da entrada).

import { z } from "zod";
import { normalizarTelefone } from "./telefone.ts";
import { LIMITES_PADRAO } from "./carrinho.ts";

export const telefoneSchema = z.string().trim().max(30).transform((valor, ctx) => {
  const r = normalizarTelefone(valor);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: "PHONE_INVALID" });
    return z.NEVER;
  }
  return r.e164;
});

export const nomeClienteSchema = z
  .string()
  .trim()
  .min(2, "VALIDATION_ERROR")
  .max(60, "VALIDATION_ERROR")
  .regex(/^[\p{L}][\p{L}\p{M} '.-]*$/u, "VALIDATION_ERROR");

export const idSchema = z.uuid();

export const itemCarrinhoSchema = z.object({
  produtoId: idSchema,
  qtd: z.number().int().min(1).max(LIMITES_PADRAO.maxPorProduto),
});

export const itensCarrinhoSchema = z
  .array(itemCarrinhoSchema)
  .min(1)
  .max(LIMITES_PADRAO.maxPecas)
  .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, "VALIDATION_ERROR")
  .refine((itens) => itens.reduce((s, i) => s + i.qtd, 0) <= LIMITES_PADRAO.maxPecas, "MAX_ITEMS");

export const modalidadeEntregaSchema = z.enum(["RETIRADA", "MOTOBOY", "ENVIO"]);

export const cupomSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, "VALIDATION_ERROR");

export const codigoOtpSchema = z.string().trim().regex(/^\d{6}$/, "OTP_INVALID");

/** POST /v1/reservation-attempts */
export const criarTentativaSchema = z.object({
  nome: nomeClienteSchema,
  telefone: telefoneSchema,
  entrega: modalidadeEntregaSchema,
  itens: itensCarrinhoSchema,
  totalEsperadoCentavos: z.number().int().nonnegative(),
  cupom: cupomSchema.optional(),
  turnstileToken: z.string().min(1).max(2048),
});

export type CriarTentativa = z.infer<typeof criarTentativaSchema>;
