// As Edge Functions só atendem o repasse /api dos apps (G1): toda chamada precisa do
// segredo de repasse. O IP real da cliente chega num cabeçalho que só o repasse grava.

export const CABECALHO_SEGREDO = "x-repasse-segredo";
export const CABECALHO_IP = "x-cliente-ip";

/** Comparação em tempo constante, para não vazar o segredo pelo tempo de resposta. */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(esperado);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function ipDaCliente(headers: Headers): string | null {
  const ip = headers.get(CABECALHO_IP)?.trim();
  return ip && ip.length <= 45 ? ip : null;
}
