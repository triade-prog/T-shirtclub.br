// Corpo JSON validado pelo schema do packages/domain. A mensagem do schema, quando é um
// código de erro conhecido (ex.: MFA_INVALID), vira o código da resposta.

import type { Context } from "hono";
import type { z } from "zod";
import { ErroDominio, ehCodigoErro } from "@tshirtclub/domain";

export async function lerCorpo<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  if (!(c.req.header("content-type") ?? "").startsWith("application/json")) throw new ErroDominio("VALIDATION_ERROR");
  const corpo = await c.req.json().catch(() => undefined);
  const r = schema.safeParse(corpo);
  if (r.success) return r.data;
  const msg = r.error.issues[0]?.message;
  throw new ErroDominio(ehCodigoErro(msg) ? msg : "VALIDATION_ERROR");
}
