import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { formatarReais } from "@tshirtclub/domain";
import { Selo, Sobretitulo, cx } from "@tshirtclub/ui";
import { buscarCatalogo, buscarOfertaClub, urlFoto, type CartaoProduto, type Colecao } from "@/lib/catalogo";
import { COOKIE_SACOLA } from "@/lib/sacola";
import { filtrarProdutos, lerFiltro, textoOferta, tituloEmDuasLinhas, type Filtro } from "@/lib/vitrine";
import { FaixaTrio } from "../../_sacola/FaixaTrio";
import { CardProduto } from "../../_vitrine/CardProduto";
import { MosaicoPecas } from "../../_vitrine/MosaicoPecas";

// Página de coleção (F2.6; V4 em docs/design/v4/colecao.html). A coleção vem de
// /v1/catalog/collections e as peças de /v1/catalog/products?collection=; o filtro é um link
// (funciona sem JavaScript) aplicado sobre a lista inteira. Pedido da loja (28/09): capa em
// 45% texto e 55% imagem (sem foto de campanha, as peças reais; sem nenhuma, só o texto), faixa
// verde com a chamada da coleção e as peças logo depois do título, com o Club numa faixa compacta.

async function buscarColecao(slug: string): Promise<Colecao | undefined> {
  const colecoes = await buscarCatalogo<Colecao[]>("v1/catalog/collections");
  return colecoes?.find((c) => c.slug === slug);
}

export async function generateMetadata({ params }: PageProps<"/colecao/[slug]">): Promise<Metadata> {
  const colecao = await buscarColecao((await params).slug);
  return colecao ? { title: colecao.nome, description: colecao.descricao ?? undefined } : {};
}

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "disponiveis", rotulo: "Disponíveis" },
  { valor: "ultimas", rotulo: "Últimas peças" },
];

