// Proxy (antigo middleware): gera um nonce por requisição e grava a CSP e os cabeçalhos de
// segurança (G16). O nonce exige renderização dinâmica das páginas.
import { NextResponse, type NextRequest } from "next/server";
import { cabecalhosSeguranca, gerarNonce, montarCsp } from "@tshirtclub/servidor/cabecalhos";
import { COOKIE_SACOLA, adicionarNaSacola, gravarSacola, lerSacola, opcoesCookieSacola } from "@/lib/sacola";

// "Adicionar ao Club" é um GET /sacola?adicionar=<slug> (funciona sem JavaScript): grava a
// peça no cookie da sacola e volta para /sacola sem o parâmetro (recarregar não duplica).
function adicionarPelaUrl(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  const slug = searchParams.get("adicionar");
  if (pathname !== "/sacola" || request.method !== "GET" || slug === null) return null;
  const { itens, aviso } = adicionarNaSacola(lerSacola(request.cookies.get(COOKIE_SACOLA)?.value), slug);
  const destino = new URL("/sacola", request.nextUrl);
  if (aviso) destino.searchParams.set("aviso", aviso);
  const resposta = NextResponse.redirect(destino, 303);
  if (!aviso) resposta.cookies.set(COOKIE_SACOLA, gravarSacola(itens), opcoesCookieSacola);
  return resposta;
}

export function proxy(request: NextRequest) {
  const redirecionamento = adicionarPelaUrl(request);
  if (redirecionamento) return redirecionamento;

  const nonce = gerarNonce();
  const csp = montarCsp({
    app: "loja",
    nonce,
    dev: process.env.NODE_ENV === "development",
    origemImagens: process.env.ORIGEM_IMAGENS,
  });

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const resposta = NextResponse.next({ request: { headers } });
  resposta.headers.set("content-security-policy", csp);
  for (const [k, v] of Object.entries(cabecalhosSeguranca("loja", request.nextUrl.pathname))) resposta.headers.set(k, v);
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
