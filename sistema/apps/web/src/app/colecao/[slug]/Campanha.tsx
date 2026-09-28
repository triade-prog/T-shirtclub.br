import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cx } from "@tshirtclub/ui";
import { urlFoto, type CapituloColecao, type CartaoProduto, type Colecao, type Foto } from "@/lib/catalogo";
import { CardProduto } from "../../_vitrine/CardProduto";

// Coleção como capítulo de campanha (28/09, D35 e D36): a marca é a T-shirt Club, a campanha tem
// nome próprio e a coleção é o capítulo. A foto fica limpa (sem texto nem botão dentro), com o
// mínimo de moldura; o HTML traz a campanha, a coleção e o botão. Tipografia editorial reta nos
// títulos e caixa alta espaçada nos textos pequenos; a paleta da coleção domina a página.

const MICRO = "m-0 text-[11px] font-semibold uppercase tracking-[0.24em]";

/** Classe da paleta da página (D36). */
export function classePaleta(colecao: Colecao): string {
  return colecao.paleta === "ESTATE_ITALIANA" ? "paleta-estate-italiana" : "paleta-club";
}

/** Foto da campanha: 4:5 no celular (quando existe) e 16:9 no computador, com o mínimo de moldura. */
function FotoCampanha({ capa, celular }: { capa: Foto; celular: Foto | null | undefined }) {
  const moldura = "relative overflow-hidden rounded-[24px] ring-1 ring-camp-tinta/15";
  if (!celular) {
    return (
      <div className={cx(moldura, "aspect-video")}>
        <Image src={urlFoto(capa.caminho)} alt={capa.alt ?? ""} fill priority sizes="(min-width: 1280px) 1240px, 100vw" className="object-cover" />
      </div>
    );
  }
  // Direção de arte: a foto do celular é outra composição, não um recorte da do computador
  const { props: { srcSet: srcComputador } } = getImageProps({ src: urlFoto(capa.caminho), alt: "", width: 2400, height: 1350, sizes: "(min-width: 1280px) 1240px, 100vw" });
  const { props: { srcSet: srcCelular, ...img } } = getImageProps({ src: urlFoto(celular.caminho), alt: celular.alt ?? capa.alt ?? "", width: 1080, height: 1350, sizes: "100vw", priority: true });
  return (
    <div className={cx(moldura, "aspect-[4/5] md:aspect-video")}>
      <picture>
        <source media="(min-width: 768px)" srcSet={srcComputador} />
        <source srcSet={srcCelular} />
        {/* eslint-disable-next-line jsx-a11y/alt-text -- o alt vem de getImageProps */}
        <img {...img} className="absolute inset-0 size-full object-cover" />
      </picture>
    </div>
  );
}

/** Topo da coleção de campanha: foto, campanha, a coleção com o botão e o The Club Edit. */
export function TopoCampanha({ colecao, qtdEstampas, botao }: { colecao: Colecao; qtdEstampas: string; botao: React.ReactNode }) {
  const linhaColecao = [colecao.nome, colecao.temporada].filter(Boolean).join(" · ");
  return (
    <>
      <section className="px-3.5 pt-5 md:px-5 md:pt-7">
        {colecao.capa && <FotoCampanha capa={colecao.capa} celular={colecao.capaCelular} />}
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-camp-tinta/15 pb-5 md:mt-6">
          <p className="m-0 font-display text-[clamp(32px,4.6vw,60px)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-camp-tomate">{colecao.campanha}</p>
          <p className={cx(MICRO, "text-camp-azul")}>{linhaColecao}</p>
        </div>
      </section>

      <section className="grid items-end gap-8 px-3.5 py-12 md:grid-cols-[1.25fr_0.75fr] md:gap-14 md:px-5 md:py-18">
        <div className="grid gap-4">
          <p className={cx(MICRO, "text-camp-terracota")}>{[colecao.edicao, qtdEstampas].filter(Boolean).join(" · ")}</p>
          <h1 className="m-0 font-editorial text-[clamp(56px,9vw,136px)] font-semibold leading-[0.86] tracking-[-0.045em] text-camp-azul">{colecao.nome}.</h1>
        </div>
        <div className="grid justify-items-start gap-6">
          {colecao.descricao && <p className="m-0 max-w-[26ch] font-editorial text-[clamp(21px,2.1vw,27px)] italic leading-snug text-camp-tinta">{colecao.descricao}</p>}
          {botao}
        </div>
      </section>

      {colecao.chamada && (
        <section className="bg-camp-azul px-3.5 py-12 text-camp-base md:px-5 md:py-18">
          <p className={cx(MICRO, "text-camp-limao")}>The Club Edit</p>
          <span aria-hidden="true" className="my-5 block h-1 w-12 rounded-full bg-camp-limao" />
          <p className="m-0 max-w-[22ch] font-editorial text-[clamp(30px,4.4vw,58px)] font-medium leading-[1.02] tracking-[-0.03em]">{colecao.chamada}</p>
        </section>
      )}
    </>
  );
}

/** Botão "Ver as N estampas" na cor estrutural da campanha, sem o adesivo do Club. */
export function BotaoCampanha({ produtos }: { produtos: number }) {
  if (produtos === 0) return null;
  return (
    <Link href="#pecas" className="inline-flex min-h-13 items-center gap-2.5 rounded-pilula bg-camp-azul px-7 text-[13px] font-semibold uppercase tracking-[0.16em] text-camp-base">
      Ver {produtos === 1 ? "a estampa" : `as ${produtos} estampas`}
      <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
    </Link>
  );
}

/**
 * Capítulos da campanha (ex.: Mattina · Pomeriggio · Aperitivo): foto grande, o capítulo e o
 * título, e as estampas dele logo abaixo (só as da coleção que ainda estão na vitrine).
 */
export function CapitulosCampanha({ capitulos, produtos, oferta }: { capitulos: CapituloColecao[]; produtos: CartaoProduto[]; oferta?: string }) {
  if (capitulos.length === 0) return null;
  return (
    <div className="grid gap-16 px-3.5 py-14 md:gap-24 md:px-5 md:py-20">
      {capitulos.map((k, i) => {
        const pecas = k.produtos.map((id) => produtos.find((p) => p.id === id)).filter((p): p is CartaoProduto => Boolean(p));
        return (
          <section key={k.rotulo} aria-labelledby={`capitulo-${i}`} className="grid gap-8">
            <div className={cx("grid items-end gap-6 md:gap-12", k.foto && "md:grid-cols-[1.5fr_1fr]", k.foto && i % 2 === 1 && "md:grid-cols-[1fr_1.5fr]")}>
              {k.foto && (
                <div className={cx("relative aspect-[4/5] overflow-hidden rounded-[24px] ring-1 ring-camp-tinta/15 md:aspect-[5/4]", i % 2 === 1 && "md:order-2")}>
                  <Image src={urlFoto(k.foto.caminho)} alt={k.foto.alt ?? ""} fill sizes="(min-width: 768px) 60vw, 100vw" className="object-cover" />
                </div>
              )}
              <div className="grid gap-3">
                <p className={cx(MICRO, "text-camp-terracota")}>{String(i + 1).padStart(2, "0")} · {k.rotulo}</p>
                <h2 id={`capitulo-${i}`} className="m-0 font-editorial text-[clamp(36px,5vw,68px)] font-semibold leading-[0.95] tracking-[-0.04em] text-camp-azul">{k.titulo}</h2>
              </div>
            </div>
            {pecas.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4">
                {pecas.map((p) => <CardProduto key={p.id} produto={p} oferta={oferta} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