export default async function PaginaColecao({ params, searchParams }: PageProps<"/colecao/[slug]">) {
  await connection();
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const [colecao, produtos, club] = await Promise.all([
    buscarColecao(slug),
    buscarCatalogo<CartaoProduto[]>(`v1/catalog/products?collection=${slug}`),
    buscarOfertaClub(),
  ]);
  if (!colecao || !produtos) notFound();

  const filtro = lerFiltro((await searchParams).filtro);
  const visiveis = filtrarProdutos(produtos, filtro);
  const oferta = textoOferta(club);
  // A nota do fim usa a foto da última peça da coleção (na V4, uma foto editorial da coleção).
  const fotoFim = [...produtos].reverse().find((p) => p.capa)?.capa ?? null;
  const linhas = tituloEmDuasLinhas(colecao.nome);
  const mosaico = colecao.capa ? [] : (colecao.fotos ?? []);
  const temImagem = Boolean(colecao.capa) || mosaico.length > 0;
  const qtdEstampas = produtos.length === 1 ? "1 estampa" : `${produtos.length} estampas`;

  return (
    <div className={`col-${colecao.cor.toLowerCase()}`}>
      <section className="overflow-x-clip border-b-3 border-tinta bg-colecao-fundo px-3.5 py-10 md:px-5 md:py-14">
        <div className={cx("mx-auto grid max-w-7xl items-center gap-9 md:gap-12", temImagem && "md:grid-cols-[45fr_55fr]")}>
          <div className="grid justify-items-start gap-5">
            <Selo>Coleção · {qtdEstampas}</Selo>
            <h1 className="m-0 font-editorial text-[clamp(56px,9vw,124px)] font-bold italic leading-[0.86] tracking-[-0.055em] text-rosa-press [text-shadow:5px_5px_0_var(--tc-rosa-bruma)]">
              {linhas.map((l) => <span key={l} className="block whitespace-nowrap">{l}</span>)}
            </h1>
            {colecao.descricao && (
              <p className="m-0 max-w-[30ch] font-editorial text-[22px] italic leading-tight text-tinta-suave">{colecao.descricao}</p>
            )}
            {produtos.length > 0 && (
              <Link href="#pecas" className="inline-flex min-h-13 items-center gap-2 rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
                Ver {produtos.length === 1 ? "a estampa" : `as ${produtos.length} estampas`}
                <ArrowRight aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </Link>
            )}
          </div>
          {colecao.capa ? (
            <div className="relative h-[360px] overflow-hidden rounded-[26px] border-3 border-tinta shadow-[8px_8px_0_var(--tc-rosa)] md:h-[540px]">
              <Image src={urlFoto(colecao.capa.caminho)} alt={colecao.capa.alt ?? ""} fill priority sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
            </div>
          ) : (
            <MosaicoPecas fotos={mosaico} selo={oferta} prioridade tamanhos="(min-width: 768px) 30vw, 55vw" className="h-[360px] md:h-[540px]" />
          )}
        </div>
      </section>

      {colecao.chamada && (
        <section className="border-b-3 border-tinta bg-verde-escuro px-3.5 py-8 text-no-verde md:px-5 md:py-10">
          <div className="mx-auto grid max-w-7xl items-center gap-2 md:grid-cols-[auto_1fr] md:gap-8">
            <span className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-citrino">The Club edit</span>
            <p className="m-0 font-editorial text-[clamp(24px,3vw,38px)] font-bold italic leading-tight tracking-[-0.02em]">{colecao.chamada}</p>
          </div>
        </section>
      )}

      <section id="pecas" className="scroll-mt-32 px-3.5 py-12 md:px-5 md:py-20">
        <div className="mb-6">
          <Sobretitulo>{colecao.nome} · {qtdEstampas}</Sobretitulo>
          <h2 className="tc-titulo m-0 mt-2 text-[clamp(38px,5.2vw,68px)]">Escolha <em className="tc-marca">as suas.</em></h2>
        </div>

        {produtos.length > 0 && (
          <nav aria-label="Filtrar peças" className="mb-6 flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Link
                key={f.valor}
                href={f.valor === "todas" ? `/colecao/${slug}#pecas` : `/colecao/${slug}?filtro=${f.valor}#pecas`}
                scroll={false}
                aria-current={filtro === f.valor ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-11 items-center rounded-pilula border-[1.5px] border-tinta px-4 text-[11px] font-extrabold uppercase tracking-[0.08em]",
                  filtro === f.valor ? "bg-rosa text-no-rosa shadow-adesivo-sm" : "bg-papel",
                )}
              >
                {f.rotulo}{f.valor === "todas" && ` · ${produtos.length}`}
              </Link>
            ))}
          </nav>
        )}

        {club && oferta && (
          <FaixaTrio qtd={club.qtd} preco={formatarReais(club.precoCentavos)} oferta={oferta} inicial={(await cookies()).get(COOKIE_SACOLA)?.value} />
        )}

        {visiveis.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4">
            {visiveis.map((p) => <CardProduto key={p.id} produto={p} oferta={oferta} />)}
          </div>
        ) : (
          <p className="m-0 rounded-cartao border-2 border-dashed border-borda-campo px-5 py-10 text-center text-tinta-suave">
            {produtos.length === 0 ? "As peças desta coleção chegam em breve." : "Nenhuma peça neste filtro agora."}
          </p>
        )}
      </section>

      {fotoFim && (
        <section className="grid items-center gap-7.5 border-t-3 border-tinta bg-rosa-bruma px-3.5 py-15.5 md:grid-cols-2 md:px-5">
          <div>
            <Sobretitulo>Editorial note</Sobretitulo>
            <h2 className="m-0 mb-4.5 mt-2.5 font-editorial text-[clamp(48px,6vw,90px)] font-bold leading-[0.84] tracking-[-0.05em] text-verde-escuro">
              Do drop<br />para o seu <em className="text-rosa-press">look.</em>
            </h2>
            <p className="m-0 max-w-[40ch] text-[13px] leading-relaxed text-tinta-suave">
              {colecao.nome} é campanha, não uniforme. Use com jeans, alfaiataria, saia ou como quiser: a coleção muda de contexto junto com você.
            </p>
          </div>
          <div className="relative min-h-[430px] overflow-hidden rounded-[22px] border-2 border-tinta">
            <Image src={urlFoto(fotoFim.caminho)} alt={fotoFim.alt ?? ""} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
        </section>
      )}
    </div>
  );
}
