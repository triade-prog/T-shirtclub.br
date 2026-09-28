"use client";

import { BotaoCampanha, ConteudoSlide, PickYourStory, TopoCampanha, classeMolduraCarrossel, cx, universoDaPaleta, type PaletaCampanha } from "@tshirtclub/ui";
import { urlFoto } from "@/lib/catalogo";
import type { Colecao } from "@/lib/tiposCatalogo";
import { JanelaPrevia } from "../_painel/JanelaPrevia";

type Foto = { caminho: string; alt?: string | null };

/** O que está no formulário agora, salvo ou não. */
export interface RascunhoColecao {
  id: string | null; nome: string; slug: string; cor: string; ativa: boolean; posicao: number;
  descricao: string | null; chamada: string | null;
  campanha: string | null; campanhaAtiva: boolean; temporada: string | null; edicao: string | null; paleta: PaletaCampanha;
  capa: Foto | null; capaCelular: Foto | null; fotoStory: Foto | null;
  produtos: number; pecaMaisNova: Foto | null;
}

// eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage, dentro da prévia
const Img = ({ foto, className }: { foto: Foto; className: string }) => <img src={urlFoto(foto.caminho)} alt="" className={className} />;

/** Foto 16:9 no computador e, com a foto do celular, 4:5 no celular (como na loja). */
function FotoDupla({ capa, celular }: { capa: Foto; celular: Foto | null }) {
  if (!celular) return <Img foto={capa} className="absolute inset-0 size-full object-cover" />;
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={urlFoto(capa.caminho)} />
      <Img foto={celular} className="absolute inset-0 size-full object-cover" />
    </picture>
  );
}

/**
 * Prévia da coleção na loja, com o que está no formulário: o slide do carrossel do início, a linha
 * do Pick your story (com as outras coleções ativas, na ordem) e o topo da página de campanha.
 * Os desenhos são os da loja (packages/ui); as fotos, as miniaturas do Storage.
 */
export function PreviaColecao({ r, outras }: { r: RascunhoColecao; outras: Colecao[] }) {
  const campanhaLigada = Boolean(r.campanha && r.campanhaAtiva);
  const linha = [r.nome, r.temporada].filter(Boolean).join(" · ");
  const vertical = Boolean(r.capaCelular);
  const u = universoDaPaleta(r.paleta);
  const qtdEstampas = r.produtos === 1 ? "1 estampa" : `${r.produtos} estampas`;
  const nome = r.nome.trim() || "Nome da coleção";

  const linhaStory = [
    ...outras.filter((c) => c.ativa && c.id !== r.id).map((c) => ({
      id: c.id, nome: c.nome, posicao: c.posicao, cor: c.cor, campanha: c.campanhaAtiva ? c.campanha : null,
      foto: c.fotoStory ?? c.pecaMaisNova ?? c.capa,
    })),
    ...(r.ativa ? [{ id: r.id ?? "nova", nome, posicao: r.posicao, cor: r.cor, campanha: campanhaLigada ? r.campanha : null, foto: r.fotoStory ?? r.pecaMaisNova ?? r.capa }] : []),
  ].sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <JanelaPrevia rotulo="Prévia na loja">
      {r.capa ? (
        <section className="px-3.5 pt-5 md:px-5 md:pt-7">
          <div className={classeMolduraCarrossel(vertical)}>
            <div className="absolute inset-0">
              <span className="group block size-full">
                <ConteudoSlide nome={nome} campanha={campanhaLigada ? r.campanha : null} linha={linha} vertical={vertical} foto={<FotoDupla capa={r.capa} celular={r.capaCelular} />} />
              </span>
            </div>
          </div>
        </section>
      ) : <Nota>Sem capa, a coleção não entra no carrossel do início.</Nota>}

      {r.ativa
        ? <PickYourStory titulo={null} itens={linhaStory.map((c) => ({
            id: c.id, nome: c.nome, href: "#", cor: c.cor, campanha: c.campanha,
            foto: c.foto && <Img foto={c.foto} className="absolute inset-0 size-full object-cover" />,
          }))} />
        : <Nota>Coleção inativa: não aparece no Pick your story nem na loja.</Nota>}

      {r.campanha ? (
        <>
          {!campanhaLigada && <Nota>Campanha desligada: a loja ainda mostra a página comum da coleção. Assim ela fica quando for ligada:</Nota>}
          <div className={cx(`col-${r.cor.toLowerCase()}`, u.classe, "bg-camp-base text-camp-tinta")}>
            <TopoCampanha colecao={{ ...r, nome }} qtdEstampas={qtdEstampas} botao={<BotaoCampanha produtos={r.produtos} />}
              foto={r.capa && (
                <div className={cx("relative overflow-hidden rounded-[24px] ring-1 ring-camp-tinta/15", r.capaCelular ? "aspect-[4/5] md:aspect-video" : "aspect-video")}>
                  <FotoDupla capa={r.capa} celular={r.capaCelular} />
                </div>
              )} />
          </div>
        </>
      ) : <Nota>Sem nome de campanha, a página da coleção é a comum.</Nota>}
    </JanelaPrevia>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="m-0 px-5 py-3 text-center text-xs font-semibold text-tinta-suave">{children}</p>;
}
