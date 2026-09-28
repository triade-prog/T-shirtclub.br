import type { ReactNode } from "react";
import { Sobretitulo } from "./Selo.tsx";

/** Seção do início (vitrines, Almost Gone, Shop the Look): sobretítulo, título grande e o conteúdo. */
export function SecaoVitrine({ id, sobretitulo, titulo, children }: { id?: string; sobretitulo: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="px-3.5 py-12 md:px-5 md:py-20">
      <Sobretitulo>{sobretitulo}</Sobretitulo>
      <h2 className="tc-titulo m-0 mb-7 mt-2 text-[clamp(38px,5.2vw,68px)]">{titulo}</h2>
      {children}
    </section>
  );
}
