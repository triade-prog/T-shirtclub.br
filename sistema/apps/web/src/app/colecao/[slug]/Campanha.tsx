import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cx } from "@tshirtclub/ui";
import { urlFoto, type CapituloColecao, type CartaoProduto, type Colecao, type Foto } from "@/lib/catalogo";
import { CardProduto } from "../../_vitrine/CardProduto";

// Coleção como capítulo de campanha (28/09, D35 e D36): a marca é a T-shirt Club, a campanha tem
// nome próprio e a coleção é o capítulo. Um esqueleto só para todas (foto, campanha, coleção,
// manifesto, capítulos, Build Your Club, o resto da coleção e a próxima história), mas cada
// universo com a sua paleta, o seu ritmo e um detalhe próprio, para as cinco páginas não serem a
// mesma com outra cor (0430). A foto fica limpa (sem texto nem botão dentro); o HTML traz o resto.

const MICRO = "m-0 text-[11px] font-semibold uppercase tracking-[0.24em]";

type Paleta = NonNullable<Colecao["paleta"]>;

interface Universo {
  classe: string;
  /** editorial: o molde; silencio: centrado, com mais ar e nada divertido (Fé); humor: mais solto (Dog Stories). */
  ritmo: "editorial" | "silencio" | "humor";
  /** Detalhe gráfico próprio do universo. */
  detalhe?: { tipo: "ondas"; coordenadas: string } | { tipo: "revista"; titulo: string; itens: string };
}

const UNIVERSOS: Record<Paleta, Universo> = {
  CLUB: { classe: "paleta-club", ritmo: "editorial" },
  ESTATE_ITALIANA: { classe: "paleta-estate-italiana", ritmo: "editorial" },
  // Riviera: marcações de carta náutica, discretas (Portofino), em vez de peixinhos espalhados
  RIVIERA: { classe: "paleta-riviera", ritmo: "editorial", detalhe: { tipo: "ondas", coordenadas: "44°18′N · 9°12′E" } },
  // Girlhood: a faixa de revista, sem deixar a página infantil
  GIRLHOOD: { classe: "paleta-girlhood", ritmo: "editorial", detalhe: { tipo: "revista", titulo: "Today's very important things", itens: "coffee · cherries · lipstick · friends · nothing urgent" } },
  DOG_STORIES: { classe: "paleta-dog-stories", ritmo: "humor" },
  FE: { classe: "paleta-fe", ritmo: "silencio" },
};

