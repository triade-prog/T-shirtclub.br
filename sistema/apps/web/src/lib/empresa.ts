// Dados da loja (E6, informados em 27/09) num lugar só: política de privacidade e rodapé.
export const EMPRESA = {
  razaoSocial: "Carolina Soares Santana",
  cnpj: "60.814.144/0001-03",
  endereco: "2ª Travessa Palestina, Centro, Caetité (BA), CEP 46400-153",
  emailEncarregado: "contato@grouptriade.com.br",
  nomeEncarregado: "Carolina Soares Santana",
  prazoFiscal: "5 anos",
  whatsapp: "(77) 99815-5772",
} as const;

/** Instagram e TikTok da loja (LOJA_INSTAGRAM e LOJA_TIKTOK, sem o @); sem eles, o rodapé não mostra. */
export function redesDaLoja(env: Record<string, string | undefined>): { rede: "Instagram" | "TikTok"; usuario: string; url: string }[] {
  const usuario = (v: string | undefined) => (v && /^@?[A-Za-z0-9._]{1,30}$/.test(v) ? v.replace(/^@/, "") : null);
  const ig = usuario(env.LOJA_INSTAGRAM);
  const tt = usuario(env.LOJA_TIKTOK);
  return [
    ...(ig ? [{ rede: "Instagram" as const, usuario: ig, url: `https://www.instagram.com/${ig}/` }] : []),
    ...(tt ? [{ rede: "TikTok" as const, usuario: tt, url: `https://www.tiktok.com/@${tt}` }] : []),
  ];
}
