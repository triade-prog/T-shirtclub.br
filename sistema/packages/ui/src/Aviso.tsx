import type { ReactNode } from "react";
import { cx } from "./classes.ts";

export type TipoAviso = "info" | "marca" | "ok" | "atencao" | "erro";

const ESTILO: Record<TipoAviso, { caixa: string; icone: string; simbolo: string }> = {
  info: { caixa: "bg-info-fundo", icone: "text-info", simbolo: "i" },
  marca: { caixa: "bg-rosa-bruma", icone: "text-tinta", simbolo: "i" },
  ok: { caixa: "bg-ok-fundo", icone: "text-ok", simbolo: "✓" },
  atencao: { caixa: "bg-aviso-fundo", icone: "text-aviso", simbolo: "!" },
  erro: { caixa: "bg-erro-fundo", icone: "text-erro", simbolo: "!" },
};

export interface AvisoProps {
  tipo?: TipoAviso;
  titulo: string;
  children?: ReactNode;
  /** Erros e atenções são anunciados na hora pelo leitor de tela. */
  anunciar?: boolean;
}

/** Aviso sempre com ícone e texto: a cor nunca é a única pista. */
export function Aviso({ tipo = "info", titulo, children, anunciar }: AvisoProps) {
  const e = ESTILO[tipo];
  const urgente = tipo === "erro" || tipo === "atencao";
  return (
    <div role={anunciar ? (urgente ? "alert" : "status") : undefined} className={cx("grid grid-cols-[auto_1fr] gap-2.5 rounded-campo border-2 border-tinta px-3.5 py-3 text-[15px] text-tinta shadow-adesivo-sm", e.caixa)}>
      <span aria-hidden="true" className={cx("mt-0.5 grid size-5 place-items-center rounded-full border-2 border-current text-xs font-bold", e.icone)}>{e.simbolo}</span>
      <div>
        <strong className="block font-semibold">{titulo}</strong>
        {children}
      </div>
    </div>
  );
}
