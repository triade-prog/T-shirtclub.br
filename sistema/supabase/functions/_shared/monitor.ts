// Relato de erros das Edge Functions (F11.5): o log sai limpo de dados pessoais e, com o
// SENTRY_DSN configurado, o erro vai para o Sentry (ou compatível) pelo envelope. Sem DSN,
// fica só o log. Relatar nunca derruba a resposta.

import { envelopeSentry, semDadosPessoais } from "@tshirtclub/domain";

interface ConfigMonitor {
  funcao: string;
  ambiente: string;
  dsn?: string;
  buscar?: typeof fetch;
}

let config: ConfigMonitor = { funcao: "desconhecida", ambiente: "desenvolvimento" };

export function configurarMonitor(c: ConfigMonitor): void {
  config = c;
}

/** Padrão da rota do Hono (/v1/reservations/:id), nunca a URL com ids. */
export interface ContextoErro {
  rota?: string;
  metodo?: string;
  tarefa?: string;
}

export async function relatarErro(erro: unknown, contexto: ContextoErro = {}): Promise<void> {
  const texto = semDadosPessoais(erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro));
  console.error(JSON.stringify({ funcao: config.funcao, ...contexto, erro: texto }));
  if (!config.dsn) return;
  const envio = envelopeSentry(config.dsn, {
    funcao: config.funcao, ambiente: config.ambiente, erro, rota: contexto.rota ?? contexto.tarefa, metodo: contexto.metodo,
  });
  if (!envio) return;
  try {
    await (config.buscar ?? fetch)(envio.url, {
      method: "POST", headers: { "content-type": "application/x-sentry-envelope" }, body: envio.corpo, signal: AbortSignal.timeout(3000),
    });
  } catch {
    // o log acima já registrou; o monitor fora do ar não pode derrubar nada
  }
}

/** Lê a configuração do ambiente (index.ts de cada função). */
export function monitorDoAmbiente(funcao: string): void {
  configurarMonitor({ funcao, ambiente: Deno.env.get("AMBIENTE") ?? "producao", dsn: Deno.env.get("SENTRY_DSN") || undefined });
}
