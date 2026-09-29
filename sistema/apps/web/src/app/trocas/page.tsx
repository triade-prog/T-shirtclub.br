import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { MessageCircle } from "lucide-react";
import { Sobretitulo } from "@tshirtclub/ui";
import { EMPRESA } from "@/lib/empresa";
import { DIAS_TROCA } from "@/lib/trocas";

export const metadata: Metadata = {
  title: "Trocas e devoluções",
  description: `Troca em até ${DIAS_TROCA} dias, com a peça sem uso e com a etiqueta. Pedido pelo WhatsApp.`,
  alternates: { canonical: "/trocas" },
};

// Trocas e devoluções (29/09, pedido da loja): a regra da loja (7 dias, sem uso e com a etiqueta),
// o direito de arrependimento da compra pelo site (CDC, art. 49) e como pedir, pelo WhatsApp.
// Linguagem simples, no desenho das outras páginas da marca (D38).

export default async function Trocas() {
  // Gerada a cada pedido, como as outras: estática, sairia sem o nonce da CSP (D29)
  await connection();
  const numero = process.env.WHATSAPP_LOJA ?? "5577998155772";
  return (
    <article className="mx-auto grid max-w-3xl gap-9 px-4 pb-14 pt-8 md:px-5 md:pt-12">
      <header className="grid gap-4">
        <Sobretitulo>Ajuda</Sobretitulo>
        <h1 className="tc-titulo m-0 text-[clamp(40px,6vw,64px)] text-tinta">Trocas e devoluções.</h1>
        <p className="m-0 max-w-[34ch] font-editorial text-[clamp(21px,2.4vw,26px)] italic leading-snug text-tinta">
          Troca em até {DIAS_TROCA} dias, com a peça sem uso e com a etiqueta.
        </p>
      </header>

      <Secao titulo="Como funciona">
        <ul>
          <li>Você tem <b>{DIAS_TROCA} dias corridos</b> para pedir a troca, contados do dia em que recebe ou retira a peça.</li>
          <li>A peça precisa estar <b>sem uso</b>, sem lavar e com a <b>etiqueta presa</b>.</li>
          <li>O jeito de devolver (na loja, por motoboy ou por envio) a gente combina com você pelo WhatsApp.</li>
        </ul>
      </Secao>

      <Secao titulo="Desistiu da compra?">
        <p>
          Se você comprou pelo site, também pode desistir em até {DIAS_TROCA} dias depois de receber e ter o valor de volta:
          é o direito de arrependimento (art. 49 do Código de Defesa do Consumidor).
        </p>
      </Secao>

      <Secao titulo="Como pedir">
        <p>Chame a gente no WhatsApp com o número da sua reserva e conte o que quer trocar.</p>
        <p>
          <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-13 items-center gap-2 rounded-pilula border-2 border-tinta bg-tinta px-6 text-[15px] font-bold text-papel shadow-adesivo">
            <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} /> WhatsApp {EMPRESA.whatsapp}
          </a>
        </p>
        <p className="text-sm text-tinta-suave">
          Não achou o número da reserva? Ele está em <Link href="/consulta" className="underline underline-offset-4">Minhas reservas</Link>.
        </p>
      </Secao>
    </article>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-tinta/15 pt-6 text-[15px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_p]:m-0 [&_ul]:m-0 [&_ul]:grid [&_ul]:gap-2 [&_ul]:p-0">
      <h2 className="m-0 font-editorial text-2xl font-bold tracking-[-0.03em]">{titulo}</h2>
      {children}
    </section>
  );
}
