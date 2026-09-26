// Monta o app Hono de uma função com as regras comuns: segredo de repasse, erros no
// formato padrão e nada em cache.

import { Hono, type Env } from "hono";
import { ErroDominio } from "@tshirtclub/domain";
import { CABECALHO_SEGREDO, segredoConfere } from "./repasse.ts";
import { respostaErro } from "./http.ts";

// deno-lint-ignore ban-types
export function criarApp<E extends Env = {}>(nome: string, segredo: string | undefined): Hono<E> {
  const app = new Hono<E>().basePath(`/${nome}`);

  app.use("*", async (c, next) => {
    if (!segredo || !segredoConfere(c.req.header(CABECALHO_SEGREDO) ?? null, segredo)) {
      return respostaErro("FORBIDDEN");
    }
    await next();
    c.header("cache-control", "no-store");
  });

  app.onError((err) => {
    if (err instanceof ErroDominio) return respostaErro(err.codigo, err.detalhes);
    console.error(JSON.stringify({ funcao: nome, erro: String(err) }));
    return respostaErro("INTERNAL_ERROR");
  });

  app.notFound(() => respostaErro("NOT_FOUND"));
  return app;
}
