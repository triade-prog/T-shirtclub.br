import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { formatarReais } from "@tshirtclub/domain";
import { ProgressoClub, Selo, Sobretitulo, cx } from "@tshirtclub/ui";
import { buscarCatalogo, buscarOfertaClub, urlFoto, type CartaoProduto, type Colecao } from "@/lib/catalogo";
import { filtrarProdutos, lerFiltro, textoOferta, type Filtro } from "@/lib/vitrine";
import { CardProduto } from "../../_vitrine/CardProduto";

// Página de coleção (F2.6; V4 em docs/design/v4/colecao.html). A coleção vem de
// /v1/catalog/collections e as peças de /v1/catalog/products?collection=; o filtro é um link
// (funciona sem JavaScript) aplicado sobre a lista inteira.

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
  const preco = produtos[0] ? formatarReais(produtos[0].precoCentavos) : null;

  return (
    <div className={`col-${colecao.cor.toLowerCase()}`}>
      <section className="relative overflow-hidden border-b-3 border-tinta bg-colecao-fundo px-3.5 pt-10 md:px-5 md:pt-11">
        <div className="grid items-end gap-8 md:grid-cols-[0.8fr_1.2fr] md:gap-10">
          <div className="grid justify-items-start gap-5 pb-4 md:pb-13">
            <Selo>Coleção · {colecao.nome}</Selo>
            <h1 className="m-0 font-editorial text-[clamp(64px,10vw,150px)] font-bold italic leading-[0.8] tracking-[-0.06em] text-rosa-press [text-shadow:5px_5px_0_var(--tc-rosa-bruma)]">
              {colecao.nome}.
            </h1>
            {colecao.descricao && (
              <p className="m-0 max-w-[24ch] font-editorial text-[22px] italic leading-tight text-tinta-suave">{colecao.descricao}</p>
            )}
            {produtos.length > 0 && (
              <Link href="#pecas" className="inline-flex min-h-13 items-center rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
                Ver {produtos.length === 1 ? "a estampa" : `as ${produtos.length} estampas`}
              </Link>
            )}
          </div>
          {colecao.capa && (
            <div className="relative h-[430px] overflow-hidden rounded-t-[26px] border-3 border-b-0 border-tinta shadow-[-8px_0_0_var(--tc-rosa)] md:h-[560px]">
              <Image src={urlFoto(colecao.capa.caminho)} alt={colecao.capa.alt ?? ""} fill priority sizes="(min-width: 768px) 60vw, 100vw" className="object-cover" />
            </div>
          )}
        </div>
      </section>

      <section id="pecas" className="scroll-mt-32 px-3.5 py-12 md:px-5 md:py-20">
        <div className="mb-7 grid items-end gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <Sobretitulo>{colecao.nome} · {produtos.length} {produtos.length === 1 ? "estampa" : "estampas"}</Sobretitulo>
            <h2 className="tc-titulo m-0 mt-2 text-[clamp(38px,5.2vw,68px)]">Escolha <em className="tc-marca">as suas.</em></h2>
          </div>
          {preco && club && (
            <p className="m-0 max-w-[36ch] text-sm text-tinta-suave">
              Uma por {preco}. {club.qtd} por {formatarReais(club.precoCentavos)}, misturando com qualquer coleção.
            </p>
          )}
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

        {club && (
          <div className="mb-10 grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
            <ProgressoClub pecas={0} titulo={`Escolha ${club.qtd} peças.`} texto="Desta coleção ou misturando com outro drop: o preço do Club entra sozinho." />
            <div className="grid content-center gap-2 rounded-cartao border-2 border-tinta bg-rosa p-6 text-no-rosa shadow-adesivo-lg">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em]">Condição do Club</span>
              <p className="m-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.045em]">{oferta}</p>
              <p className="m-0 text-xs leading-relaxed">Sem cupom. O preço entra automaticamente a cada {club.qtd} peças.</p>
            </div>
          </div>
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
    </div>
  );
}
