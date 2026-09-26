// Cloudflare Turnstile: confere o desafio no servidor. No login do painel, a partir do
// 3º erro (G7); no pedido de código da loja, na F3.

export interface VerificadorTurnstile {
  verificar(token: string, ip: string | null): Promise<boolean>;
}

export function turnstileCloudflare(segredo: string, buscar: typeof fetch = fetch): VerificadorTurnstile {
  return {
    async verificar(token, ip) {
      const corpo = new URLSearchParams({ secret: segredo, response: token });
      if (ip) corpo.set("remoteip", ip);
      try {
        const r = await buscar("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: corpo,
          signal: AbortSignal.timeout(5000),
        });
        return r.ok && (await r.json())?.success === true;
      } catch {
        return false;
      }
    },
  };
}
