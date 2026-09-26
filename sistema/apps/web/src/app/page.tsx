import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { formatarReais } from "@tshirtclub/domain";
import { ProgressoClub, Selo, Sobretitulo } from "@tshirtclub/ui";
import { buscarCatalogo, urlFoto, type BlocoInicio, type Colecao, type Look, type OfertaClub } from "@/lib/catalogo";
import { textoOferta } from "@/lib/vitrine";
import { AvisoInstalarIphone } from "./_pwa/AvisoInstalarIphone";
import { CardProduto } from "./_vitrine/CardProduto";

// Início editorial (F2.9, tela 1; V4 em docs/design/v4/home.html). A ordem e o conteúdo dos
// blocos vêm do painel (/v1/catalog/home); sem catálogo, fica a apresentação da marca.
export default async function Inicio() {
  await connection();
  const blocos = (await buscarCatalogo<BlocoInicio[]>("v1/catalog/home")) ?? [];
  const club = blocos.find((b) => b.tipo === "MONTE_SEU_CLUB")?.conteudo as OfertaClub | undefined;
  const oferta = textoOferta(club);
  const temCampanha = blocos.some((b) => b.tipo === "CAMPANHA" && b.conteudo);
  const primeiraVitrine = blocos.findIndex((b) => (b.tipo === "NOVIDADES" || b.tipo === "PRODUTOS") && b.conteudo.length > 0);

  return (
    <>
      <AvisoInstalarIphone />
      {!temCampanha && <Capa oferta={oferta} />}
      {blocos.map((b, i) => {
        switch (b.tipo) {
          case "CAMPANHA":
            return b.conteudo ? <Capa key={i} look={b.conteudo} selo={b.titulo} oferta={oferta} /> : null;
          case "NOVIDADES":
          case "PRODUTOS": {
            if (b.conteudo.length === 0) return null;
            const prioridade = i === primeiraVitrine && !temCampanha;
            const id = i === primeiraVitrine ? "novidades" : undefined;
            return (
              <Secao key={i} id={id} sobretitulo={b.tipo === "NOVIDADES" ? "Curadoria da semana" : "Coleção"} titulo={b.titulo ?? "Club Picks"}>
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4">
                  {b.conteudo.map((p, j) => <CardProduto key={p.id} produto={p} oferta={oferta} prioridade={prioridade && j < 2} />)}
                </div>
              </Secao>
            );
          }
          case "COLECOES":
            return b.conteudo.length > 0 ? <Colecoes key={i} titulo={b.titulo} colecoes={b.conteudo} /> : null;
          case "LOOKS":
            return b.conteudo.length > 0 ? <Looks key={i} titulo={b.titulo} looks={b.conteudo} /> : null;
          case "MONTE_SEU_CLUB":
            return <MonteSeuClub key={i} oferta={b.conteudo} />;
        }
      })}
      {!club && <MonteSeuClub />}
    </>
  );
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

function Capa({ look, selo, oferta }: { look?: Look; selo?: string | null; oferta?: string }) {
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
    </section>
  );
}

function Colecoes({ titulo, colecoes }: { titulo: string | null; colecoes: Colecao[] }) {
  return (
    <Secao sobretitulo="Drops com universo próprio" titulo={titulo ?? "Coleções"}>
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-4">
        {colecoes.map((c) => (
          <li key={c.id}>
            <Link
              href={`/colecao/${c.slug}`}
              className={`col-${c.cor.toLowerCase()} relative block min-h-[250px] overflow-hidden rounded-cartao border-2 border-tinta bg-colecao-fundo shadow-adesivo md:min-h-[340px]`}
            >
              {c.capa && <Image src={urlFoto(c.capa.caminho)} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />}
              <span className="absolute inset-x-0 bottom-0 grid gap-0.5 bg-linear-to-t from-tinta/75 to-transparent px-4 pb-4 pt-16 text-papel">
                <span className="font-editorial text-[26px] font-bold leading-none tracking-[-0.04em]">{c.nome}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Secao>
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

function MonteSeuClub({ oferta }: { oferta?: OfertaClub }) {
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
        <ProgressoClub pecas={0} titulo={`Escolha ${qtd} peças.`} texto={`A cada ${qtd}, o preço do Club entra sozinho: ${preco} pelas ${qtd}.`} />
      </div>
    </section>
  );
}
