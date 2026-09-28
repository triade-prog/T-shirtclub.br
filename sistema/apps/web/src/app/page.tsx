import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { formatarReais } from "@tshirtclub/domain";
import { Selo, Sobretitulo } from "@tshirtclub/ui";
import { buscarCatalogo, urlFoto, type BlocoInicio, type CartaoProduto, type Colecao, type Foto, type Look, type OfertaClub } from "@/lib/catalogo";
import { COOKIE_SACOLA } from "@/lib/sacola";
import { textoOferta } from "@/lib/vitrine";
import { ProgressoDaSacola } from "./_sacola/ProgressoDaSacola";
import { AvisoInstalarIphone } from "./_pwa/AvisoInstalarIphone";
import { CardProduto } from "./_vitrine/CardProduto";
import { CarrosselCapas } from "./_vitrine/CarrosselCapas";
import { MosaicoPecas } from "./_vitrine/MosaicoPecas";

// Início editorial (F2.9, tela 1; V4 em docs/design/v4/home.html). A ordem e o conteúdo dos
// blocos vêm do painel (/v1/catalog/home); sem catálogo, fica a apresentação da marca. Sem foto
// de campanha, a capa mostra as peças mais novas (28/09: a metade direita ficava vazia). Com
// coleções com capa (os banners de campanha), a capa vira um carrossel com um slide por coleção,
// e o bloco de coleções vira uma linha compacta de atalhos (28/09).
export default async function Inicio() {
  await connection();
  const blocos = (await buscarCatalogo<BlocoInicio[]>("v1/catalog/home")) ?? [];
  const club = blocos.find((b) => b.tipo === "MONTE_SEU_CLUB")?.conteudo as OfertaClub | undefined;
  const oferta = textoOferta(club);
  const sacola = (await cookies()).get(COOKIE_SACOLA)?.value;
  const temCampanha = blocos.some((b) => b.tipo === "CAMPANHA" && b.conteudo);
  const primeiraVitrine = blocos.findIndex((b) => (b.tipo === "NOVIDADES" || b.tipo === "PRODUTOS") && b.conteudo.length > 0);
  const colecoes = (await buscarCatalogo<Colecao[]>("v1/catalog/collections")) ?? [];
  const slides = temCampanha ? [] : colecoes.filter((c) => c.capa).map((c) => ({
    slug: c.slug, nome: c.nome, foto: urlFoto(c.capa!.caminho), alt: c.capa!.alt ?? c.nome,
    fotoCelular: c.capaCelular ? urlFoto(c.capaCelular.caminho) : null,
    // A legenda da campanha só com a campanha ligada no painel (0430)
    campanha: c.campanhaAtiva ? (c.campanha ?? null) : null, linha: [c.nome, c.temporada].filter(Boolean).join(" · "),
  }));
  const pecasDaCapa = temCampanha || slides.length > 0 ? [] : fotosDasVitrines(blocos);

  return (
    <>
      <AvisoInstalarIphone />
      {!temCampanha && (slides.length > 0 ? (
        <>
          {/* O título da capa está nos banners; o da página fica para o leitor de tela */}
          <h1 className="sr-only">T-shirt Club.br: você faz o Club</h1>
          <CarrosselCapas slides={slides} />
        </>
      ) : <Capa oferta={oferta} fotos={pecasDaCapa} />)}
      {blocos.map((b, i) => {
        switch (b.tipo) {
          case "CAMPANHA":
            return b.conteudo ? <Capa key={i} look={b.conteudo} selo={b.titulo} oferta={oferta} /> : null;
          case "NOVIDADES":
          case "PRODUTOS": {
            if (b.conteudo.length === 0) return null;
            const prioridade = i === primeiraVitrine && !temCampanha && slides.length === 0 && pecasDaCapa.length === 0;
            const id = i === primeiraVitrine ? "novidades" : undefined;
            return (
              <Secao key={i} id={id} sobretitulo={b.tipo === "NOVIDADES" ? "Curadoria da semana" : "Coleção"} titulo={b.titulo ?? "Club Picks"}>
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4">
                  {b.conteudo.map((p, j) => <CardProduto key={p.id} produto={p} oferta={oferta} prioridade={prioridade && j < 2} />)}
                </div>
              </Secao>
            );
          }
          case "QUASE_ESGOTADAS":
            // Almost Gone: as peças acabando, com o selo da quantidade real (vazio, some); uma fileira
            // só, as que têm menos primeiro, para o início não repetir a vitrine inteira
            return b.conteudo.length > 0 ? (
              <Secao key={i} id="quase-esgotadas" sobretitulo="Poucas unidades no Club" titulo={b.titulo ?? "Almost Gone"}>
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4">
                  {b.conteudo.slice(0, 4).map((p) => <CardProduto key={p.id} produto={p} oferta={oferta} />)}
                </div>
              </Secao>
            ) : null;
          case "COLECOES":
            return b.conteudo.length > 0 ? <Colecoes key={i} titulo={b.titulo} colecoes={b.conteudo} /> : null;
          case "LOOKS":
            return b.conteudo.length > 0 ? <Looks key={i} titulo={b.titulo} looks={b.conteudo} /> : null;
          case "MONTE_SEU_CLUB":
            return <MonteSeuClub key={i} oferta={b.conteudo} sacola={sacola} />;
        }
      })}
      {!club && <MonteSeuClub sacola={sacola} />}
    </>
  );
}

