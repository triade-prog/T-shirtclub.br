"use server";

import { cookies } from "next/headers";
import { buscarOfertaClub } from "@/lib/catalogo";
import { COOKIE_SACOLA, SLUG, adicionarNaSacola, gravarSacola, lerSacola, lerTamanho, opcoesApagarSacola, opcoesCookieSacola, pecasNaSacola, progressoTrio, removerDaSacola, textoAviso } from "@/lib/sacola";

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

/**
 * "+" do cartão e "Adicionar ao Club" sem sair da página: grava a peça no cookie, como o GET
 * /sacola?adicionar do proxy (que continua valendo sem JavaScript), e devolve o progresso do trio
 * para o aviso. Com limite atingido, a sacola não muda e volta o texto do aviso.
 */
export async function adicionarSemSair(slug: string, tamanho: string): Promise<{ progresso: string | null; aviso: string | null } | null> {
  const t = lerTamanho(tamanho);
  if (typeof slug !== "string" || !SLUG.test(slug) || !t) return null;
  const jar = await cookies();
  const { itens, aviso } = adicionarNaSacola(lerSacola(jar.get(COOKIE_SACOLA)?.value), slug, t);
  if (aviso) return { progresso: null, aviso: textoAviso(aviso) };
  jar.set(COOKIE_SACOLA, gravarSacola(itens), opcoesCookieSacola);
  const club = await buscarOfertaClub();
  const p = club ? progressoTrio(pecasNaSacola(itens), club.qtd) : null;
  return { progresso: p?.titulo ? `${p.noTrio}/${club!.qtd} · ${p.titulo}` : null, aviso: null };
}
