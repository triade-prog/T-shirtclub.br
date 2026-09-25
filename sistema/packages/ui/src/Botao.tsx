import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./classes.ts";

export type VarianteBotao = "principal" | "escuro" | "contorno" | "link";

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  cheio?: boolean;
  carregando?: boolean;
  icone?: ReactNode;
}

const VARIANTES: Record<VarianteBotao, string> = {
  // Rosa da marca com texto escuro (4,6:1) e a base mais escura: "afunda" ao tocar.
  principal: "bg-rosa text-no-rosa shadow-[0_3px_0_var(--tc-rosa-press)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--tc-rosa-press)]",
  escuro: "bg-tinta text-papel",
  contorno: "bg-transparent text-tinta shadow-[inset_0_0_0_1.5px_var(--tc-tinta)]",
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
        "inline-flex items-center justify-center gap-2.5 rounded-pilula font-texto text-base font-semibold leading-tight",
        variante !== "link" && "min-h-13 px-6 py-2 mb-[3px]",
        // Desabilitado troca a cor inteira (cinza-algodão); carregando mantém a cor e mostra o giro.
        disabled && !carregando ? (variante === "link" ? "cursor-not-allowed text-tinta-suave" : "cursor-not-allowed bg-algodao text-tinta-suave") : VARIANTES[variante],
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
