// Chamadas do navegador à api-public, sempre pelo próprio domínio (/api, G1), para os
// cookies da tentativa e da sessão funcionarem no iPhone. Erro vem pelo código estável.
import { ehCodigoErro, textoErro, type CodigoErro, type ContextoErro } from "@tshirtclub/domain";

export type RespostaApi<T> =
  | { ok: true; dados: T }
  | { ok: false; codigo: CodigoErro; detalhes: Record<string, unknown> };

export async function chamarApi<T>(caminho: string, corpo?: unknown, metodo: "GET" | "POST" | "PUT" = corpo === undefined ? "GET" : "POST"): Promise<RespostaApi<T>> {
  try {
    const r = await fetch(`/api/${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
    const json: unknown = await r.json().catch(() => null);
    if (r.ok) return { ok: true, dados: json as T };
    const erro = (json as { erro?: { codigo?: unknown; detalhes?: Record<string, unknown> } } | null)?.erro;
    return { ok: false, codigo: ehCodigoErro(erro?.codigo) ? erro.codigo : "INTERNAL_ERROR", detalhes: erro?.detalhes ?? {} };
  } catch {
    return { ok: false, codigo: "UPSTREAM_UNAVAILABLE", detalhes: {} };
  }
}

/** Texto da tela para um erro da API, com o que os detalhes trazem. */
export function mensagemDeErro(codigo: CodigoErro, detalhes: Record<string, unknown> = {}): string {
  return textoErro(codigo, detalhes as ContextoErro).mensagem;
}

/** Horário curto de Brasília ("14:32"), para prazos. */
export function horario(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
