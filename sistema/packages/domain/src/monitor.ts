// Monitoramento de erros sem dados pessoais (F11.5, G9). Puro, sem I/O: as Edge Functions
// (Deno) e os apps (Next) usam as mesmas regras para limpar o texto e montar o evento no
// formato do Sentry (envelope). Quem envia é cada lado, com o próprio fetch.

/**
 * Tira do texto o que identifica alguém ou abre acesso: e-mail, telefone, CPF, CEP,
 * tokens (JWT, chave do link, cookies) e IP. Mensagem de erro e stack passam por aqui
 * antes de ir para o log ou para fora.
 */
export function semDadosPessoais(texto: string): string {
  return texto
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/__Host-[a-z]+=[^;\s,]+/gi, "[cookie]")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[cpf]")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[ip]")
    // Não pega o fim de um UUID nem parte de um identificador
    .replace(/(?<![\w-])\+?\(?\d[\d\s().-]{8,}\d(?![\w-])/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[telefone]" : m))
    .replace(/\b\d{5}-\d{3}\b/g, "[cep]")
    .replace(/(^|[^0-9A-Za-z-])[0-9A-Za-z]{22}(?![0-9A-Za-z])/g, "$1[chave]")
    .slice(0, 2000);
}

export interface ErroParaMonitor {
  funcao: string;
  ambiente: string;
  erro: unknown;
  /** Padrão da rota (/v1/reservations/:id), nunca a URL com ids e consulta. */
  rota?: string;
  metodo?: string;
  agora?: Date;
  id?: string;
}

export interface EnvioMonitor {
  url: string;
  corpo: string;
}

/** Envelope do Sentry para o DSN (https://chave@host/projeto), ou null se o DSN não serve. */
export function envelopeSentry(dsn: string, e: ErroParaMonitor): EnvioMonitor | null {
  const m = /^https:\/\/([0-9a-f]+)@([^/]+)\/(\d+)$/.exec(dsn.trim());
  if (!m) return null;
  const [, chave, host, projeto] = m;
  const agora = e.agora ?? new Date();
  const id = (e.id ?? crypto.randomUUID()).replace(/-/g, "");
  const erro = e.erro instanceof Error ? e.erro : new Error(String(e.erro));
  const evento = {
    event_id: id,
    timestamp: agora.toISOString(),
    platform: "javascript",
    level: "error",
    environment: e.ambiente,
    tags: { funcao: e.funcao, ...(e.rota ? { rota: e.rota } : {}), ...(e.metodo ? { metodo: e.metodo } : {}) },
    exception: { values: [{ type: erro.name, value: semDadosPessoais(erro.message) }] },
    extra: { stack: semDadosPessoais(erro.stack ?? "") },
  };
  const corpo = [
    JSON.stringify({ event_id: id, sent_at: agora.toISOString() }),
    JSON.stringify({ type: "event", content_type: "application/json" }),
    JSON.stringify(evento),
  ].join("\n");
  return { url: `https://${host}/api/${projeto}/envelope/?sentry_key=${chave}&sentry_version=7`, corpo };
}
