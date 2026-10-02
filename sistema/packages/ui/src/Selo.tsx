import type { ReactNode } from "react";
import { cx } from "./classes.ts";

export type FundoSelo = "papel" | "citrino" | "rosa";

const FUNDO: Record<FundoSelo, string> = { papel: "bg-papel text-tinta", citrino: "bg-citrino text-no-citrino", rosa: "bg-rosa text-no-rosa" };

const TAMANHO = {
  normal: "gap-[7px] px-2.5 py-[7px] text-[10px] tracking-[0.13em]",
  // No cartão da vitrine (02/10): menor no celular, onde o selo cobria boa parte da foto
  // e quebrava em duas linhas; o brilho só aparece a partir do tablet
  compacto: "gap-[7px] px-[7px] py-[5px] text-[8px] tracking-[0.06em] md:px-2.5 md:py-[7px] md:text-[10px] md:tracking-[0.13em]",
};

export interface SeloProps {
  children: ReactNode;
  fundo?: FundoSelo;
  tamanho?: keyof typeof TAMANHO;
  /** O brilho rosa da marca antes do texto (some no fundo rosa). */
  brilho?: boolean;
  className?: string;
}

/** Club Tag (D24): etiqueta de adesivo para drop, "últimas 2", progresso etc. */
export function Selo({ children, fundo = "papel", brilho = true, tamanho = "normal", className }: SeloProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-selo border-[1.8px] border-tinta font-bold uppercase leading-none shadow-adesivo-sm",
        TAMANHO[tamanho],
        FUNDO[fundo],
        className,
      )}
    >
      {brilho && fundo !== "rosa" && <span aria-hidden="true" className={cx("tc-brilho", tamanho === "compacto" && "hidden md:block")} />}
      {children}
    </span>
  );
}

/** Sobretítulo com a fita citrino, acima dos títulos de seção. */
export function Sobretitulo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("tc-sobretitulo text-tinta", className)}>{children}</span>;
}
