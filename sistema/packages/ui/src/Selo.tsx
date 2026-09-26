import type { ReactNode } from "react";
import { cx } from "./classes.ts";

export type FundoSelo = "papel" | "citrino" | "rosa";

const FUNDO: Record<FundoSelo, string> = { papel: "bg-papel text-tinta", citrino: "bg-citrino text-no-citrino", rosa: "bg-rosa text-no-rosa" };

export interface SeloProps {
  children: ReactNode;
  fundo?: FundoSelo;
  /** O brilho rosa da marca antes do texto (some no fundo rosa). */
  brilho?: boolean;
  className?: string;
}

/** Club Tag (D24): etiqueta de adesivo para drop, "últimas 2", progresso etc. */
export function Selo({ children, fundo = "papel", brilho = true, className }: SeloProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[7px] rounded-selo border-[1.8px] border-tinta px-2.5 py-[7px] text-[10px] font-bold uppercase leading-none tracking-[0.13em] shadow-adesivo-sm",
        FUNDO[fundo],
        className,
      )}
    >
      {brilho && fundo !== "rosa" && <span aria-hidden="true" className="tc-brilho" />}
      {children}
    </span>
  );
}

/** Sobretítulo com a fita citrino, acima dos títulos de seção. */
export function Sobretitulo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("tc-sobretitulo text-tinta", className)}>{children}</span>;
}
