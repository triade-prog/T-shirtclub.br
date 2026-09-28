import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BotaoCampanha as BotaoCampanhaUi, MICRO_CAMPANHA, NomeCampanha, TopoCampanha as TopoCampanhaUi, cx, universoDaPaleta, type Universo } from "@tshirtclub/ui";
import { urlFoto, type CapituloColecao, type CartaoProduto, type Colecao, type Foto } from "@/lib/catalogo";
import { CardProduto } from "../../_vitrine/CardProduto";

// Coleção como capítulo de campanha (28/09, D35 e D36): a marca é a T-shirt Club, a campanha tem
// nome próprio e a coleção é o capítulo. Um esqueleto só para todas (foto, campanha, coleção,
// manifesto, capítulos, Build Your Club, o resto da coleção e a próxima história), mas cada
// universo com a sua paleta, o seu ritmo e um detalhe próprio, para as cinco páginas não serem a
// mesma com outra cor (0430). A foto fica limpa (sem texto nem botão dentro); o HTML traz o resto.
// Os universos, o nome da campanha e o topo estão em packages/ui, para a prévia do painel.

const MICRO = MICRO_CAMPANHA;

export function universo(colecao: Colecao): Universo {
  return universoDaPaleta(colecao.paleta);
}

/** A campanha aparece na loja só com nome e ligada no painel (0430: gravada antes das fotos). */
export function campanhaLigada(colecao: Colecao): boolean {
  return Boolean(colecao.campanha && colecao.campanhaAtiva);
}