/**
 * Capas para a capa do início sem foto de campanha: até 3 peças das vitrines (Drop 01 antes),
 * uma de cada coleção, para mostrar a variedade e não repetir a primeira fileira logo abaixo.
 */
function fotosDasVitrines(blocos: BlocoInicio[]): Foto[] {
  const pecas = blocos.flatMap((b) => b.tipo === "NOVIDADES" || b.tipo === "PRODUTOS" || b.tipo === "QUASE_ESGOTADAS" ? b.conteudo : []);
  const escolhidas: CartaoProduto[] = [];
  for (const p of pecas) {
    if (p.capa && !escolhidas.some((e) => e.id === p.id || e.colecao?.slug === p.colecao?.slug)) escolhidas.push(p);
  }
  for (const p of pecas) {
    if (escolhidas.length >= 3) break;
    if (p.capa && !escolhidas.some((e) => e.id === p.id)) escolhidas.push(p);
  }
  return escolhidas.slice(0, 3).map((p) => p.capa!);
}

function Secao({ id, sobretitulo, titulo, children }: { id?: string; sobretitulo: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="px-3.5 py-12 md:px-5 md:py-20">
      <Sobretitulo>{sobretitulo}</Sobretitulo>
      <h2 className="tc-titulo m-0 mb-7 mt-2 text-[clamp(38px,5.2vw,68px)]">{titulo}</h2>
      {children}
    </section>
  );
}

function Capa({ look, selo, oferta, fotos = [] }: { look?: Look; selo?: string | null; oferta?: string; fotos?: Foto[] }) {
  return (
    <section className="grid border-b-3 border-tinta md:min-h-[600px] md:grid-cols-[0.82fr_1.18fr]">
      <div className="grid content-center justify-items-start gap-6 bg-rosa-bruma px-4 py-12 md:px-10">
        <Selo>{selo ?? "The Club Edit · Drop 01"}</Selo>
        <h1 className="tc-titulo m-0 font-texto text-[64px] font-extrabold leading-[0.8] tracking-[-0.075em] md:text-[clamp(70px,8.7vw,130px)]">
          VOCÊ<br />FAZ O<br /><em className="tc-marca">Club.</em>
        </h1>
        <p className="m-0 max-w-[23ch] font-editorial text-[22px] italic leading-tight text-tinta-suave">
          Uma T-shirt. Vários jeitos de usar. Nenhum jeito obrigatório.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link href="#novidades" className="inline-flex min-h-13 items-center rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
            Ver o novo drop
          </Link>
          <Link href="#monte-club" className="inline-flex min-h-13 items-center rounded-pilula border-2 border-tinta px-6 text-[15px] font-bold shadow-adesivo">
            Monte seu Club
          </Link>
        </div>
      </div>
      {look && (
        <div className="relative min-h-[430px] border-tinta max-md:border-t-3 md:border-l-3">
          <Image src={urlFoto(look.foto.caminho)} alt={look.foto.alt ?? look.titulo} fill priority sizes="(min-width: 768px) 60vw, 100vw" className="object-cover" />
          <Selo className="absolute left-5 top-5 -rotate-3">{look.titulo}</Selo>
          {oferta && <Selo fundo="citrino" brilho={false} className="absolute bottom-5 right-5 rotate-2">{oferta}</Selo>}
        </div>
      )}
      {!look && fotos.length > 0 && (
        <div className="grid content-center bg-papel px-4 py-8 max-md:border-t-3 max-md:border-tinta md:border-l-3 md:border-tinta md:px-10 md:py-12">
          <MosaicoPecas fotos={fotos} selo={oferta} prioridade tamanhos="(min-width: 768px) 32vw, 55vw" className="h-[300px] md:h-[500px]" />
        </div>
      )}
    </section>
  );
}

