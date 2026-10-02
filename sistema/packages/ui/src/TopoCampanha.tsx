import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { cx } from "./classes.ts";
import { Sobretitulo } from "./Selo.tsx";
import { PartesDaLinha, SetaDireita } from "./SlideCapa.tsx";

// Topo da coleção como capítulo de campanha (28/09, D35 e D36): a foto, a campanha, a coleção com
// o botão, o manifesto e o detalhe de cada universo (0430). Fica aqui, e não na loja, para a prévia
// do painel desenhar o mesmo topo; a foto (next/image na loja, miniatura no painel) chega pronta.
// Desde 29/09 (D38) a campanha veste a identidade da marca, como a home: as cores fortes de cada
// paleta brigavam com as fotos, então a cor fica só na foto e o universo dá o ritmo e o detalhe.

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

const MICRO = "m-0 text-[11px] font-semibold uppercase tracking-[0.24em]";

export type PaletaCampanha = "CLUB" | "ESTATE_ITALIANA" | "RIVIERA" | "GIRLHOOD" | "DOG_STORIES" | "FE";

export interface Universo {
  classe: string;
  /** editorial: o molde; silencio: centrado, com mais ar e nada divertido (Fé); humor: mais solto (Dog Stories). */
  ritmo: "editorial" | "silencio" | "humor";
  /** Detalhe gráfico próprio do universo. */
  detalhe?: { tipo: "ondas"; coordenadas: string } | { tipo: "revista"; titulo: string; itens: string };
}

const UNIVERSOS: Record<PaletaCampanha, Universo> = {
  CLUB: { classe: "paleta-club", ritmo: "editorial" },
  ESTATE_ITALIANA: { classe: "paleta-estate-italiana", ritmo: "editorial" },
  // Riviera: as coordenadas de carta náutica (Portofino) na linha embaixo do nome da campanha
  RIVIERA: { classe: "paleta-riviera", ritmo: "editorial", detalhe: { tipo: "ondas", coordenadas: "44°18′N · 9°12′E" } },
  // Girlhood: a faixa de revista, sem deixar a página infantil
  GIRLHOOD: { classe: "paleta-girlhood", ritmo: "editorial", detalhe: { tipo: "revista", titulo: "Today's very important things", itens: "coffee · cherries · lipstick · friends · nothing urgent" } },
  DOG_STORIES: { classe: "paleta-dog-stories", ritmo: "humor" },
  FE: { classe: "paleta-fe", ritmo: "silencio" },
};

export function universoDaPaleta(paleta: PaletaCampanha | null | undefined): Universo {
  return UNIVERSOS[paleta ?? "CLUB"] ?? UNIVERSOS.CLUB;
}

/** O que o topo usa da coleção. */
export interface ColecaoCampanha {
  nome: string;
  descricao?: string | null;
  chamada?: string | null;
  campanha?: string | null;
  temporada?: string | null;
  edicao?: string | null;
  paleta?: PaletaCampanha | null;
}

/**
 * Nome da campanha: a serifa itálica do "Seu Club." da home (29/09, D38), em caixa normal; em Dog
 * Stories, quebra na vírgula. A cor vem de fora: clara sobre a foto, tinta fora dela. A folga
 * embaixo (0,14em) é das pernas do g e do z, que com a entrelinha 0,9 tampavam a linha de baixo.
 */
export function NomeCampanha({ colecao, u, className, Tag = "p", id }: { colecao: ColecaoCampanha; u: Universo; className?: string; Tag?: "p" | "span" | "h2"; id?: string }) {
  const nome = colecao.campanha ?? "";
  const partes = u.ritmo === "humor" ? nome.split(/(?<=,)\s+/) : [nome];
  return (
    <Tag id={id} className={cx("m-0 block pb-[0.14em] font-editorial text-[clamp(46px,6.6vw,96px)] font-[680] italic leading-[0.9] tracking-[-0.045em] [font-optical-sizing:auto]", className)}>
      {partes.map((p, i) => <span key={i} className="block">{p}</span>)}
    </Tag>
  );
}

/**
 * Foto da campanha com o nome por cima, como o slide da capa (29/09, D38): degradê escuro embaixo
 * e o texto claro. Sem foto, o nome fica em tinta, sobre o papel.
 */
