// Cookies da loja (G1, G12): a api-public grava e lê; o repasse /api da loja só deixa passar
// estes. Um lugar só, para a lista do repasse nunca ficar para trás de uma rota nova.
export const COOKIES_LOJA = {
  /** Sessão da cliente: escopo TELEFONE ou RESERVA:<id> (link). */
  sessao: "__Host-sessao",
  /** Tentativa de reserva presa ao navegador. */
  tentativa: "__Host-tentativa",
  /** Consulta com código (e validação da entrega pelo link). */
  consulta: "__Host-consulta",
} as const;

// Cookie do painel (api-admin grava e lê; o repasse /api do painel só deixa passar este).
export const COOKIES_PAINEL = {
  /** Sessão do Supabase Auth (tokens empacotados), em aal1 até o autenticador. */
  painel: "__Host-painel",
} as const;
