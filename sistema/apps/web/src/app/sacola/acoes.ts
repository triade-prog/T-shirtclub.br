"use server";

import { cookies } from "next/headers";
import { COOKIE_SACOLA, SLUG, gravarSacola, lerSacola, opcoesCookieSacola, removerDaSacola } from "@/lib/sacola";

/** "Remover" de uma linha: tira uma peça do modelo. Funciona sem JavaScript (form POST). */
export async function removerPeca(dados: FormData): Promise<void> {
  const slug = dados.get("slug");
  if (typeof slug !== "string" || !SLUG.test(slug)) return;
  const jar = await cookies();
  const itens = removerDaSacola(lerSacola(jar.get(COOKIE_SACOLA)?.value), slug);
  if (itens.length === 0) jar.delete(COOKIE_SACOLA);
  else jar.set(COOKIE_SACOLA, gravarSacola(itens), opcoesCookieSacola);
}
