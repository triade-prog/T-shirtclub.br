import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { cx } from "./classes.ts";
import { Selo } from "./Selo.tsx";
import { SetaDireita } from "./SlideCapa.tsx";

// Topo da página da coleção sem campanha ligada (28/09): com banner (o banner inteiro no topo e
// o nome numa faixa logo abaixo) ou simples (o nome grande e, ao lado, o mosaico das peças), e a
// faixa verde com a chamada. Fica aqui, e não na loja, para a prévia do painel desenhar o mesmo
// topo que a loja mostra; a foto e o mosaico (next/image na loja, miniaturas no painel) chegam prontos.

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** O nome em duas linhas equilibradas, com o ponto final ("Estate / Italiana."). */
export function tituloEmDuasLinhas(nome: string): [string] | [string, string] {
  const palavras = nome.trim().split(/\s+/);
  if (palavras.length < 2) return [`${nome.trim()}.`];
  let melhor: [string, string] = [palavras[0]!, `${palavras.slice(1).join(" ")}.`];
  for (let i = 2; i < palavras.length; i++) {
    const par: [string, string] = [palavras.slice(0, i).join(" "), `${palavras.slice(i).join(" ")}.`];
    if (Math.max(par[0].length, par[1].length) < Math.max(melhor[0].length, melhor[1].length)) melhor = par;
  }
  return melhor;
}

/** "Ver as N estampas", que desce até as peças; sem peças, nada. */
export function BotaoPecas({ produtos, href = "#pecas", Link = "a" }: { produtos: number; href?: string; Link?: ComponentType<PropsLink> | "a" }) {
  if (produtos === 0) return null;
  return (
    <Link href={href} className="inline-flex min-h-13 items-center gap-2 rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
      Ver {produtos === 1 ? "a estampa" : `as ${produtos} estampas`}
      <SetaDireita className="size-5" />
    </Link>
  );
}

interface PropsTopo { nome: string; qtdEstampas: string; descricao?: string | null; botao: ReactNode }

/** Com banner de campanha: o banner inteiro no topo e o nome, a descrição e o botão logo abaixo. */
export function TopoColecaoBanner({ nome, qtdEstampas, descricao, botao, foto }: PropsTopo & { foto: ReactNode }) {
  const linhas = tituloEmDuasLinhas(nome);
  return (
    <section className="border-b-3 border-tinta bg-colecao-fundo px-3.5 pb-9 pt-5 md:px-5 md:pb-12 md:pt-7">
      <div className="relative aspect-video overflow-hidden rounded-[26px] border-3 border-tinta shadow-[8px_8px_0_var(--tc-rosa)]">
        {foto}
      </div>
      <div className="mt-8 grid items-end gap-5 md:mt-10 md:grid-cols-[1fr_auto] md:gap-12">
        <div className="grid justify-items-start gap-3">
          <Selo>Coleção · {qtdEstampas}</Selo>
          <h1 className="m-0 font-editorial text-[clamp(44px,6vw,84px)] font-bold italic leading-[0.9] tracking-[-0.05em] text-rosa-press [text-shadow:4px_4px_0_var(--tc-rosa-bruma)]">
            {linhas.map((l, k) => <span key={l} className="whitespace-nowrap max-md:block">{k > 0 && <span className="max-md:hidden"> </span>}{l}</span>)}
          </h1>
        </div>
        <div className="grid justify-items-start gap-4 md:justify-items-end md:text-right">
          {descricao && (
            <p className="m-0 max-w-[34ch] font-editorial text-xl italic leading-tight text-tinta-suave">{descricao}</p>
          )}
          {botao}
        </div>
      </div>
    </section>
  );
}

/** Sem banner: 45% texto e 55% o mosaico das peças reais (sem nenhuma, só o texto). */
export function TopoColecaoSimples({ nome, qtdEstampas, descricao, botao, mosaico }: PropsTopo & { mosaico?: ReactNode }) {
  const linhas = tituloEmDuasLinhas(nome);
  return (
    <section className="overflow-x-clip border-b-3 border-tinta bg-colecao-fundo px-3.5 py-10 md:px-5 md:py-14">
      <div className={cx("mx-auto grid max-w-7xl items-center gap-9 md:gap-12", Boolean(mosaico) && "md:grid-cols-[45fr_55fr]")}>
        <div className="grid justify-items-start gap-5">
          <Selo>Coleção · {qtdEstampas}</Selo>
          <h1 className="m-0 font-editorial text-[clamp(56px,9vw,124px)] font-bold italic leading-[0.86] tracking-[-0.055em] text-rosa-press [text-shadow:5px_5px_0_var(--tc-rosa-bruma)]">
            {linhas.map((l) => <span key={l} className="block whitespace-nowrap">{l}</span>)}
          </h1>
          {descricao && (
            <p className="m-0 max-w-[30ch] font-editorial text-[22px] italic leading-tight text-tinta-suave">{descricao}</p>
          )}
          {botao}
        </div>
        {mosaico}
      </div>
    </section>
  );
}

/** Faixa verde "The Club edit" com a chamada da coleção (página sem campanha ligada). */
export function FaixaChamada({ chamada }: { chamada: string }) {
  return (
    <section className="border-b-3 border-tinta bg-verde-escuro px-3.5 py-8 text-no-verde md:px-5 md:py-10">
      <div className="mx-auto grid max-w-7xl items-center gap-2 md:grid-cols-[auto_1fr] md:gap-8">
        <span className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-citrino">The Club edit</span>
        <p className="m-0 font-editorial text-[clamp(24px,3vw,38px)] font-bold italic leading-tight tracking-[-0.02em]">{chamada}</p>
      </div>
    </section>
  );
}
