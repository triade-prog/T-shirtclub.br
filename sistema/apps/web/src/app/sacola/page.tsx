import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";
import { Aviso, ProgressoClub, Selo, Sobretitulo, cx } from "@tshirtclub/ui";
import { urlFoto } from "@/lib/catalogo";
import { ordinalClub, textoAviso } from "@/lib/sacola";
import { montarSacola } from "@/lib/sacola-servidor";
import { removerPeca } from "./acoes";

// Sacola "Monte seu Club" (F2.9; V4 em docs/design/v4/sacola.html), gerada no servidor.
// Uma linha por peça, na ordem em que entraram, para mostrar em qual Club cada uma cai.
// Preço e desconto vêm da cotação da api-public (POST /v1/cart/quote), nunca do navegador.

export const metadata: Metadata = { title: "Sua sacola", robots: { index: false } };

const ESPECIE = "Tamanho único · 100% algodão";

export default async function PaginaSacola({ searchParams }: PageProps<"/sacola">) {
  const { itens, produtos, validos, cotacao, club, avisos } = await montarSacola();
  const aviso = textoAviso((await searchParams).aviso);

  const qtdClub = club?.qtd ?? 3;
  const total = cotacao?.pecas ?? 0;
  // Uma linha por peça. Com o Club aplicado, cada peça de um trio fechado sai pela fração do
  // preço do grupo (V4: "R$ 40,00 no Club") e as que sobram, pelo preço normal; com outra
  // promoção, o desconto de cada linha é repartido entre as peças dela.
  const comClub = cotacao?.aplicada?.tipo === "COMPRE_MAIS" && club !== null;
  const emTrios = total - (total % qtdClub);
  const pecas = validos.flatMap(({ produto, qtd }) => {
    const linha = cotacao?.linhas.find((l) => l.produtoId === produto.id);
    const media = linha ? Math.round(linha.totalCentavos / linha.qtd) : null;
    return Array.from({ length: qtd }, () => ({ produto, media }));
  }).map((p, i) => ({ ...p, unitario: comClub ? (i < emTrios ? Math.round(club.precoCentavos / qtdClub) : null) : p.media }));
  // Peças esgotadas continuam listadas, para a cliente poder tirar da sacola.
  const esgotadas = itens
    .map((item, i) => ({ slug: item.produtoId, nome: produtos[i]?.nome, id: produtos[i]?.id }))
    .filter((e) => !validos.some((v) => v.produto.id === e.id));

  const noTrio = total > 0 && total % qtdClub === 0 ? qtdClub : total % qtdClub;
  const trioAtual = pecas.slice(total - noTrio, total - noTrio + qtdClub);
  const completo = total > 0 && noTrio === qtdClub && !cotacao?.proximoGrupo;
  const rotulos = Array.from({ length: 3 }, (_, i) => trioAtual[i]?.produto.colecao?.nome ?? (i === noTrio ? `Falta ${qtdClub - noTrio}` : `${i + 1}ª peça`)) as [string, string, string];

  return (
    <section className="bg-[linear-gradient(180deg,var(--tc-rosa-bruma)_0_245px,var(--tc-papel)_245px)] px-3.5 pb-22 pt-12 md:px-5">
      <div className="mb-7.5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <Sobretitulo>Your Club · {noTrio}/{qtdClub}</Sobretitulo>
          <h1 className="m-0 mt-2 inline-block -rotate-1 border-2 border-tinta bg-citrino px-[0.12em] pb-[0.07em] font-editorial text-[clamp(48px,6vw,82px)] font-bold leading-[0.85] tracking-[-0.06em] shadow-[5px_5px_0_var(--tc-tinta)]">
            Sua <em className="text-rosa-press">Sacola.</em>
          </h1>
        </div>
        <Link href="/" className="border-b border-tinta pb-1 text-[11px] font-extrabold uppercase tracking-[0.11em]">Continuar escolhendo</Link>
      </div>

      {(aviso || avisos.length > 0) && (
        <div className="mb-5 grid gap-3">
          {[aviso, ...avisos].filter((a): a is string => !!a).map((a) => <Aviso key={a} tipo="atencao" titulo={a} />)}
        </div>
      )}

      {itens.length === 0 ? (
        <div className="grid justify-items-start gap-4 rounded-[22px] border-2 border-tinta bg-papel p-7 shadow-[6px_6px_0_var(--tc-citrino)]">
          <h2 className="m-0 font-editorial text-[29px] font-bold tracking-[-0.035em]">Sua sacola está vazia.</h2>
          <p className="m-0 text-sm text-tinta-suave">
            {club ? `Escolha ${club.qtd} estampas e o Club sai por ${formatarReais(club.precoCentavos)}, sem cupom.` : "Escolha suas estampas e monte o seu Club."}
          </p>
          <Link href="/" className="inline-flex min-h-13 items-center gap-2 rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
            Ver as estampas <ArrowRight aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-9.5 md:grid-cols-[1.3fr_0.7fr]">
          <div>
            {cotacao && club && (
              <ProgressoClub
                nivel={2}
                pecas={total}
                rotulos={rotulos}
                className={cx("mb-4.5", completo && "shadow-[6px_6px_0_var(--tc-rosa)]")}
                titulo={completo ? `Suas ${total} peças saem por ${formatarReais(cotacao.totalCentavos)}.` : `Falta${qtdClub - noTrio > 1 ? "m" : ""} ${qtdClub - noTrio} para o ${total > qtdClub ? "próximo " : ""}Club.`}
                texto={completo
                  ? `O desconto do Club foi aplicado automaticamente. Economia total de ${formatarReais(cotacao.descontoCentavos)} em relação ao preço avulso.`
                  : `Com mais ${qtdClub - noTrio === 1 ? "uma peça" : `${qtdClub - noTrio} peças`}, de qualquer coleção, ${qtdClub} saem por ${formatarReais(club.precoCentavos)}.`}
              />
            )}

            <ul className="m-0 list-none border-t border-linha p-0">
              {pecas.map(({ produto, unitario }, i) => (
                <li key={`${produto.id}-${i}`} className="grid grid-cols-[84px_1fr] items-center gap-x-4.5 border-b border-linha py-4.5 sm:grid-cols-[110px_1fr_auto]">
                  <Link href={`/produto/${produto.slug}`} tabIndex={-1} aria-hidden="true" className="relative row-span-2 h-26 w-21 overflow-hidden rounded-[13px] border-[1.5px] border-tinta bg-algodao shadow-[3px_3px_0_var(--tc-rosa-bruma)] sm:row-span-1 sm:h-33 sm:w-27.5">
                    {produto.fotos[0] && <Image src={urlFoto(produto.fotos[0].caminho)} alt="" fill sizes="110px" className="object-cover" />}
                  </Link>
                  <div>
                    <p className="m-0 text-[9px] font-extrabold uppercase tracking-[0.11em] text-tinta-suave">
                      {[produto.colecao?.nome, ordinalClub(i, qtdClub)].filter(Boolean).join(" · ")}
                    </p>
                    <h3 className="m-0 mt-1 text-[17px] font-bold tracking-[-0.02em]"><Link href={`/produto/${produto.slug}`}>{produto.nome}</Link></h3>
                    <p className="m-0 mt-1.5 text-[11px] text-tinta-suave">{ESPECIE}</p>
                    <form action={removerPeca}>
                      <input type="hidden" name="slug" value={produto.slug} />
                      <button type="submit" aria-label={`Remover ${produto.nome}`} className="mt-1.5 min-h-11 border-0 bg-transparent p-0 text-[10px] font-extrabold uppercase tracking-[0.1em] text-tinta-suave underline">
                        Remover
                      </button>
                    </form>
                  </div>
                  <p className="col-start-2 m-0 text-[13px] font-extrabold sm:col-start-3 sm:text-right">
                    {unitario !== null && unitario < produto.precoCentavos ? (
                      <>
                        <s className="font-medium text-tinta-suave"><span className="sr-only">De </span>{formatarReais(produto.precoCentavos)}</s>
                        <small className="mt-1 block text-[10px] font-black text-verde-escuro">{formatarReais(unitario)} no Club</small>
                      </>
                    ) : formatarReais(produto.precoPromocionalCentavos ?? produto.precoCentavos)}
                  </p>
                </li>
              ))}
              {esgotadas.map((p) => (
                <li key={p.slug} className="flex items-center justify-between gap-4 border-b border-linha py-4.5 text-sm text-tinta-suave">
                  <span>{p.nome ? `${p.nome} · esgotada` : "Peça que saiu da loja"}</span>
                  <form action={removerPeca}>
                    <input type="hidden" name="slug" value={p.slug} />
                    <button type="submit" aria-label={`Remover ${p.nome ?? "peça que saiu da loja"}`} className="min-h-11 border-0 bg-transparent p-0 text-[10px] font-extrabold uppercase tracking-[0.1em] underline">Remover</button>
                  </form>
                </li>
              ))}
            </ul>

            <Link href="/" className="mt-6 inline-flex min-h-12.5 items-center gap-2 rounded-pilula border-2 border-tinta px-5.5 text-xs font-bold shadow-[2px_2px_0_var(--tc-tinta)]">
              ← Continuar comprando
            </Link>
          </div>

          {cotacao && (
            <aside aria-labelledby="resumo" className="rounded-[22px] border-2 border-tinta bg-rosa-bruma p-6 shadow-[7px_7px_0_var(--tc-citrino)]">
              <Selo fundo="citrino">Resumo do Club</Selo>
              <h2 id="resumo" className="m-0 mb-5 mt-2 font-editorial text-[27px] font-bold tracking-[-0.035em]">
                {completo ? "Pronto para reservar." : "Quase lá."}
              </h2>
              <dl className="m-0 text-xs">
                <div className="flex justify-between gap-3.5 py-1.75"><dt>{total} {total === 1 ? "T-shirt" : "T-shirts"}</dt><dd className="m-0">{formatarReais(cotacao.subtotalCentavos)}</dd></div>
                {cotacao.descontoCentavos > 0 && (
                  <div className="flex justify-between gap-3.5 py-1.75 font-extrabold text-verde-escuro">
                    <dt>{cotacao.aplicada?.rotulo ?? "Desconto do Club"}</dt><dd className="m-0">− {formatarReais(cotacao.descontoCentavos)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3.5 py-1.75"><dt>Entrega</dt><dd className="m-0">Definir depois</dd></div>
                <div className="mt-2.5 flex items-baseline justify-between border-t-2 border-tinta pt-4">
                  <dt className="text-xs font-extrabold uppercase tracking-[0.1em]">Total</dt>
                  <dd className="m-0 font-display text-[27px] font-extrabold">{formatarReais(cotacao.totalCentavos)}</dd>
                </div>
              </dl>
              {/* A reserva (fatia 4) lê a mesma sacola do cookie. */}
              <Link href="/reserva" className="mt-4.5 flex min-h-13 w-full items-center justify-center gap-2 rounded-pilula border-2 border-tinta bg-rosa px-5 text-[15px] font-bold text-no-rosa shadow-adesivo">
                Reservar minhas peças — 15 min <ArrowRight aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </Link>
              <p className="m-0 mt-3 text-center text-[11px] leading-relaxed text-tinta-suave">
                No próximo passo você confirma seu WhatsApp. Após a confirmação, as peças ficam reservadas pelo período indicado.
              </p>
              <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                {["PIX ou cartão", "Retire ou receba", "Atendimento humano"].map((t) => (
                  <li key={t} className="rounded-xl border border-tinta bg-papel p-2.5 text-center text-[10px] font-extrabold uppercase tracking-[0.06em]">{t}</li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
