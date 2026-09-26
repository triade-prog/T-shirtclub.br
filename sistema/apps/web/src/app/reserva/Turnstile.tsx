"use client";

import { useEffect, useRef } from "react";

// Desafio do Turnstile (Cloudflare) antes de pedir o código (F3). O script entra pela CSP
// com 'strict-dynamic' (quem insere é um script com nonce). Sem chave configurada
// (desenvolvimento e testes), não mostra nada e a api-public decide.
interface ApiTurnstile {
  render(el: HTMLElement, op: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window { turnstile?: ApiTurnstile; aoCarregarTurnstile?: () => void }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=aoCarregarTurnstile";
export const CHAVE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function Turnstile({ aoResolver, versao }: { aoResolver: (token: string | null) => void; versao: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const resolver = useRef(aoResolver);
  useEffect(() => { resolver.current = aoResolver; });

  useEffect(() => {
    if (!CHAVE_TURNSTILE || !caixa.current) return;
    const el = caixa.current;
    let id: string | null = null;
    const desenhar = () => {
      if (!window.turnstile || id !== null) return;
      id = window.turnstile.render(el, {
        sitekey: CHAVE_TURNSTILE,
        language: "pt-br",
        appearance: "interaction-only",
        callback: (t: string) => resolver.current(t),
        "expired-callback": () => resolver.current(null),
        "error-callback": () => resolver.current(null),
      });
    };
    if (window.turnstile) desenhar();
    else {
      window.aoCarregarTurnstile = desenhar;
      if (!document.querySelector(`script[src="${SCRIPT}"]`)) {
        const s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        document.head.appendChild(s);
      }
    }
    return () => { if (id !== null) window.turnstile?.remove(id); };
  }, [versao]);

  return CHAVE_TURNSTILE ? <div ref={caixa} className="min-h-0" /> : null;
}
