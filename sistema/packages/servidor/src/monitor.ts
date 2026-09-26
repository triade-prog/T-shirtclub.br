// Relato de erros dos apps Next (F11.5), com as mesmas regras das Edge Functions: o texto
// sai limpo de dados pessoais (packages/domain) e, com SENTRY_DSN, vai para o Sentry pelo
// envelope. Usado no onRequestError do instrumentation.ts de cada app.

import { envelopeSentry, semDadosPessoais } from "@tshirtclub/domain";

export interface ContextoRequisicao {
  /** Padrão da rota (/produtos/[slug]), nunca o caminho com ids ou a consulta. */
  routePath?: string;
  routeType?: string;
}

export async function relatarErroNext(
  app: "web" | "admin",
  erro: unknown,
  metodo: string | undefined,
  contexto: ContextoRequisicao,
  env: Record<string, string | undefined>,
  buscar: typeof fetch = fetch,
): Promise<void> {
  const texto = semDadosPessoais(erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro));
  console.error(JSON.stringify({ app, rota: contexto.routePath, tipo: contexto.routeType, erro: texto }));
  const dsn = env.SENTRY_DSN;
  if (!dsn) return;
  const envio = envelopeSentry(dsn, { funcao: app, ambiente: env.AMBIENTE ?? "producao", erro, rota: contexto.routePath, metodo });
  if (!envio) return;
  try {
    await buscar(envio.url, {
      method: "POST", headers: { "content-type": "application/x-sentry-envelope" }, body: envio.corpo, signal: AbortSignal.timeout(3000),
    });
  } catch {
    // monitor fora do ar não derruba a página
  }
}
