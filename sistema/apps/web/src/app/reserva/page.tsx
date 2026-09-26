import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { Aviso, Sobretitulo } from "@tshirtclub/ui";
import { urlFoto } from "@/lib/catalogo";
import { montarSacola } from "@/lib/sacola-servidor";
import { FormDados } from "./FormDados";

// Reserva, passo 1 de 3: "Seus dados" (tela 5 do design, rota /reserva, F3). A sacola vem
// do cookie e é cotada no servidor; sem nada para reservar, volta para a sacola.

export const metadata: Metadata = { title: "Seus dados", robots: { index: false } };

export default async function PaginaSeusDados() {
  const { validos, pedido, cotacao, avisos } = await montarSacola();
  if (pedido.length === 0) redirect("/sacola");

  return (
    <section className="grid items-start gap-8 px-3.5 pb-12 pt-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:px-5 md:pt-12">
      <div className="grid gap-5">
        <div>
          <Sobretitulo>Passo 1 de 3</Sobretitulo>
          <h1 className="m-0 mt-2 font-editorial text-[clamp(36px,5vw,56px)] font-bold leading-[0.95] tracking-[-0.05em]">
            Seus <em className="text-rosa-press">dados.</em>
          </h1>
          <p className="m-0 mt-3 max-w-[48ch] text-[15px] text-tinta-suave">
            Nada fica reservado ainda. Depois do código no WhatsApp, conferimos o estoque e começa o prazo de 15 minutos para pagar.
          </p>
        </div>
        {avisos.map((a) => <Aviso key={a} tipo="atencao" titulo={a} />)}
        {cotacao ? (
          <FormDados pedido={pedido} pecas={cotacao.pecas} cotacaoInicial={cotacao} />
        ) : (
          <Link href="/sacola" className="font-bold underline decoration-rosa decoration-2 underline-offset-2">Voltar para a sacola</Link>
        )}
      </div>

      <aside aria-labelledby="resumo-reserva" className="rounded-[22px] border-2 border-tinta bg-rosa-bruma p-5 shadow-[6px_6px_0_var(--tc-citrino)] md:sticky md:top-36 md:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="resumo-reserva" className="m-0 font-editorial text-[25px] font-bold tracking-[-0.035em]">Sua seleção</h2>
          <Link href="/sacola" className="text-xs font-bold underline decoration-rosa decoration-2 underline-offset-2">Alterar</Link>
        </div>
        <ul className="m-0 mt-4 grid list-none gap-3 p-0">
          {validos.map(({ produto, qtd }) => (
            <li key={produto.id} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 text-sm">
              <span className="relative block h-16 w-13 overflow-hidden rounded-[9px] border-[1.5px] border-tinta bg-algodao">
                {produto.fotos[0] && <Image src={urlFoto(produto.fotos[0].caminho)} alt="" fill sizes="52px" className="object-cover" />}
              </span>
              <span className="font-semibold">{produto.nome}</span>
              <span className="text-tinta-suave">× {qtd}</span>
            </li>
          ))}
        </ul>
        {cotacao && (
          <dl className="m-0 mt-4 border-t border-tinta/20 pt-3 text-sm">
            <div className="flex justify-between py-1"><dt>Subtotal</dt><dd className="m-0">{formatarReais(cotacao.subtotalCentavos)}</dd></div>
            {cotacao.descontoCentavos > 0 && (
              <div className="flex justify-between py-1 font-bold text-verde-escuro"><dt>{cotacao.aplicada?.rotulo ?? "Desconto"}</dt><dd className="m-0">− {formatarReais(cotacao.descontoCentavos)}</dd></div>
            )}
            <div className="mt-2 flex items-baseline justify-between border-t-2 border-tinta pt-3">
              <dt className="text-xs font-extrabold uppercase tracking-[0.1em]">Total dos produtos</dt>
              <dd className="m-0 font-display text-2xl font-extrabold">{formatarReais(cotacao.totalCentavos)}</dd>
            </div>
          </dl>
        )}
        <p className="m-0 mt-3 text-xs text-tinta-suave">Vale só a promoção mais vantajosa: os descontos não se somam. Com cupom, o total atualizado aparece junto do botão.</p>
      </aside>
    </section>
  );
}
