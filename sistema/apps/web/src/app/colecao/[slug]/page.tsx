import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { formatarReais } from "@tshirtclub/domain";
import { BotaoPecas, FaixaChamada, Sobretitulo, TopoColecaoBanner, TopoColecaoSimples, cx } from "@tshirtclub/ui";
import { buscarCatalogo, buscarOfertaClub, urlFoto, type CartaoProduto, type Colecao } from "@/lib/catalogo";
import { COOKIE_SACOLA } from "@/lib/sacola";
import { VITRINE_DA_LOJA, colecoesDaVitrine, filtrarProdutos, lerColecao, lerFiltro, textoOferta, type Filtro } from "@/lib/vitrine";
import { FaixaTrio } from "../../_sacola/FaixaTrio";
import { CardProduto } from "../../_vitrine/CardProduto";
import { MosaicoPecas } from "../../_vitrine/MosaicoPecas";
import { BotaoCampanha, BuildYourClub, CapitulosCampanha, ProximaHistoria, TopoCampanha, campanhaLigada, universo } from "./Campanha";
import { compartilhar } from "@/lib/compartilhar";

// Página de coleção (F2.6; V4 em docs/design/v4/colecao.html). A coleção vem de
// /v1/catalog/collections e as peças de /v1/catalog/products?collection=; o filtro é um link
// (funciona sem JavaScript) aplicado sobre a lista inteira. Pedido da loja (28/09): com banner
// de campanha, ele inteiro no topo e o nome embaixo; sem, 45% texto e 55% as peças reais (sem
// nenhuma, só o texto); faixa verde com a chamada da coleção e as peças logo depois do título,
// com o Club numa faixa compacta. Com o nome da campanha (0420, D35 e D36), a página vira capítulo
// de campanha: foto com o nome da campanha, coleção, The Club Edit e capítulos, na identidade da
// marca como a home (D38; antes, cada campanha tinha a paleta própria).
// A campanha só aparece ligada no painel (0430); depois dos capítulos vêm o Build Your Club, o
// resto da coleção (as estampas que não estão nos capítulos) e a próxima campanha ligada. A Club
// Editions (D39) mostra a loja inteira: todas as peças, com um filtro por coleção (?colecao=).

async function buscarColecao(slug: string): Promise<Colecao | undefined> {
  const colecoes = await buscarCatalogo<Colecao[]>("v1/catalog/collections");
  return colecoes?.find((c) => c.slug === slug);
}

/** A coleção que já usou este endereço (0410), para redirecionar os links antigos. */
async function colecaoDoEnderecoAntigo(slug: string): Promise<Colecao | undefined> {
  const colecoes = await buscarCatalogo<Colecao[]>("v1/catalog/collections");
  return colecoes?.find((c) => c.slugsAntigos?.includes(slug));
}

