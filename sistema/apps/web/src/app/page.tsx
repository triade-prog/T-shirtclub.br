import { connection } from "next/server";
import { Selo, Sobretitulo } from "@tshirtclub/ui";
import { AvisoInstalarIphone } from "./_pwa/AvisoInstalarIphone";

// A vitrine chega com as telas da F2. Até lá, a página inicial apresenta a marca e a oferta,
// já na linguagem V4 (D24).
export default async function Inicio() {
  await connection();
  return (
    <>
      <AvisoInstalarIphone />
      <section className="grid gap-6 border-b-3 border-tinta bg-rosa-bruma px-4 pb-12 pt-12 md:px-10">
        <Selo className="w-fit">Em breve · Drop 01</Selo>
        <h1 className="tc-titulo m-0 font-texto text-[64px] font-extrabold leading-[0.8] tracking-[-0.075em] md:text-[110px]">
          VOCÊ<br />FAZ O<br /><em className="tc-marca">Club.</em>
        </h1>
        <p className="m-0 max-w-[23ch] font-editorial text-[22px] italic leading-tight text-tinta-suave">
          Uma T-shirt. Vários jeitos de usar. Nenhum jeito obrigatório.
        </p>
      </section>
      <section id="monte-club" className="grid gap-4 px-4 py-12 md:px-10">
        <Sobretitulo>Monte seu Club</Sobretitulo>
        <div className="grid max-w-xl gap-2 rounded-cartao border-2 border-tinta bg-rosa p-6 text-no-rosa shadow-adesivo-lg">
          <p className="m-0 font-display text-[44px] font-extrabold leading-[0.9] tracking-[-0.045em]">3 por R$ 119,99</p>
          <p className="m-0 text-sm">Cada 3 camisetas saem por R$ 119,99, cerca de R$ 40 cada. Sem cupom: o preço entra sozinho.</p>
        </div>
      </section>
    </>
  );
}
