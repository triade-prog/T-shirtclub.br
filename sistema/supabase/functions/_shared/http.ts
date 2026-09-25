import { ErroDominio, type CodigoErro } from "@tshirtclub/domain";

export function respostaErro(codigo: CodigoErro, detalhes?: Record<string, unknown>): Response {
  const e = new ErroDominio(codigo, detalhes);
  return new Response(JSON.stringify(e.toJSON()), {
    status: e.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
