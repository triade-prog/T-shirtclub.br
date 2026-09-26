// Chamadas do painel à api-admin, sempre pelo próprio domínio (/api, G1). Erro vem pelo
// código estável; as funções do banco também respondem { erro } com status 200.
import { ehCodigoErro, textoErro, type CodigoErro, type ContextoErro } from "@tshirtclub/domain";

export type RespostaApi<T> =
  | { ok: true; dados: T }
  | { ok: false; codigo: CodigoErro; detalhes: Record<string, unknown> };

export async function chamarApi<T>(caminho: string, corpo?: unknown, metodo: "GET" | "POST" | "PUT" = corpo === undefined ? "GET" : "POST"): Promise<RespostaApi<T>> {
  try {
    const r = await fetch(`/api/${caminho}`, {
      method: metodo,
      headers: { accept: "application/json", ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
    const json: unknown = await r.json().catch(() => null);
    const erro = (json as { erro?: unknown; detalhes?: Record<string, unknown> } | null)?.erro;
    // { erro: { codigo } } (rotas) ou { erro: "CODIGO" } (funções do banco)
    const codigo = typeof erro === "string" ? erro : (erro as { codigo?: unknown } | undefined)?.codigo;
    if (r.ok && codigo === undefined) return { ok: true, dados: json as T };
    const detalhes = (typeof erro === "string" ? (json as { detalhes?: Record<string, unknown> }).detalhes : (erro as { detalhes?: Record<string, unknown> } | undefined)?.detalhes) ?? {};
    return { ok: false, codigo: ehCodigoErro(codigo) ? codigo : "INTERNAL_ERROR", detalhes };
  } catch {
    return { ok: false, codigo: "UPSTREAM_UNAVAILABLE", detalhes: {} };
  }
}

export function mensagemDeErro(codigo: CodigoErro, detalhes: Record<string, unknown> = {}): string {
  return textoErro(codigo, detalhes as ContextoErro).mensagem;
}

/** Sem sessão ou sem o segundo fator: volta para o login. */
export function precisaEntrar(codigo: CodigoErro): boolean {
  return codigo === "UNAUTHORIZED" || codigo === "MFA_REQUIRED";
}

const FUSO = "America/Sao_Paulo";
export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSO });
}
export function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
}
/** Telefone +5577998128809 → (77) 99812-8809 (o painel vê o número inteiro). */
export function telefone(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : e164;
}
