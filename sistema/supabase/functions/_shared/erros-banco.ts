// Tradução dos erros das funções SQL (códigos TSxxx e os do Postgres) para os códigos da
// API. O que não é regra conhecida segue como erro interno.

import { ErroDominio, type CodigoErro } from "@tshirtclub/domain";
import { ErroBanco, type Banco } from "./banco.ts";

const MAPA: Record<string, CodigoErro> = {
  TS101: "PRODUCT_NEEDS_IMAGE",
  TS102: "IMAGE_LIMIT",
  TS116: "PROMOTION_ENDED",
  TS122: "FORBIDDEN",
  TS123: "NOT_FOUND",
  TS130: "NOT_FOUND",
  TS161: "ALREADY_APPLIED",
  TS162: "ACTIVE_RESERVATION_EXISTS",
  TS163: "INSUFFICIENT_STOCK",
  "23505": "ALREADY_EXISTS",
  "23P01": "PROMOTION_OVERLAP",
};

// Regras de formato: a tela já valida antes, então aqui só por segurança.
const VALIDACAO = new Set(["23514", "23503", "22P02", "TS110", "TS111", "TS112", "TS113", "TS114", "TS120", "TS121", "TS131", "TS132", "TS133"]);

export function traduzirErroBanco(e: unknown): unknown {
  if (!(e instanceof ErroBanco)) return e;
  if (e.codigo === "TS124") {
    const comprometido = Number(/\((\d+)\)/.exec(e.message)?.[1]);
    return new ErroDominio("STOCK_BELOW_COMMITTED", Number.isFinite(comprometido) ? { comprometido } : undefined);
  }
  const codigo = MAPA[e.codigo];
  if (codigo) return new ErroDominio(codigo);
  if (VALIDACAO.has(e.codigo)) return new ErroDominio("VALIDATION_ERROR", { regra: e.codigo });
  return e;
}

/** rpc que já devolve o erro no formato da API. */
export async function chamar<T>(banco: Banco, funcao: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await banco.rpc<T>(funcao, args);
  } catch (e) {
    throw traduzirErroBanco(e);
  }
}
