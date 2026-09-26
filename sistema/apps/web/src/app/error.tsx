"use client";

// Erro inesperado numa tela da loja: em português e no estilo da V4, com "Tentar de novo"
// (a página padrão do Next é em inglês). Erro do servidor já vai para o registro (instrumentation.ts).
export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="grid gap-4 px-4 pb-12 pt-8 md:px-5 md:pt-12">
      <h1 className="tc-titulo m-0 text-[clamp(40px,6vw,64px)]">Algo deu errado <em>aqui.</em></h1>
      <p role="alert" className="m-0 max-w-prose text-[15px] text-tinta-suave">
        Não conseguimos mostrar esta tela agora. Sua sacola e suas reservas continuam guardadas.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={reset} className="inline-flex min-h-13 items-center rounded-pilula border-2 border-tinta bg-rosa px-6 text-[15px] font-bold text-no-rosa shadow-adesivo">
          Tentar de novo
        </button>
        {/* Página nova de verdade, para não depender do estado que quebrou */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="inline-flex min-h-13 items-center rounded-pilula border-2 border-tinta px-6 text-[15px] font-bold shadow-adesivo">
          Voltar para a loja
        </a>
      </div>
    </section>
  );
}