export function FotoComNome({ colecao, u, foto, linha, Tag = "p", id }: {
  colecao: ColecaoCampanha; u: Universo; foto?: ReactNode; linha?: string; Tag?: "p" | "span" | "h2"; id?: string;
}) {
  if (!foto) {
    return (
      <div className="grid gap-2 border-b border-tinta/15 pb-5">
        <NomeCampanha colecao={colecao} u={u} Tag={Tag} id={id} className="text-tinta" />
        {linha && <p className={cx(MICRO, "text-tinta")}><PartesDaLinha linha={linha} /></p>}
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-[24px]">
      {foto}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid gap-2 bg-linear-to-t from-tinta/75 via-tinta/30 to-transparent px-4.5 pb-5 pt-28 text-[#fbf5ea] md:px-8 md:pb-7.5 md:pt-36">
        <NomeCampanha colecao={colecao} u={u} Tag={Tag} id={id} />
        {linha && <p className={MICRO}><PartesDaLinha linha={linha} /></p>}
      </div>
    </div>
  );
}

/**
 * Topo da coleção de campanha na identidade da marca (29/09, D38): a foto com o nome da campanha,
 * a coleção como os títulos da home (sobretítulo citrino, Fraunces em tinta, botão preto) e o
 * manifesto em itálico, sem bloco de cor, para a foto ser a única coisa colorida.
 */
export function TopoCampanha({ colecao, qtdEstampas, botao, foto }: { colecao: ColecaoCampanha; qtdEstampas: string; botao: ReactNode; foto?: ReactNode }) {
  const u = universoDaPaleta(colecao.paleta);
  const silencio = u.ritmo === "silencio";
  const linha = [colecao.nome, colecao.temporada, u.detalhe?.tipo === "ondas" ? u.detalhe.coordenadas : null].filter(Boolean).join(" · ");
  return (
    <>
      <section className="px-3.5 pt-5 md:px-5 md:pt-7">
        <FotoComNome colecao={colecao} u={u} foto={foto} linha={linha} />
      </section>

      <section className={cx("px-3.5 py-12 md:px-5 md:py-18",
        silencio ? "grid justify-items-center gap-6 text-center md:py-24" : "grid items-end gap-8 md:grid-cols-[1.25fr_0.75fr] md:gap-14")}>
        <div className={cx("grid gap-4", silencio && "justify-items-center")}>
          <Sobretitulo>{[colecao.edicao, qtdEstampas].filter(Boolean).join(" · ")}</Sobretitulo>
          <h1 className="tc-titulo m-0 text-[clamp(56px,9vw,136px)] text-tinta">{colecao.nome}.</h1>
        </div>
        <div className={cx("grid gap-6", silencio ? "justify-items-center" : "justify-items-start")}>
          {colecao.descricao && <p className="m-0 max-w-[26ch] font-editorial text-[clamp(21px,2.1vw,27px)] italic leading-snug text-tinta">{colecao.descricao}</p>}
          {botao}
        </div>
      </section>

      {colecao.chamada && (
        <section className="grid justify-items-center gap-5 border-y border-tinta/15 px-3.5 py-14 text-center md:px-5 md:py-22">
          <Sobretitulo>The Club Edit</Sobretitulo>
          <p className="m-0 max-w-[24ch] font-editorial text-[clamp(30px,4.4vw,58px)] font-medium italic leading-[1.02] tracking-[-0.03em] text-tinta">{colecao.chamada}</p>
        </section>
      )}

      {u.detalhe?.tipo === "revista" && (
        <section aria-label={u.detalhe.titulo} className="mx-3.5 mt-10 grid gap-2 border-y-2 border-tinta py-4 md:mx-5 md:grid-cols-[auto_1fr] md:items-baseline md:gap-8">
          <p className="m-0 font-editorial text-xl font-semibold uppercase tracking-[0.04em] text-tinta md:text-2xl">{u.detalhe.titulo}</p>
          <p className={cx(MICRO, "text-tinta md:text-right")}>{u.detalhe.itens}</p>
        </section>
      )}
    </>
  );
}

/** Botão "Ver as N estampas" como os botões da home: pílula em tinta com a sombra de adesivo. */
export function BotaoCampanha({ produtos, href = "#pecas", Link = "a" }: { produtos: number; href?: string; Link?: ComponentType<PropsLink> | "a" }) {
  if (produtos === 0) return null;
  return (
    <Link href={href} className="inline-flex min-h-13 items-center gap-2.5 rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
      Ver {produtos === 1 ? "a estampa" : `as ${produtos} estampas`}
      <SetaDireita className="size-4" />
    </Link>
  );
}
