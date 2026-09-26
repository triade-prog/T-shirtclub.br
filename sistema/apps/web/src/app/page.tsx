import { connection } from "next/server";
import { AvisoInstalarIphone } from "./_pwa/AvisoInstalarIphone";

// A vitrine chega na F2. Até lá, a página inicial apresenta a marca e a oferta.
export default async function Inicio() {
  await connection();
  return (
    <>
      <AvisoInstalarIphone />
      <section className="grid gap-4 px-4 pb-4 pt-8">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.16em] text-tinta-suave">Em breve</p>
        <h1 className="m-0 font-display text-[46px] font-extrabold leading-[0.92] tracking-tight">Welcome to the Club.</h1>
        <p className="m-0 max-w-prose text-[15px] text-tinta-suave">
          Estampas próprias, algodão macio e um jeito leve de se vestir. A loja abre em breve.
        </p>
        <div className="mt-4 grid gap-3.5 rounded-cartao bg-rosa-bruma px-4 py-6">
          <p className="m-0 font-display text-[44px] font-extrabold leading-[0.9]">
            <small className="mb-1.5 block font-texto text-[13px] font-semibold uppercase tracking-[0.14em] text-tinta-suave">Monte seu Club</small>
            3 por<br />R$ 119,99
          </p>
          <p className="m-0 text-sm">Cada 3 camisetas saem por R$ 119,99, cerca de R$ 40 cada.</p>
        </div>
      </section>
    </>
  );
}
