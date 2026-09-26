import { describe, expect, it } from "vitest";
import { cabecalhosSeguranca, gerarNonce, montarCsp } from "./cabecalhos.ts";

describe("CSP", () => {
  it("loja: nonce, strict-dynamic, Mercado Pago e Turnstile; nada de unsafe em produção", () => {
    const csp = montarCsp({ app: "loja", nonce: "abc" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("https://sdk.mercadopago.com");
    expect(csp).toContain("frame-src https://sdk.mercadopago.com");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("style-src 'self' 'nonce-abc';");
    expect(csp.replace("style-src-attr 'unsafe-inline'", "")).not.toContain("unsafe");
  });

  it("painel: só o Turnstile do login, e ninguém carrega o painel em frame", () => {
    const csp = montarCsp({ app: "painel", nonce: "abc" });
    expect(csp).not.toContain("mercadopago");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com;");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("desenvolvimento libera o eval do React e o recarregamento", () => {
    const csp = montarCsp({ app: "loja", nonce: "abc", dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("fotos do Storage entram só quando configuradas", () => {
    expect(montarCsp({ app: "loja", nonce: "n", origemImagens: "https://x.supabase.co" })).toContain("img-src 'self' data: blob: https://x.supabase.co");
  });

  it("nonce novo e imprevisível a cada chamada", () => {
    const a = gerarNonce(), b = gerarNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("cabeçalhos fixos", () => {
  it("HSTS, nosniff, referrer e permissões", () => {
    const h = cabecalhosSeguranca("loja");
    expect(h["Strict-Transport-Security"]).toContain("includeSubDomains");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });
  it("no-referrer no link da reserva e painel fora de frames e de buscadores", () => {
    expect(cabecalhosSeguranca("loja", "/r")["Referrer-Policy"]).toBe("no-referrer");
    const p = cabecalhosSeguranca("painel");
    expect(p["X-Frame-Options"]).toBe("DENY");
    expect(p["X-Robots-Tag"]).toContain("noindex");
  });
});
