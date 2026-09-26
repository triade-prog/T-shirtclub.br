// Código de 6 dígitos por CSPRNG e HMAC-SHA256 com o pepper (segredo das funções). O banco
// só vê o hash; o código ligado à referência da tentativa não vale em outra.

export function gerarCodigo(): string {
  const limite = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000; // sem viés do módulo
  const n = new Uint32Array(1);
  do crypto.getRandomValues(n); while (n[0]! >= limite);
  return String(n[0]! % 1_000_000).padStart(6, "0");
}

export async function hashCodigo(pepper: string, ref: string, codigo: string): Promise<string> {
  if (pepper.length < 32) throw new Error("OTP_PEPPER precisa de 32+ caracteres");
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${ref.toUpperCase()}:${codigo}`));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token aleatório para cookies (__Host-tentativa, __Host-sessao) e chaves de link. */
export function tokenAleatorio(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Chave do link da reserva: 22 caracteres base62, cerca de 130 bits (G6). */
export function chaveLink(): string {
  const alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const limite = 248; // 62 × 4, para não enviesar
  let chave = "";
  while (chave.length < 22) {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    for (const x of b) if (x < limite && chave.length < 22) chave += alfabeto[x % 62];
  }
  return chave;
}
