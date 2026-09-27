// Cadastro do autenticador do painel (D12). O Supabase Auth devolve o QR code como o SVG
// puro; é o supabase-js que o transforma em data URL. A api-admin fala direto com o Auth,
// então a conversão fica aqui, usada pela api-admin e pelas telas do painel.

/** QR code pronto para o src de uma <img>: data URL como veio, SVG puro codificado. */
export function qrComoDataUrl(qr: string): string {
  const t = qr.trim();
  if (t.startsWith("data:")) return t;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}`;
}
