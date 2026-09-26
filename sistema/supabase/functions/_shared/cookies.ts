// Cookies de primeira parte (G1): __Host- exige Secure, Path=/ e nenhum Domain. O repasse
// só deixa passar os nomes de cada app.

export function lerCookie(headers: Headers, nome: string): string | null {
  for (const parte of (headers.get("cookie") ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim() || null;
  }
  return null;
}

export function gravarCookie(nome: string, valor: string, maxAgeSegundos: number): string {
  if (!nome.startsWith("__Host-") || !/^[A-Za-z0-9._~:-]*$/.test(valor)) throw new Error("Cookie inválido");
  return `${nome}=${valor}; Path=/; Max-Age=${maxAgeSegundos}; HttpOnly; Secure; SameSite=Strict`;
}

export function apagarCookie(nome: string): string {
  return `${nome}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