/** Foto da campanha: 4:5 no celular (quando existe) e 16:9 no computador, com o mínimo de moldura. */
function FotoCampanha({ capa, celular, prioridade = true, tamanhos = "(min-width: 1280px) 1240px, 100vw" }: {
  capa: Foto; celular: Foto | null | undefined; prioridade?: boolean; tamanhos?: string;
}) {
  const moldura = "relative overflow-hidden rounded-[24px] ring-1 ring-camp-tinta/15";
  if (!celular) {
    return (
      <div className={cx(moldura, "aspect-video")}>
        <Image src={urlFoto(capa.caminho)} alt={capa.alt ?? ""} fill priority={prioridade} sizes={tamanhos} className="object-cover" />
      </div>
    );
  }
  // Direção de arte: a foto do celular é outra composição, não um recorte da do computador
  const { props: { srcSet: srcComputador } } = getImageProps({ src: urlFoto(capa.caminho), alt: "", width: 2400, height: 1350, sizes: tamanhos });
  const { props: { srcSet: srcCelular, ...img } } = getImageProps({ src: urlFoto(celular.caminho), alt: celular.alt ?? capa.alt ?? "", width: 1080, height: 1350, sizes: "100vw", priority: prioridade });
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

/** Topo da coleção de campanha (desenho em packages/ui, o mesmo da prévia do painel), com a foto da loja. */
export function TopoCampanha({ colecao, qtdEstampas, botao }: { colecao: Colecao; qtdEstampas: string; botao: React.ReactNode }) {
  return <TopoCampanhaUi colecao={colecao} qtdEstampas={qtdEstampas} botao={botao} foto={colecao.capa && <FotoCampanha capa={colecao.capa} celular={colecao.capaCelular} />} />;
}

/** Botão "Ver as N estampas" na cor estrutural da campanha, sem o adesivo do Club. */
export function BotaoCampanha({ produtos, href }: { produtos: number; href?: string }) {
  return <BotaoCampanhaUi produtos={produtos} href={href} Link={Link} />;
}

/**
 * Capítulos da campanha (ex.: Mattina · Pomeriggio · Aperitivo): o capítulo, o título e a frase, a
 * foto editorial entre o título e as estampas, e as estampas dele (só as que estão na vitrine).
 */
export function CapitulosCampanha({ colecao, produtos, oferta, id }: { colecao: Colecao; produtos: CartaoProduto[]; oferta?: string; id?: string }) {
  const capitulos: CapituloColecao[] = colecao.capitulos ?? [];
  if (capitulos.length === 0) return null;
  const u = universo(colecao);
  const silencio = u.ritmo === "silencio";
  return (
    <div id={id} className={cx("grid scroll-mt-32 gap-16 px-3.5 py-14 md:gap-24 md:px-5 md:py-20", silencio && "md:gap-32")}>
      {capitulos.map((k, i) => {
        const pecas = k.produtos.map((pid) => produtos.find((p) => p.id === pid)).filter((p): p is CartaoProduto => Boolean(p));
        const inclinada = u.ritmo === "humor" ? (i % 2 === 0 ? "md:-rotate-1" : "md:rotate-1") : "";
        return (
          <section key={k.rotulo} aria-labelledby={`capitulo-${i}`} className="grid gap-8">
            <div className={cx("grid gap-3", silencio ? "justify-items-center text-center" : "max-w-[46rem]")}>
              <p className={cx(MICRO, "text-camp-terracota")}>{String(i + 1).padStart(2, "0")} · {k.rotulo}</p>
              <h2 id={`capitulo-${i}`} className="m-0 font-editorial text-[clamp(36px,5vw,68px)] font-semibold leading-[0.95] tracking-[-0.04em] text-camp-azul">{k.titulo}</h2>
              {k.texto && <p className="m-0 max-w-[40ch] font-editorial text-[clamp(18px,1.8vw,22px)] italic leading-snug text-camp-tinta">{k.texto}</p>}
            </div>
            {k.foto && (
              <div className={cx("relative aspect-[4/5] overflow-hidden rounded-[24px] ring-1 ring-camp-tinta/15 md:aspect-[21/9]", inclinada, silencio && "md:mx-auto md:aspect-[16/10] md:w-3/4")}>
                <Image src={urlFoto(k.foto.caminho)} alt={k.foto.alt ?? ""} fill sizes="(min-width: 1280px) 1240px, 100vw" className="object-cover" />
              </div>
            )}
            {pecas.length > 0 && (
              silencio ? (
                // Fé: poucas peças, centradas, com espaço em volta
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-6 md:gap-x-4">
                  {pecas.map((p) => <div key={p.id} className="w-[calc(50%-0.375rem)] md:w-[23%]"><CardProduto produto={p} oferta={oferta} /></div>)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4">
                  {pecas.map((p) => <CardProduto key={p.id} produto={p} oferta={oferta} />)}
                </div>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Build Your Club: o fim da história puxa para o trio (3 T-shirts · R$ 119,99), com o progresso da sacola. */
export function BuildYourClub({ colecao, qtdEstampas, oferta, progresso }: { colecao: Colecao; qtdEstampas: string; oferta: string; progresso: React.ReactNode }) {
  const silencio = universo(colecao).ritmo === "silencio";
  return (
    <section aria-labelledby="build-your-club" className={cx("grid gap-5 border-t border-camp-tinta/15 px-3.5 py-14 md:px-5 md:py-20", silencio ? "justify-items-center text-center" : "justify-items-start")}>
      <p className={cx(MICRO, "text-camp-terracota")}>{qtdEstampas} · monte seu trio</p>
      <h2 id="build-your-club" className="m-0 font-editorial text-[clamp(44px,7vw,104px)] font-semibold uppercase leading-[0.9] tracking-[-0.03em] text-camp-azul">{colecao.nome}</h2>
      <p className="m-0 font-display text-[clamp(24px,3vw,40px)] font-extrabold uppercase tracking-[-0.01em] text-camp-tomate">{oferta.replace(" por ", " T-shirts · ")}</p>
      <div className="w-full">{progresso}</div>
    </section>
  );
}

/** Next story: a próxima campanha ligada, na paleta dela, com a foto grande. */
export function ProximaHistoria({ colecao }: { colecao: Colecao }) {
  const u = universo(colecao);
  return (
    <section aria-labelledby="proxima-historia" className={cx(u.classe, "bg-camp-base px-3.5 py-14 text-camp-tinta md:px-5 md:py-20")}>
      <Link href={`/colecao/${colecao.slug}`} className="group grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-3">
            <p className={cx(MICRO, "text-camp-terracota")}>Next story</p>
            <h2 id="proxima-historia" className="m-0"><NomeCampanha colecao={colecao} u={u} Tag="span" /></h2>
          </div>
          <span className={cx(MICRO, "inline-flex min-h-11 items-center gap-2 text-camp-azul")}>
            Descobrir {colecao.nome} <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" strokeWidth={1.8} />
          </span>
        </div>
        {colecao.capa && <FotoCampanha capa={colecao.capa} celular={colecao.capaCelular} prioridade={false} />}
      </Link>
    </section>
  );
}