// Pick your story (28/09): atalhos para cada história logo abaixo da capa, em círculos com a peça
// mais nova da coleção (a foto de campanha não cabe no círculo); com a campanha ligada, o nome
// dela aparece em cima do da coleção. No celular, a linha desliza para o lado. O título vem do
// painel (bloco de coleções).
function Colecoes({ titulo, colecoes }: { titulo: string | null; colecoes: Colecao[] }) {
  return (
    <section aria-labelledby="inicio-colecoes" className="px-3.5 py-8 md:px-5 md:py-12">
      <h2 id="inicio-colecoes" className="tc-titulo m-0 mb-5 text-center text-[clamp(30px,3.6vw,44px)]">{titulo ?? "Pick your story."}</h2>
      <ul className="m-0 flex list-none snap-x gap-3 overflow-x-auto p-0 pb-2 md:flex-wrap md:justify-center md:gap-6 md:overflow-visible">
        {colecoes.map((c) => {
          const foto = c.fotos?.[0] ?? c.capa;
          return (
            <li key={c.id} className="shrink-0 snap-start">
              <Link href={`/colecao/${c.slug}`} className="group grid w-24 justify-items-center gap-2 text-center md:w-32">
                <span className={`col-${c.cor.toLowerCase()} relative block size-20 overflow-hidden rounded-full border-2 border-tinta bg-colecao-fundo shadow-adesivo-sm transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none md:size-28`}>
                  {foto && <Image src={urlFoto(foto.caminho)} alt="" fill sizes="(min-width: 768px) 112px, 80px" className="object-cover" />}
                </span>
                {/* Pick your story (0430): a campanha ligada em cima, a coleção embaixo */}
                {c.campanhaAtiva && c.campanha && <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.14em] text-tinta-suave">{c.campanha}</span>}
                <span className="font-editorial text-[15px] font-bold leading-tight tracking-[-0.02em] md:text-lg">{c.nome}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Looks({ titulo, looks }: { titulo: string | null; looks: Look[] }) {
  return (
    <Secao sobretitulo="A mesma T-shirt, outra você" titulo={titulo ?? "Shop the Look"}>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {looks.map((l, i) => (
          <li key={l.id} className="relative min-h-[430px] overflow-hidden rounded-cartao border-2 border-tinta">
            <Image src={urlFoto(l.foto.caminho)} alt={l.foto.alt ?? l.titulo} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
            <Selo fundo="citrino" brilho={false} className="absolute left-3 top-3">Look {String(i + 1).padStart(2, "0")}</Selo>
            <div className="absolute inset-x-3.5 bottom-3.5 rounded-campo border-[1.5px] border-tinta bg-papel/95 px-3.5 py-3">
              <p className="m-0 font-editorial text-base font-bold">{l.titulo}</p>
              {l.produtos.length > 0 && (
                <p className="m-0 mt-0.5 text-xs text-tinta-suave">
                  {l.produtos.map((p, j) => (
                    <span key={p.id}>{j > 0 && " · "}<Link href={`/produto/${p.slug}`} className="underline decoration-rosa decoration-2 underline-offset-2">{p.nome}</Link></span>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function MonteSeuClub({ oferta, sacola }: { oferta?: OfertaClub; sacola?: string }) {
  const preco = oferta ? formatarReais(oferta.precoCentavos) : "R$ 119,99";
  const qtd = oferta?.qtd ?? 3;
  return (
    <section id="monte-club" className="border-y-3 border-tinta bg-rosa px-3.5 py-14 text-no-rosa md:px-5">
      <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2">
        <div className="grid justify-items-start gap-5">
          <Sobretitulo>Monte seu Club</Sobretitulo>
          {/* Sobre o rosa, a palavra de marca vai em tinta (rosa sobre rosa some) */}
          <h2 className="tc-titulo m-0 text-[clamp(55px,7vw,100px)] leading-[0.82]">
            <span className="font-display tracking-[-0.045em]">{qtd} escolhas.</span><br /><em className="text-tinta">Seu Club.</em>
          </h2>
          <p className="m-0 max-w-[33ch] font-editorial text-xl italic leading-snug">Misture estampas e coleções. {qtd} T-shirts por {preco}.</p>
          <Link href="#novidades" className="inline-flex min-h-13 items-center rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
            Escolher minhas {qtd}
          </Link>
        </div>
        <ProgressoDaSacola qtd={qtd} preco={preco} inicial={sacola} titulo={`Escolha ${qtd} peças.`} texto={`A cada ${qtd}, o preço do Club entra sozinho: ${preco} pelas ${qtd}.`} />
      </div>
    </section>
  );
}