export async function generateMetadata({ params }: PageProps<"/colecao/[slug]">): Promise<Metadata> {
  const colecao = await buscarColecao((await params).slug);
  if (!colecao) return {};
  // O endereço canônico é sempre o atual: os antigos redirecionam (0410) e não concorrem na busca
  const titulo = campanhaLigada(colecao) ? `${colecao.nome} · ${colecao.campanha}` : colecao.nome;
  const foto = colecao.capa ?? colecao.fotos?.[0];
  return {
    title: titulo,
    description: colecao.descricao ?? undefined,
    alternates: { canonical: `/colecao/${colecao.slug}` },
    // A capa da coleção (ou a peça mais nova) na prévia do link; sem foto, a arte da loja
    openGraph: compartilhar({
      titulo, descricao: colecao.descricao ?? undefined, url: `/colecao/${colecao.slug}`,
      imagem: foto ? { url: urlFoto(foto.caminho), alt: foto.alt ?? colecao.nome } : undefined,
    }),
  };
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
  const lojaToda = slug === VITRINE_DA_LOJA;
  const [colecoes, produtos, club] = await Promise.all([
    buscarCatalogo<Colecao[]>("v1/catalog/collections"),
    buscarCatalogo<CartaoProduto[]>(lojaToda ? "v1/catalog/products" : `v1/catalog/products?collection=${slug}`),
    buscarOfertaClub(),
  ]);
  const colecao = colecoes?.find((c) => c.slug === slug);
  const busca = await searchParams;
  const filtro = lerFiltro(busca.filtro);
  if (!colecao) {
    // Endereço antigo (a coleção mudou de nome): 308 para o atual, mantendo o filtro
    const atual = await colecaoDoEnderecoAntigo(slug);
    if (atual) permanentRedirect(`/colecao/${atual.slug}${filtro === "todas" ? "" : `?filtro=${filtro}`}`);
  }
  if (!colecao || !produtos) notFound();

  const emCampanha = campanhaLigada(colecao);
  // Na campanha, a vitrine do fim é o resto da coleção: as estampas que não estão nos capítulos
  const nosCapitulos = new Set(emCampanha ? (colecao.capitulos ?? []).flatMap((k) => k.produtos) : []);
  const naoNosCapitulos = produtos.filter((p) => !nosCapitulos.has(p.id));
  // Loja inteira (Club Editions): as coleções com peças viram um filtro, que soma com o de disponibilidade
  const porColecao = lojaToda && !emCampanha ? colecoesDaVitrine(naoNosCapitulos, colecoes ?? []) : [];
  const colecaoEscolhida = lerColecao(busca.colecao, porColecao);
  const vitrine = colecaoEscolhida ? naoNosCapitulos.filter((p) => p.colecao?.slug === colecaoEscolhida) : naoNosCapitulos;
  const temCapitulos = emCampanha && (colecao.capitulos ?? []).length > 0;
  const visiveis = filtrarProdutos(vitrine, filtro);
  const endereco = (f: Filtro, c: string | undefined) => {
    const q = new URLSearchParams();
    if (c) q.set("colecao", c);
    if (f !== "todas") q.set("filtro", f);
    const texto = q.toString();
    return `/colecao/${slug}${texto ? `?${texto}` : ""}#pecas`;
  };
  const chip = (ativo: boolean) => cx(
    "inline-flex min-h-11 items-center rounded-pilula border-[1.5px] px-4 text-[11px] font-extrabold uppercase tracking-[0.08em]",
    ativo ? "border-tinta bg-rosa text-no-rosa shadow-adesivo-sm" : "border-tinta bg-papel",
  );
  const ligadas = (colecoes ?? []).filter(campanhaLigada);
  const posicao = ligadas.findIndex((c) => c.id === colecao.id);
  const proxima = emCampanha && ligadas.length > 1 ? ligadas[(posicao + 1) % ligadas.length] : undefined;
  const oferta = textoOferta(club);
  // A nota do fim usa a foto da última peça da coleção (na V4, uma foto editorial da coleção).
  const fotoFim = [...produtos].reverse().find((p) => p.capa)?.capa ?? null;
  const mosaico = colecao.capa ? [] : (colecao.fotos ?? []);
  const botaoPecas = <BotaoPecas produtos={produtos.length} Link={Link} />;
  const qtdEstampas = produtos.length === 1 ? "1 estampa" : `${produtos.length} estampas`;
  const progresso = club && oferta && (
    <FaixaTrio qtd={club.qtd} preco={formatarReais(club.precoCentavos)} oferta={oferta} inicial={(await cookies()).get(COOKIE_SACOLA)?.value} campanha={emCampanha} />
  );

  return (
    <div className={cx(`col-${colecao.cor.toLowerCase()}`, emCampanha && `${universo(colecao).classe} bg-camp-base text-camp-tinta`)}>
      {emCampanha ? (
        <>
          <TopoCampanha colecao={colecao} qtdEstampas={qtdEstampas} botao={<BotaoCampanha produtos={produtos.length} />} />
          <CapitulosCampanha colecao={colecao} produtos={produtos} oferta={oferta} id={temCapitulos ? "pecas" : undefined} />
          {club && <BuildYourClub colecao={colecao} qtdEstampas={qtdEstampas} club={club} progresso={progresso} />}
        </>
      ) : colecao.capa ? (
        // Com banner de campanha (28/09): o banner inteiro no topo, como no carrossel do início, e
        // o nome, a descrição e o botão numa faixa menor logo abaixo (o banner já tem o título dele)
        <TopoColecaoBanner nome={colecao.nome} qtdEstampas={qtdEstampas} descricao={colecao.descricao} botao={botaoPecas}
          foto={<Image src={urlFoto(colecao.capa.caminho)} alt={colecao.capa.alt ?? ""} fill priority sizes="(min-width: 1280px) 1240px, 100vw" className="object-cover" />} />
      ) : (
        <TopoColecaoSimples nome={colecao.nome} qtdEstampas={qtdEstampas} descricao={colecao.descricao} botao={botaoPecas}
          rotulo={lojaToda ? `Toda a loja · ${qtdEstampas}` : undefined}
          mosaico={!lojaToda && mosaico.length > 0 && <MosaicoPecas fotos={mosaico} selo={oferta} prioridade tamanhos="(min-width: 768px) 30vw, 55vw" className="h-[360px] md:h-[540px]" />} />
      )}

      {!emCampanha && colecao.chamada && <FaixaChamada chamada={colecao.chamada} />}

      {!(temCapitulos && vitrine.length === 0) && (
      <section id={temCapitulos ? undefined : "pecas"} className={cx("scroll-mt-32 px-3.5 py-12 md:px-5 md:py-20", emCampanha && "border-t border-tinta/15")}>
        {emCampanha ? (
          <div className="mb-6 grid gap-3">
            <Sobretitulo>
              Shop {colecao.nome} · {temCapitulos ? `mais ${vitrine.length === 1 ? "1 estampa" : `${vitrine.length} estampas`}` : qtdEstampas}
            </Sobretitulo>
            <h2 className="tc-titulo m-0 text-[clamp(40px,5.4vw,72px)]">
              {temCapitulos ? <>O resto <em>da coleção.</em></> : <>Escolha <em>as suas.</em></>}
            </h2>
          </div>
        ) : (
          <div className="mb-6">
            <Sobretitulo>{porColecao.length > 0 ? "Misture as coleções" : `${colecao.nome} · ${qtdEstampas}`}</Sobretitulo>
            <h2 className="tc-titulo m-0 mt-2 text-[clamp(38px,5.2vw,68px)]">Escolha <em className="tc-marca">as suas.</em></h2>
          </div>
        )}

        {porColecao.length > 1 && (
          <nav aria-label="Filtrar por coleção" className="mb-3 flex flex-wrap gap-2">
            <Link href={endereco(filtro, undefined)} scroll={false} aria-current={colecaoEscolhida ? undefined : "page"} className={chip(!colecaoEscolhida)}>
              Todas as coleções · {naoNosCapitulos.length}
            </Link>
            {porColecao.map((c) => (
              <Link key={c.slug} href={endereco(filtro, c.slug)} scroll={false} aria-current={colecaoEscolhida === c.slug ? "page" : undefined} className={chip(colecaoEscolhida === c.slug)}>
                {c.nome} · {c.qtd}
              </Link>
            ))}
          </nav>
        )}

        {vitrine.length > 0 && (
          <nav aria-label="Filtrar peças" className="mb-6 flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Link
                key={f.valor}
                href={endereco(f.valor, colecaoEscolhida)}
                scroll={false}
                aria-current={filtro === f.valor ? "page" : undefined}
                className={chip(filtro === f.valor)}
              >
                {f.rotulo}{f.valor === "todas" && ` · ${vitrine.length}`}
              </Link>
            ))}
          </nav>
        )}

        {/* Na campanha, o progresso do trio fica no Build Your Club */}
        {!emCampanha && progresso}

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
      )}

      {proxima && <ProximaHistoria colecao={proxima} />}

      {!emCampanha && fotoFim && (
        // Rosa-bruma de ponta a ponta (29/09), como o bloco do trio; o conteúdo segue na largura da página
        <section className="tc-faixa-inteira tc-faixa-bruma grid items-center gap-7.5 border-t-3 border-tinta bg-rosa-bruma px-3.5 py-15.5 md:grid-cols-2 md:px-5">
          <div>
            <Sobretitulo>Editorial note</Sobretitulo>
            <h2 className="m-0 mb-4.5 mt-2.5 font-editorial text-[clamp(48px,6vw,90px)] font-bold leading-[0.84] tracking-[-0.05em] text-verde-escuro">
              Do drop<br />para o seu <em className="text-rosa-press">look.</em>
            </h2>
            <p className="m-0 max-w-[40ch] text-[13px] leading-relaxed text-tinta-suave">
              {colecao.nome} não é uniforme. Use com jeans, alfaiataria, saia ou como quiser: a T-shirt muda de contexto junto com você.
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
