// Cabeçalhos de segurança e CSP com nonce (G16), iguais nos dois apps, com as diferenças
// de cada um: a loja libera só Mercado Pago (SDK e campos do cartão) e Turnstile; o painel
// libera só o Turnstile (login a partir do 3º erro, G7) e não pode ser carregado em frame.

export type App = "loja" | "painel";

export interface OpcoesCsp {
  app: App;
  nonce: string;
  dev?: boolean;
  /** Origem das fotos no Supabase Storage (ex.: https://xyz.supabase.co). */
  origemImagens?: string;
}

const MERCADO_PAGO = ["https://sdk.mercadopago.com", "https://*.mercadopago.com", "https://*.mercadopago.com.br", "https://*.mercadolibre.com", "https://*.mlstatic.com"];
const TURNSTILE = ["https://challenges.cloudflare.com"];

export function gerarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function montarCsp({ app, nonce, dev = false, origemImagens }: OpcoesCsp): string {
  const loja = app === "loja";
  const img = ["'self'", "data:", "blob:", ...(origemImagens ? [origemImagens] : []), ...(loja ? MERCADO_PAGO : [])];
  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(loja ? MERCADO_PAGO : []), ...TURNSTILE, ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", `'nonce-${nonce}'`, ...(dev ? ["'unsafe-inline'"] : [])],
    // Atributos style (next/image, cores de coleção) não executam código; <style> e scripts
    // continuam presos ao nonce.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": img,
    "font-src": ["'self'"],
    // O painel envia as fotos direto ao Storage, pela URL assinada (não passam pela Vercel).
    "connect-src": ["'self'", ...(loja ? MERCADO_PAGO : origemImagens ? [origemImagens] : []), ...(dev ? ["ws:"] : [])],
    "frame-src": loja ? [...MERCADO_PAGO, ...TURNSTILE] : TURNSTILE,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const partes = Object.entries(diretivas).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) partes.push("upgrade-insecure-requests");
  return partes.join("; ");
}

/** Cabeçalhos fixos (sem a CSP), aplicados em todas as respostas. */
export function cabecalhosSeguranca(app: App, caminho = "/"): Record<string, string> {
  return {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    // O link da reserva (/r) leva a chave no fragmento; mesmo assim, nada de referrer ali.
    "Referrer-Policy": caminho === "/r" || caminho.startsWith("/r/") ? "no-referrer" : "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
    ...(app === "painel" ? { "X-Frame-Options": "DENY", "X-Robots-Tag": "noindex, nofollow" } : {}),
  };
}
