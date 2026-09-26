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
  .regex(/^[A-Z0-9]{4,20}$/, "VALIDATION_ERROR");

/** Código do WhatsApp: 6 dígitos; aceita colar com espaço ou traço ("482 193", G8). */
export const codigoOtpSchema = z
  .string()
  .transform((v) => v.replace(/[\s.-]/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "OTP_INVALID"));

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

/** POST /v1/reservation-attempts/:id/confirm — sem código quando já verificada (R8). */
export const confirmarTentativaSchema = z.object({ codigo: codigoOtpSchema.optional() });

/** PUT /v1/reservation-attempts/:id/items — depois de STOCK_UNAVAILABLE ou PRICE_CHANGED. */
export const ajustarItensSchema = z.object({
  itens: itensCarrinhoSchema,
  totalEsperadoCentavos: z.number().int().nonnegative(),
  cupom: cupomSchema.optional(),
});

// Painel (F2.4): login com e-mail e senha, depois o código do autenticador (D12).

/** Senha do painel: de 12 a 128 caracteres (a checagem de vazamento fica no Supabase Auth). */
export const senhaAdminSchema = z.string().min(12, "VALIDATION_ERROR").max(128, "VALIDATION_ERROR");

/** POST /v1/admin/auth/login */
export const loginAdminSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("VALIDATION_ERROR")).pipe(z.string().max(254)),
  senha: senhaAdminSchema,
  turnstileToken: z.string().min(1).max(2048).optional(),
});

export type LoginAdmin = z.infer<typeof loginAdminSchema>;

/** Código de 6 dígitos do aplicativo autenticador; aceita espaço ("482 193"). */
export const codigoAutenticadorSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "MFA_INVALID"));

/** POST /v1/admin/auth/mfa/verify */
export const verificarAutenticadorSchema = z.object({
  codigo: codigoAutenticadorSchema,
  /** Só no cadastro do primeiro autenticador; no login vale o já verificado. */
  factorId: z.string().min(1).max(64).optional(),
});

/** POST /v1/admin/products/:id/stock-adjustments */
export const ajusteEstoqueSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 100_000, "VALIDATION_ERROR"),
  motivo: z.string().trim().min(3, "VALIDATION_ERROR").max(200, "VALIDATION_ERROR"),
  tipo: z.enum(["ENTRADA", "AJUSTE"]).default("AJUSTE"),
});
