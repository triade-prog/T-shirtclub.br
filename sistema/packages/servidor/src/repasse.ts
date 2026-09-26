// Repasse /api (G1): o navegador só fala com o próprio domínio. Este route handler chama
// a Edge Function no servidor, com o segredo de repasse e o IP real da cliente, e devolve
// a resposta. Os cookies de sessão viram de primeira parte (__Host-). Nenhuma regra de
// negócio aqui.

import { COOKIES_LOJA, COOKIES_PAINEL, ErroDominio, type CodigoErro } from "@tshirtclub/domain";

export interface OpcoesRepasse {
  /** URL da função, ex.: https://<projeto>.supabase.co/functions/v1/api-public */
  destino: string;
  segredo: string;
  /** Cookies que podem ir e voltar. Todos precisam começar com __Host-. */
  cookies: readonly string[];
  tempoLimiteMs?: number;
  maxCorpoBytes?: number;
  /** fetch da plataforma; os testes passam o da função, sem rede. */
  buscar?: (url: URL, init: RequestInit) => Promise<Response>;
}

type Ambiente = Record<string, string | undefined>;
const COOKIES_DA_LOJA = Object.values(COOKIES_LOJA);
const COOKIES_DO_PAINEL = Object.values(COOKIES_PAINEL);

/** Repasse da loja → api-public, com os cookies que a api-public grava. */
export function opcoesLoja(env: Ambiente): OpcoesRepasse {
  return { destino: `${env.SUPABASE_FUNCTIONS_URL ?? ""}/api-public`, segredo: env.REPASSE_SEGREDO ?? "", cookies: COOKIES_DA_LOJA };
}

/** Repasse do painel → api-admin. */
export function opcoesPainel(env: Ambiente): OpcoesRepasse {
  return { destino: `${env.SUPABASE_FUNCTIONS_URL ?? ""}/api-admin`, segredo: env.REPASSE_SEGREDO ?? "", cookies: COOKIES_DO_PAINEL };
}

const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const CAMINHO_VALIDO = /^v1(\/[A-Za-z0-9_-]+)+$/;

function erro(codigo: CodigoErro): Response {
  const e = new ErroDominio(codigo);
  return new Response(JSON.stringify(e.toJSON()), {
    status: e.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** IP real da cliente. Na Vercel, x-real-ip e x-forwarded-for são gravados pela própria plataforma. */
export function ipReal(headers: Headers): string | null {
  const ip = headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0];
  const limpo = ip?.trim();
  return limpo && /^[0-9a-fA-F:.]{3,45}$/.test(limpo) ? limpo : null;
}

function cookiesPermitidos(cabecalho: string | null, nomes: readonly string[]): string | null {
  if (!cabecalho) return null;
  const pares = cabecalho
    .split(";")
    .map((p) => p.trim())
    .filter((p) => nomes.includes(p.slice(0, p.indexOf("="))));
  return pares.length ? pares.join("; ") : null;
}

/**
 * Só deixa voltar Set-Cookie de nome permitido e com os atributos obrigatórios de um
 * cookie __Host-: Secure, Path=/ e sem Domain. Acrescenta HttpOnly e SameSite=Lax se faltarem.
 */
export function filtrarSetCookie(valores: string[], nomes: readonly string[]): string[] {
  const saida: string[] = [];
  for (const valor of valores) {
    const [par, ...atributos] = valor.split(";").map((p) => p.trim());
    const nome = par?.slice(0, par.indexOf("=")) ?? "";
    if (!par || !nomes.includes(nome) || !nome.startsWith("__Host-")) continue;
    const attrs = atributos.filter((a) => !/^domain=/i.test(a));
    const tem = (re: RegExp) => attrs.some((a) => re.test(a));
    if (!tem(/^secure$/i) || !tem(/^path=\/$/i)) continue;
    if (!tem(/^httponly$/i)) attrs.push("HttpOnly");
    if (!tem(/^samesite=/i)) attrs.push("SameSite=Lax");
    saida.push([par, ...attrs].join("; "));
  }
  return saida;
}

export function criarRepasse(obterOpcoes: () => OpcoesRepasse) {
  return async function repassar(req: Request, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
    const op = obterOpcoes();
    if (!op.segredo || !op.destino) return erro("UPSTREAM_UNAVAILABLE");
    if (!METODOS.has(req.method)) return erro("NOT_FOUND");

    const caminho = ((await ctx.params).path ?? []).join("/");
    if (!CAMINHO_VALIDO.test(caminho)) return erro("NOT_FOUND");

    const headers = new Headers({ "x-repasse-segredo": op.segredo, accept: "application/json" });
    const ip = ipReal(req.headers);
    if (ip) headers.set("x-cliente-ip", ip);
    const cookie = cookiesPermitidos(req.headers.get("cookie"), op.cookies);
    if (cookie) headers.set("cookie", cookie);
    // Um por clique no pagamento (seção 08); a função confere o formato
    const chave = req.headers.get("idempotency-key");
    if (chave && /^[0-9A-Za-z-]{1,64}$/.test(chave)) headers.set("idempotency-key", chave);

    let corpo: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "DELETE") {
      const tipo = req.headers.get("content-type") ?? "";
      if (!tipo.startsWith("application/json")) return erro("VALIDATION_ERROR");
      corpo = await req.arrayBuffer();
      if (corpo.byteLength > (op.maxCorpoBytes ?? 64 * 1024)) return erro("VALIDATION_ERROR");
      headers.set("content-type", "application/json");
    }

    const url = new URL(`${op.destino.replace(/\/$/, "")}/${caminho}`);
    url.search = new URL(req.url).search;

    let resposta: Response;
    try {
      resposta = await (op.buscar ?? fetch)(url, {
        method: req.method,
        headers,
        body: corpo,
        redirect: "manual",
        signal: AbortSignal.timeout(op.tempoLimiteMs ?? 10_000),
      });
    } catch {
      return erro("UPSTREAM_UNAVAILABLE");
    }

    const saida = new Headers({ "cache-control": "no-store" });
    const tipo = resposta.headers.get("content-type");
    if (tipo) saida.set("content-type", tipo);
    for (const c of filtrarSetCookie(resposta.headers.getSetCookie(), op.cookies)) saida.append("set-cookie", c);
    return new Response(resposta.body, { status: resposta.status, headers: saida });
  };
}
