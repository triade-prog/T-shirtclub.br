"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, MessageCircle } from "lucide-react";
import { cx, universoDaPaleta, type PaletaCampanha } from "@tshirtclub/ui";

export interface ColecaoRodape { slug: string; nome: string; cor: string; paleta?: PaletaCampanha | null; campanhaLigada: boolean }

/**
 * Na página de uma coleção (28/09), o rodapé fica curto e na cor dela: sem as vantagens e a Lista
 * VIP, uma faixa com as outras coleções, a ajuda e os dados da empresa. Com a campanha ligada, a
 * faixa usa a paleta da campanha. Na sacola (29/09), o rodapé sem as vantagens e a Lista VIP.
 * Fora disso, o rodapé completo. A troca é no navegador
 * porque o rodapé fica no layout, que não é refeito quando a cliente navega entre as páginas.
 */
export function RodapeTroca({ completo, semExtras, colecoes, whatsapp, numero, empresa }: {
  completo: React.ReactNode; semExtras: React.ReactNode; colecoes: ColecaoRodape[]; whatsapp: string; numero: string; empresa: string;
}) {
  const caminho = usePathname();
  if (caminho === "/sacola" || caminho.startsWith("/sacola/")) return semExtras;
  const slug = /^\/colecao\/([^/?#]+)/.exec(caminho)?.[1];
  const atual = slug ? colecoes.find((c) => c.slug === decodeURIComponent(slug)) : undefined;
  if (!atual) return completo;

  // Sem campanha: o tom escuro da cor da coleção, com texto branco (contraste acima de 5:1 nas 5
  // cores; text-branco, porque o tema não tem text-white). Com campanha: a cor estrutural da
  // paleta, com a base e o acento dela (conferidos na D36). O logo no lugar do nome escrito (28/09).
  const campanha = atual.campanhaLigada;
  const link = "inline-flex min-h-11 items-center underline-offset-4 hover:underline";
  return (
    <footer className={cx("mt-16", `col-${atual.cor.toLowerCase()}`, campanha && universoDaPaleta(atual.paleta).classe)}>
      <div className={cx(campanha ? "border-t-4 border-camp-limao bg-camp-azul text-camp-base" : "border-t-4 border-colecao bg-colecao-tinta text-branco")}>
        <div className="mx-auto grid max-w-7xl gap-x-10 gap-y-4 px-3.5 py-7 md:grid-cols-[auto_1fr] md:items-start md:px-5">
          <Link href="/" aria-label="T-shirt Club.br" className="inline-flex min-h-11 items-center">
            <Image src="/marca/logo-limao.webp" alt="" width={160} height={108} className="h-12 w-auto md:h-14" />
          </Link>
          <div className="grid gap-1 text-[13px]">
            <nav aria-label="Coleções">
              <ul className="m-0 flex list-none flex-wrap gap-x-5 p-0">
                {colecoes.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/colecao/${c.slug}`} aria-current={c.slug === atual.slug ? "page" : undefined}
                      className={cx(link, c.slug === atual.slug && "font-bold underline")}>{c.nome}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Ajuda">
              <ul className="m-0 flex list-none flex-wrap gap-x-5 p-0">
                <li><Link href="/#monte-club" className={link}>Monte seu Club</Link></li>
                <li><Link href="/consulta" className={link}>Minhas reservas</Link></li>
                <li><Link href="/sacola" className={link}>Minha sacola</Link></li>
                <li><Link href="/trocas" className={link}>Trocas e devoluções</Link></li>
                <li><Link href="/privacidade" className={link}>Privacidade</Link></li>
                <li>
                  <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer" className={cx(link, "gap-1.5")}>
                    <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.8} /> WhatsApp {whatsapp}
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="border-t border-current/20">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 px-3.5 py-2 text-[11px] leading-relaxed md:px-5">
            <p className="m-0 max-w-[80ch]">{empresa}</p>
            <a href="#" className="inline-flex min-h-11 items-center gap-1.5 font-bold uppercase tracking-[0.1em]">
              <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} /> Voltar ao topo
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
