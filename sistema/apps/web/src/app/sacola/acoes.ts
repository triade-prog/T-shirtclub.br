"use server";

import { cookies } from "next/headers";
import { COOKIE_SACOLA, SLUG, gravarSacola, lerSacola, lerTamanho, opcoesApagarSacola, opcoesCookieSacola, removerDaSacola } from "@/lib/sacola";

/** "Remover" de uma linha: tira uma peça do tamanho. Funciona sem JavaScript (form POST). */
export async function removerPeca(dados: FormData): Promise<void> {
  const slug = dados.get("slug");
  const tamanho = lerTamanho(dados.get("tamanho"));
  if (typeof slug !== "string" || !SLUG.test(slug) || !tamanho) return;
  const jar = await cookies();
  const itens = removerDaSacola(lerSacola(jar.get(COOKIE_SACOLA)?.value), slug, tamanho);
  if (itens.length === 0) jar.set(COOKIE_SACOLA, "", opcoesApagarSacola);
  else jar.set(COOKIE_SACOLA, gravarSacola(itens), opcoesCookieSacola);
}
