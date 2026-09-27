// Proxy (antigo middleware): gera um nonce por requisição e grava a CSP e os cabeçalhos de
// segurança (G16). O nonce exige renderização dinâmica das páginas.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIES_PAINEL } from "@tshirtclub/domain";
import { cabecalhosSeguranca, gerarNonce, montarCsp } from "@tshirtclub/servidor/cabecalhos";

// Abertas sem sessão: o login, o repasse (a api-admin responde 401 sozinha) e a página
// interna de componentes (só existe com MOSTRAR_COMPONENTES).
const SEM_SESSAO = ["/entrar", "/api", "/_componentes"];

/** Sem o cookie da sessão, nenhuma tela do painel abre: vai para o login e volta depois. */
function exigirSessao(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  if (SEM_SESSAO.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  if (request.cookies.has(COOKIES_PAINEL.painel)) return null;
  const destino = new URL("/entrar", request.nextUrl);
  if (pathname !== "/") destino.searchParams.set("voltar", pathname + search);
  const resposta = NextResponse.redirect(destino, 307);
  for (const [k, v] of Object.entries(cabecalhosSeguranca("painel", pathname))) resposta.headers.set(k, v);
  return resposta;
}

export function proxy(request: NextRequest) {
  const redirecionamento = exigirSessao(request);
  if (redirecionamento) return redirecionamento;

  const nonce = gerarNonce();
  const csp = montarCsp({
    app: "painel",
    nonce,
    origemImagens: process.env.ORIGEM_IMAGENS,
    dev: process.env.NODE_ENV === "development",
  });

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const resposta = NextResponse.next({ request: { headers } });
  resposta.headers.set("content-security-policy", csp);
  for (const [k, v] of Object.entries(cabecalhosSeguranca("painel", request.nextUrl.pathname))) resposta.headers.set(k, v);
  return resposta;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|marca/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