export function universo(colecao: Colecao): Universo {
  return UNIVERSOS[colecao.paleta ?? "CLUB"] ?? UNIVERSOS.CLUB;
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

/** Nome da campanha: Baloo em caixa alta; na Fé, serifa silenciosa; em Dog Stories, quebra na vírgula. */
function NomeCampanha({ colecao, u, className, Tag = "p" }: { colecao: Colecao; u: Universo; className?: string; Tag?: "p" | "span" }) {
  const nome = colecao.campanha ?? "";
  if (u.ritmo === "silencio") {
    return <Tag className={cx("m-0 block font-editorial text-[clamp(40px,6vw,84px)] font-semibold uppercase leading-none tracking-[0.02em] text-camp-tomate", className)}>{nome}</Tag>;
  }
  const partes = u.ritmo === "humor" ? nome.split(/(?<=,)\s+/) : [nome];
  return (
    <Tag className={cx("m-0 block font-display font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-camp-tomate",
      u.ritmo === "humor" ? "text-[clamp(40px,7vw,96px)]" : "text-[clamp(32px,4.6vw,60px)]", className)}>
      {partes.map((p, i) => <span key={i} className="block">{p}</span>)}
    </Tag>
  );
}

/** Topo da coleção de campanha: foto, campanha, a coleção com o botão, o manifesto e o detalhe do universo. */
export function TopoCampanha({ colecao, qtdEstampas, botao }: { colecao: Colecao; qtdEstampas: string; botao: React.ReactNode }) {
  const u = universo(colecao);
  const silencio = u.ritmo === "silencio";
  const linhaColecao = [colecao.nome, colecao.temporada].filter(Boolean).join(" · ");
  return (
    <>
      <section className="px-3.5 pt-5 md:px-5 md:pt-7">
        {colecao.capa && <FotoCampanha capa={colecao.capa} celular={colecao.capaCelular} />}
        <div className={cx("mt-5 border-b border-camp-tinta/15 pb-5 md:mt-6",
          silencio ? "grid justify-items-center gap-3 pt-6 text-center" : "flex flex-wrap items-end justify-between gap-x-8 gap-y-2")}>
          <NomeCampanha colecao={colecao} u={u} />
          <div className={cx("grid gap-1", !silencio && "md:justify-items-end md:text-right")}>
            <p className={cx(MICRO, "text-camp-azul")}>{linhaColecao}</p>
            {u.detalhe?.tipo === "ondas" && <p className={cx(MICRO, "tracking-[0.3em] text-camp-terracota")}>{u.detalhe.coordenadas}</p>}
          </div>
        </div>
      </section>

      <section className={cx("px-3.5 py-12 md:px-5 md:py-18",
        silencio ? "grid justify-items-center gap-6 text-center md:py-24" : "grid items-end gap-8 md:grid-cols-[1.25fr_0.75fr] md:gap-14")}>
        <div className={cx("grid gap-4", silencio && "justify-items-center")}>
          <p className={cx(MICRO, "text-camp-terracota")}>{[colecao.edicao, qtdEstampas].filter(Boolean).join(" · ")}</p>
          <h1 className="m-0 font-editorial text-[clamp(56px,9vw,136px)] font-semibold leading-[0.86] tracking-[-0.045em] text-camp-azul">{colecao.nome}.</h1>
        </div>
        <div className={cx("grid gap-6", silencio ? "justify-items-center" : "justify-items-start")}>
          {colecao.descricao && <p className="m-0 max-w-[26ch] font-editorial text-[clamp(21px,2.1vw,27px)] italic leading-snug text-camp-tinta">{colecao.descricao}</p>}
          {botao}
        </div>
      </section>

      {colecao.chamada && (
        <section className={cx("relative overflow-hidden bg-camp-azul px-3.5 py-12 text-camp-base md:px-5 md:py-18", silencio && "text-center md:py-24")}>
          {u.detalhe?.tipo === "ondas" && <Ondas />}
          <p className={cx(MICRO, "text-camp-limao")}>The Club Edit</p>
          <span aria-hidden="true" className={cx("my-5 block h-1 w-12 rounded-full bg-camp-limao", silencio && "mx-auto")} />
          <p className={cx("m-0 font-editorial text-[clamp(30px,4.4vw,58px)] font-medium leading-[1.02] tracking-[-0.03em]", silencio ? "mx-auto max-w-[20ch]" : "max-w-[22ch]")}>{colecao.chamada}</p>
        </section>
      )}

      {u.detalhe?.tipo === "revista" && (
        <section aria-label={u.detalhe.titulo} className="mx-3.5 mt-10 grid gap-2 border-y-2 border-camp-tinta py-4 md:mx-5 md:grid-cols-[auto_1fr] md:items-baseline md:gap-8">
          <p className="m-0 font-editorial text-xl font-semibold uppercase tracking-[0.04em] text-camp-azul md:text-2xl">{u.detalhe.titulo}</p>
          <p className={cx(MICRO, "text-camp-tinta md:text-right")}>{u.detalhe.itens}</p>
        </section>
      )}
    </>
  );
}

/** Linhas onduladas discretas de carta náutica (Riviera), atrás do manifesto. */
function Ondas() {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 60" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-6 h-16 w-full text-camp-limao/35">
      {[10, 28, 46].map((y) => (
        <path key={y} d={`M0 ${y} q 25 -10 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0`} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Botão "Ver as N estampas" na cor estrutural da campanha, sem o adesivo do Club. */
export function BotaoCampanha({ produtos, href = "#pecas" }: { produtos: number; href?: string }) {
  if (produtos === 0) return null;
  return (
    <Link href={href} className="inline-flex min-h-13 items-center gap-2.5 rounded-pilula bg-camp-azul px-7 text-[13px] font-semibold uppercase tracking-[0.16em] text-camp-base">
      Ver {produtos === 1 ? "a estampa" : `as ${produtos} estampas`}
      <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.8} />
    </Link>
  );
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
