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

/** POST /v1/admin/phone-blocks/:id/release e /keep — a decisão sempre tem motivo (regra 21). */
export const decisaoBloqueioSchema = z.object({
  motivo: z.string().trim().min(3, "VALIDATION_ERROR").max(500, "VALIDATION_ERROR"),
});

/** POST /v1/reservations/:id/payments — o header Idempotency-Key vem à parte (seção 08). */
export const pagamentoSchema = z
  .object({
    forma: z.enum(["PIX", "CARTAO"]),
    /** Dados do Card Payment Brick: só o token, nunca o número do cartão. */
    cartao: z
      .object({
        token: z.string().min(8).max(200),
        paymentMethodId: z.string().regex(/^[a-z_]{2,30}$/),
        issuerId: z.union([z.string().max(20), z.number().int()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v))),
        email: z.email().max(254),
      })
      .optional(),
  })
  .refine((p) => (p.forma === "CARTAO") === Boolean(p.cartao), "VALIDATION_ERROR");

/** POST /v1/admin/payment-reviews/:id/resolve (D6) */
export const resolverAnaliseSchema = z.object({
  resolucao: z.enum(["ESTORNAR", "CONVERTER_EM_PEDIDO"]),
  nota: z.string().trim().max(500).optional(),
});

/** POST /v1/admin/payment-disputes/:id/resolve (G2) */
export const resolverDisputaSchema = z.object({ nota: z.string().trim().min(3, "VALIDATION_ERROR").max(500, "VALIDATION_ERROR") });

/** POST /v1/reservations/:id/cancellation-request (regra 12). */
export const pedidoCancelamentoSchema = z.object({ observacao: z.string().trim().max(500, "VALIDATION_ERROR").optional() });

/** POST /v1/admin/cancellation-requests/:id/approve e /reject: sempre com motivo. */
export const decisaoCancelamentoSchema = decisaoBloqueioSchema;

// ─── Entrega e frete (regra 17, F8) ──────────────────────────────────────────────────

const campoEndereco = (max: number) => z.string().trim().min(1, "VALIDATION_ERROR").max(max, "VALIDATION_ERROR");

/** Endereço de entrega: só para motoboy ou envio (LGPD). O CEP aceita "45000-000". */
export const enderecoSchema = z.object({
  cep: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^\d{8}$/, "VALIDATION_ERROR")),
  rua: campoEndereco(120),
  numero: campoEndereco(20),
  complemento: z.string().trim().max(60, "VALIDATION_ERROR").optional().transform((v) => v || undefined),
  bairro: campoEndereco(80),
  cidade: campoEndereco(80),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "VALIDATION_ERROR"),
});

/** PUT /v1/reservations/:id/fulfillment: retirada sem endereço; motoboy e envio com. */
export const entregaSchema = z.discriminatedUnion("modalidade", [
  z.object({ modalidade: z.literal("RETIRADA") }),
  z.object({ modalidade: z.enum(["MOTOBOY", "ENVIO"]), endereco: enderecoSchema }),
]);

/** POST /v1/admin/reservations/:id/shipping-quote: valor, prazo em dias úteis e observação. */
export const freteSchema = z.object({
  valorCentavos: z.number().int().min(1, "VALIDATION_ERROR").max(100_000, "VALIDATION_ERROR"),
  prazoDias: z.number().int().min(0).max(60).optional(),
  observacao: z.string().trim().max(300, "VALIDATION_ERROR").optional(),
});

/** PUT /v1/admin/reservations/:id/fulfillment/substatus */
export const substatusSchema = z.object({
  substatus: z.enum(["PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO"]),
  rastreio: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,40}$/, "VALIDATION_ERROR").optional(),
});

/** POST /v1/admin/reservations/:id/deliver */
export const entregarSchema = z.object({ observacao: z.string().trim().max(500, "VALIDATION_ERROR").optional() });
