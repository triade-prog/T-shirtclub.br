// Códigos de erro estáveis da API (seção 11 do desenho técnico). A tela nunca mostra a
// mensagem crua da API: traduz o código com TEXTOS_ERRO (textos.ts).

export const CODIGOS_ERRO = {
  VALIDATION_ERROR: 400,
  PHONE_INVALID: 400,
  MAX_ITEMS: 422,
  MAX_PER_MODEL: 422,
  UNAUTHORIZED: 401,
  PHONE_VERIFICATION_REQUIRED: 401,
  ATTEMPT_NOT_VERIFIED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STOCK_UNAVAILABLE: 409,
  INSUFFICIENT_STOCK: 409,
  PRICE_CHANGED: 409,
  COUPON_NOT_BEST: 200,
  COUPON_INVALID: 422,
  ACTIVE_RESERVATION_EXISTS: 409,
  ALREADY_APPLIED: 409,
  ALREADY_REQUESTED: 409,
  METHOD_LOCKED: 409,
  PAYMENT_IN_PROGRESS: 409,
  RESERVATION_NOT_ACTIVE: 409,
  SHIPPING_ALREADY_PAID: 409,
  NOT_PAID: 409,
  DEADLINE_PASSED: 410,
  QUOTE_EXPIRED: 410,
  OTP_INVALID: 422,
  OTP_EXPIRED: 410,
  OTP_LOCKED: 423,
  PHONE_BLOCKED: 423,
  NO_WHATSAPP: 422,
  RATE_LIMITED: 429,
  // Painel (F2): login com autenticador (D12) e estoque
  INVALID_CREDENTIALS: 401,
  MFA_REQUIRED: 403,
  MFA_INVALID: 422,
  LOGIN_BLOCKED: 423,
  TURNSTILE_REQUIRED: 428,
  TURNSTILE_INVALID: 403,
  STOCK_BELOW_COMMITTED: 409,
  INTERNAL_ERROR: 500,
  WHATSAPP_OFFLINE: 503,
  UPSTREAM_UNAVAILABLE: 503,
} as const;

export type CodigoErro = keyof typeof CODIGOS_ERRO;

export function statusHttp(codigo: CodigoErro): number {
  return CODIGOS_ERRO[codigo];
}

export function ehCodigoErro(valor: unknown): valor is CodigoErro {
  return typeof valor === "string" && Object.hasOwn(CODIGOS_ERRO, valor);
}

/** Corpo de erro padrão de todas as rotas: { erro: { codigo, detalhes? } }. */
export interface CorpoErro {
  erro: { codigo: CodigoErro; detalhes?: Record<string, unknown> };
}

export class ErroDominio extends Error {
  readonly codigo: CodigoErro;
  readonly detalhes: Record<string, unknown> | undefined;

  constructor(codigo: CodigoErro, detalhes?: Record<string, unknown>) {
    super(codigo);
    this.name = "ErroDominio";
    this.codigo = codigo;
    this.detalhes = detalhes;
  }

  get status(): number {
    return statusHttp(this.codigo);
  }

  toJSON(): CorpoErro {
    return { erro: this.detalhes ? { codigo: this.codigo, detalhes: this.detalhes } : { codigo: this.codigo } };
  }
}
