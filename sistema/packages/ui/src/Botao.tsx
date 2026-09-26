import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./classes.ts";

export type VarianteBotao = "principal" | "escuro" | "citrino" | "contorno" | "link";

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  cheio?: boolean;
  carregando?: boolean;
  icone?: ReactNode;
}

// Adesivo (D24): contorno de 2px e sombra dura; sobe um pouco no hover e afunda ao tocar.
const ADESIVO =
  "border-2 border-tinta shadow-adesivo transition-[translate,box-shadow] duration-150 hover:-translate-px hover:shadow-[4px_4px_0_var(--tc-tinta)] active:translate-0.5 active:shadow-[1px_1px_0_var(--tc-tinta)]";

const VARIANTES: Record<VarianteBotao, string> = {
  // Rosa da marca com texto escuro (4,6:1)
  principal: cx(ADESIVO, "bg-rosa text-no-rosa"),
  escuro: cx(ADESIVO, "bg-tinta text-papel"),
  citrino: cx(ADESIVO, "bg-citrino text-no-citrino"),
  contorno: cx(ADESIVO, "bg-transparent text-tinta"),
  link: "min-h-11 px-1 bg-transparent text-tinta underline decoration-rosa decoration-2 underline-offset-4",
};

export function Botao({ variante = "principal", cheio, carregando, icone, disabled, className, children, type = "button", ...resto }: BotaoProps) {
  const desabilitado = disabled || carregando;
  return (
    <button
      type={type}
      disabled={desabilitado}
      aria-busy={carregando || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2.5 rounded-pilula font-texto text-[15px] font-bold leading-tight tracking-[0.015em]",
        variante !== "link" && "min-h-13 px-6 py-2 mb-[3px] mr-[3px]",
        // Desabilitado troca a cor inteira (cinza-algodão); carregando mantém a cor e mostra o giro.
        disabled && !carregando
          ? (variante === "link" ? "cursor-not-allowed text-tinta-suave" : "cursor-not-allowed border-2 border-dashed border-borda-campo bg-algodao text-tinta-suave")
          : VARIANTES[variante],
        carregando && "cursor-wait",
        cheio && "w-full",
        className,
      )}
      {...resto}
    >
      {carregando ? <span aria-hidden="true" className="size-4.5 animate-spin rounded-full border-3 border-current border-r-transparent" /> : icone}
      {children}
    </button>
  );
}
