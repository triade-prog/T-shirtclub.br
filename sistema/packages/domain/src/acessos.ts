// Acessos da loja (0520): a loja manda, a cada página vista, o caminho, de onde a visita veio
// (só na primeira página) e mais nada. Aqui ficam as regras que limpam isso antes do banco: só
// endereços da loja, origens conhecidas, aparelho pelo navegador e robôs fora. Sem cookie e sem
// dado pessoal (a política de privacidade conta como funciona).

import { z } from "zod";

/** POST /v1/visita (corpo que a loja manda a cada página vista). */
export const visitaSchema = z.object({
  caminho: z.string().max(300),
  /** Na primeira página da visita: utm_source ou o endereço de onde veio ("" = direto). */
  origem: z.string().max(300).optional(),
});

const FIXOS = new Set(["/", "/sacola", "/trocas", "/privacidade", "/consulta", "/reserva", "/reserva/codigo", "/pagamento-aprovado", "/r"]);

/**
 * O endereço que vai para o banco, ou null para não contar. Só as páginas da loja; o número da
 * reserva some (fica "/reserva/numero").
 */
export function caminhoDaVisita(caminho: string): string | null {
  const c = caminho.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (FIXOS.has(c)) return c;
  if (/^\/(colecao|produto)\/[a-z0-9]+(-[a-z0-9]+)*$/.test(c) && c.length <= 100) return c;
  if (/^\/reserva\/\d{1,9}$/.test(c)) return "/reserva/numero";
  return null;
}

/** Origens que o painel mostra; o resto vira "outros". */
export const ORIGENS_VISITA = {
  direto: "Direto (digitou ou salvou o link)",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  google: "Google",
  facebook: "Facebook",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  youtube: "YouTube",
  x: "X (Twitter)",
  bing: "Bing",
  outros: "Outros sites",
} as const;

export type OrigemVisita = keyof typeof ORIGENS_VISITA;

const REGRAS: [RegExp, OrigemVisita][] = [
  [/(^|[^a-z])(instagram|ig)([^a-z]|$)/, "instagram"],
  [/whatsapp|(^|\.)wa\.me/, "whatsapp"],
  [/google/, "google"],
  [/facebook|(^|[^a-z])fb([^a-z]|$)|(^|\.)fb\.(com|me)/, "facebook"],
  [/tiktok/, "tiktok"],
  [/pinterest|(^|\.)pin\.it/, "pinterest"],
  [/youtube|(^|\.)youtu\.be/, "youtube"],
  [/twitter|(^|\.)x\.com|(^|\.)t\.co$/, "x"],
  [/bing/, "bing"],
];

/**
 * De onde a visita veio: o utm_source ou o endereço anterior (só o domínio importa). Vazio é
 * direto. Endereço da própria loja não é origem (null): é navegação dentro do site.
 */
export function origemDaVisita(origem: string, hostDaLoja?: string | null): OrigemVisita | null {
  const t = origem.trim().toLowerCase();
  if (!t) return "direto";
  let host = t;
  try {
    if (/^https?:\/\//.test(t)) host = new URL(t).hostname;
  } catch {
    return "outros";
  }
  if (hostDaLoja && (host === hostDaLoja.toLowerCase() || host.endsWith(`.${hostDaLoja.toLowerCase()}`))) return null;
  return REGRAS.find(([re]) => re.test(host))?.[1] ?? "outros";
}

export type Aparelho = "mobile" | "tablet" | "desktop";

/** Pelo navegador (user-agent): iPad e tablets Android à parte do celular. */
export function aparelhoDoNavegador(navegador: string): Aparelho {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(navegador)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(navegador)) return "mobile";
  return "desktop";
}

/** Robôs de busca, prévias de link e ferramentas: não contam. Sem navegador também não. */
export function ehRobo(navegador: string | null | undefined): boolean {
  if (!navegador || navegador.length < 20) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|headless|lighthouse|pagespeed|curl|wget|python|axios|node-fetch|go-http|java\/|vercel|monitor|uptime/i.test(navegador);
}
