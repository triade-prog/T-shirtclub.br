import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sem conexão", robots: { index: false } };

// Guardada pelo service worker na instalação: aparece quando a cliente abre a loja sem rede.
// Nada de preço nem de reserva aqui, porque isso só vale vindo da rede.
export default function SemConexao() {
  return (
    <section className="grid gap-4 px-4 pb-4 pt-8">
      <h1 className="m-0 font-display text-[40px] font-extrabold leading-[0.95] tracking-tight">Sem conexão agora</h1>
      <p className="m-0 max-w-prose text-[15px] text-tinta-suave">
        Para ver as peças, reservar ou pagar, a loja precisa da internet. Sua reserva continua valendo: o prazo aparece
        certinho assim que a conexão voltar.
      </p>
      {/* Recarrega de verdade (e não navega pelo cliente, que precisaria da rede para buscar a página) */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="inline-flex min-h-11 w-fit items-center rounded-campo px-2 font-semibold underline decoration-rosa decoration-2 underline-offset-2">
        Tentar de novo
      </a>
    </section>
  );
}
