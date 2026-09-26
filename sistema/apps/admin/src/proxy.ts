// Proxy (antigo middleware): gera um nonce por requisição e grava a CSP e os cabeçalhos de
// segurança (G16). O nonce exige renderização dinâmica das páginas.
import { NextResponse, type NextRequest } from "next/server";
import { cabecalhosSeguranca, gerarNonce, montarCsp } from "@tshirtclub/servidor/cabecalhos";

export function proxy(request: NextRequest) {
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
