// Autorização do POST /revalidar (revalidação ao publicar): só a api-admin, com o segredo
// REVALIDAR_SEGREDO, que ela e a loja compartilham. Comparação em tempo constante.
import { createHash, timingSafeEqual } from "node:crypto";

export function revalidacaoAutorizada(recebido: string | null, segredo: string | undefined): boolean {
  if (!segredo || !recebido) return false;
  const resumo = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(resumo(recebido), resumo(segredo));
}
