import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { cx } from "./classes.ts";
import { SetaDireita } from "./SlideCapa.tsx";

// Topo da coleção como capítulo de campanha (28/09, D35 e D36): a foto, a campanha, a coleção com
// o botão, o manifesto e o detalhe de cada universo (0430). Fica aqui, e não na loja, para a prévia
// do painel desenhar o mesmo topo; a foto (next/image na loja, miniatura no painel) chega pronta.

type PropsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export const MICRO_CAMPANHA = "m-0 text-[11px] font-semibold uppercase tracking-[0.24em]";

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
  // Riviera: marcações de carta náutica, discretas (Portofino), em vez de peixinhos espalhados
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

/** Nome da campanha: Baloo em caixa alta; na Fé, serifa silenciosa; em Dog Stories, quebra na vírgula. */
export function NomeCampanha({ colecao, u, className, Tag = "p" }: { colecao: ColecaoCampanha; u: Universo; className?: string; Tag?: "p" | "span" }) {
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
export function TopoCampanha({ colecao, qtdEstampas, botao, foto }: { colecao: ColecaoCampanha; qtdEstampas: string; botao: ReactNode; foto?: ReactNode }) {
  const u = universoDaPaleta(colecao.paleta);
  const silencio = u.ritmo === "silencio";
  const linhaColecao = [colecao.nome, colecao.temporada].filter(Boolean).join(" · ");
  return (
    <>
      <section className="px-3.5 pt-5 md:px-5 md:pt-7">
        {foto}
        <div className={cx("mt-5 border-b border-camp-tinta/15 pb-5 md:mt-6",
          silencio ? "grid justify-items-center gap-3 pt-6 text-center" : "flex flex-wrap items-end justify-between gap-x-8 gap-y-2")}>
          <NomeCampanha colecao={colecao} u={u} />
          <div className={cx("grid gap-1", !silencio && "md:justify-items-end md:text-right")}>
            <p className={cx(MICRO_CAMPANHA, "text-camp-azul")}>{linhaColecao}</p>
            {u.detalhe?.tipo === "ondas" && <p className={cx(MICRO_CAMPANHA, "tracking-[0.3em] text-camp-terracota")}>{u.detalhe.coordenadas}</p>}
          </div>
        </div>
      </section>

      <section className={cx("px-3.5 py-12 md:px-5 md:py-18",
        silencio ? "grid justify-items-center gap-6 text-center md:py-24" : "grid items-end gap-8 md:grid-cols-[1.25fr_0.75fr] md:gap-14")}>
        <div className={cx("grid gap-4", silencio && "justify-items-center")}>
          <p className={cx(MICRO_CAMPANHA, "text-camp-terracota")}>{[colecao.edicao, qtdEstampas].filter(Boolean).join(" · ")}</p>
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
          <p className={cx(MICRO_CAMPANHA, "text-camp-limao")}>The Club Edit</p>
          <span aria-hidden="true" className={cx("my-5 block h-1 w-12 rounded-full bg-camp-limao", silencio && "mx-auto")} />
          <p className={cx("m-0 font-editorial text-[clamp(30px,4.4vw,58px)] font-medium leading-[1.02] tracking-[-0.03em]", silencio ? "mx-auto max-w-[20ch]" : "max-w-[22ch]")}>{colecao.chamada}</p>
        </section>
      )}

      {u.detalhe?.tipo === "revista" && (
        <section aria-label={u.detalhe.titulo} className="mx-3.5 mt-10 grid gap-2 border-y-2 border-camp-tinta py-4 md:mx-5 md:grid-cols-[auto_1fr] md:items-baseline md:gap-8">
          <p className="m-0 font-editorial text-xl font-semibold uppercase tracking-[0.04em] text-camp-azul md:text-2xl">{u.detalhe.titulo}</p>
          <p className={cx(MICRO_CAMPANHA, "text-camp-tinta md:text-right")}>{u.detalhe.itens}</p>
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
export function BotaoCampanha({ produtos, href = "#pecas", Link = "a" }: { produtos: number; href?: string; Link?: ComponentType<PropsLink> | "a" }) {
  if (produtos === 0) return null;
  return (
    <Link href={href} className="inline-flex min-h-13 items-center gap-2.5 rounded-pilula bg-camp-azul px-7 text-[13px] font-semibold uppercase tracking-[0.16em] text-camp-base">
      Ver {produtos === 1 ? "a estampa" : `as ${produtos} estampas`}
      <SetaDireita className="size-4" />
    </Link>
  );
}
