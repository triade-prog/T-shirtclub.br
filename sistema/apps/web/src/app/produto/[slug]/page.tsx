import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { formatarReais } from "@tshirtclub/domain";
import { Botao, ProgressoClub, Selo, Sobretitulo } from "@tshirtclub/ui";
import { buscarCatalogo, buscarOfertaClub, urlFoto, type ProdutoDetalhe } from "@/lib/catalogo";
import { dividirNome, textoOferta } from "@/lib/vitrine";
import { Galeria } from "./Galeria";

// Página do produto (F2.7; V4 em docs/design/v4/produto.html): galeria de 1 a 10 fotos,
// preço com a oferta do Club, detalhes da peça e os looks em que ela aparece.

function buscarProduto(slug: string) {
  return /^[a-z0-9-]{1,80}$/.test(slug) ? buscarCatalogo<ProdutoDetalhe>(`v1/catalog/products/${slug}`) : Promise.resolve(null);
}

export async function generateMetadata({ params }: PageProps<"/produto/[slug]">): Promise<Metadata> {
  const produto = await buscarProduto((await params).slug);
  if (!produto) return {};
  const capa = produto.fotos[0];
  return {
    title: produto.nome,
    description: produto.descricao ?? undefined,
    openGraph: capa ? { images: [{ url: urlFoto(capa.caminho), alt: capa.alt ?? produto.nome }] } : undefined,
  };
}

const SELO: Record<ProdutoDetalhe["selo"], string | null> = { DISPONIVEL: null, ULTIMAS_UNIDADES: "Últimas peças", ESGOTADO: "Esgotado" };

export default async function PaginaProduto({ params }: PageProps<"/produto/[slug]">) {
  await connection();
  const [produto, club] = await Promise.all([buscarProduto((await params).slug), buscarOfertaClub()]);
  if (!produto) notFound();

  const { destaque, resto } = dividirNome(produto.nome, produto.colecao?.nome);
  const selo = SELO[produto.selo];
  const esgotado = produto.selo === "ESGOTADO";
  const promo = produto.precoPromocionalCentavos;
  const oferta = produto.noClub ? textoOferta(club) : undefined;
  const detalhes = [
    { titulo: "Material e caimento", texto: [produto.composicao, produto.modelagem].filter(Boolean).join(" ") || null },
    { titulo: "Medidas", texto: produto.medidas, id: "medidas" },
    { titulo: "Cuidados", texto: produto.cuidados },
    { titulo: "Entrega e retirada", texto: "Retire na loja ou escolha a entrega. A reserva é confirmada pelo WhatsApp." },
  ].filter((d) => d.texto);

  return (
    <>
      <section className="grid items-start gap-8 px-3.5 pb-16 pt-4 md:grid-cols-[1.08fr_0.92fr] md:gap-14 md:px-5 md:pb-20 md:pt-9">
        {produto.fotos.length > 0 ? (
          <Galeria
            fotos={produto.fotos.map((f) => ({ url: urlFoto(f.caminho), alt: f.alt ?? produto.nome }))}
            nome={produto.nome}
            selo={selo && <Selo fundo="citrino" className="absolute left-3 top-3">{selo}</Selo>}
          />
        ) : (
          <div className="aspect-4/5 rounded-foto border-3 border-tinta bg-limao-bruma" />
        )}

        <div className="grid gap-5 rounded-[20px] border-2 border-tinta bg-papel p-5 shadow-[5px_5px_0_var(--tc-citrino)] md:sticky md:top-36 md:p-7">
          {produto.colecao && (
            <nav aria-label="Você está em" className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-tinta-suave">
              <Link href={`/colecao/${produto.colecao.slug}`} className="underline decoration-rosa decoration-2 underline-offset-2">{produto.colecao.nome}</Link>
              {" / T-shirts"}
            </nav>
          )}
          <h1 className="m-0 font-editorial text-[clamp(44px,5vw,74px)] font-bold leading-[0.87] tracking-[-0.06em]">
            {destaque && <><em className="text-rosa-press">{destaque}</em><br /></>}
            {resto}
          </h1>
          {produto.descricao && <p className="m-0 font-editorial text-xl italic leading-tight text-tinta-suave">{produto.descricao}</p>}

          <p className="m-0 flex flex-wrap items-baseline gap-2.5 border-y border-linha py-4">
            {promo !== null && <s className="text-sm text-tinta-suave"><span className="sr-only">De </span>{formatarReais(produto.precoCentavos)}</s>}
            <strong className="rounded-[6px] bg-rosa-bruma px-2 py-1 font-display text-[22px] font-extrabold">
              {promo !== null && <span className="sr-only">por </span>}{formatarReais(promo ?? produto.precoCentavos)}
            </strong>
            {oferta && <span className="text-xs font-extrabold text-verde-escuro">ou {oferta}</span>}
          </p>

          {oferta && club && (
            <ProgressoClub pecas={0} titulo={`A cada ${club.qtd}, o Club.`} texto={`Misture esta peça com qualquer coleção: ${oferta}, sem cupom.`} />
          )}

          <div className="grid gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.1em]">Tamanho</span>
              {produto.medidas && <a href="#medidas" className="text-xs font-bold underline decoration-rosa decoration-2 underline-offset-2">Tabela de medidas</a>}
            </div>
            <p className="m-0 rounded-campo border-[1.5px] border-tinta px-3.5 py-3.5 text-sm font-bold shadow-adesivo-sm">Tamanho único</p>
          </div>

          {/* A sacola (fatia 3) recebe a peça por aqui; sem JavaScript também funciona. */}
          <form action="/sacola" method="get">
            <input type="hidden" name="adicionar" value={produto.slug} />
            <Botao type="submit" cheio disabled={esgotado}>{esgotado ? "Esgotado" : "Adicionar ao Club"}</Botao>
          </form>

          {detalhes.length > 0 && (
            <div className="border-b border-linha">
              {detalhes.map((d, i) => (
                <details key={d.titulo} id={d.id} open={i === 0} className="group border-t border-linha py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.1em] [&::-webkit-details-marker]:hidden">
                    {d.titulo}
                    <span aria-hidden="true" className="text-lg font-normal group-open:hidden">+</span>
                    <span aria-hidden="true" className="hidden text-lg font-normal group-open:inline">−</span>
                  </summary>
                  <p className="m-0 mt-3 whitespace-pre-line text-sm leading-relaxed text-tinta-suave">{d.texto}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>

      {produto.looks.length > 0 && (
        <section className="border-y-4 border-tinta bg-verde px-3.5 py-14 text-no-verde md:px-5 md:py-18">
          <Sobretitulo className="text-no-verde!">Uma T-shirt, vários contextos</Sobretitulo>
          <h2 className="tc-titulo m-0 mb-7 mt-2 text-[clamp(38px,5.2vw,68px)] text-citrino">Você faz o <em className="text-citrino">look.</em></h2>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 md:grid-cols-3">
            {produto.looks.slice(0, 3).map((l, i) => (
              <li key={l.id} className="relative min-h-[420px] overflow-hidden rounded-foto border-2 border-tinta sm:first:col-span-2 md:first:col-span-1 md:min-h-[470px]">
                <Image src={urlFoto(l.foto.caminho)} alt={l.foto.alt ?? l.titulo} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                <span className="absolute bottom-3 left-3 rounded-[7px] border-[1.5px] border-tinta bg-rosa px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-no-rosa shadow-adesivo-sm">
                  Look {String(i + 1).padStart(2, "0")} · {l.titulo}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
