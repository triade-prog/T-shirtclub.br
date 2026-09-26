import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./classes.ts";

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  rotulo: string;
  ajuda?: string;
  erro?: string;
  id?: string;
}

/** Campo com rótulo visível, ajuda e erro ligados por aria-describedby; erro junto do campo (G19). */
export function Campo({ rotulo, ajuda, erro, id, className, ...resto }: CampoProps) {
  const auto = useId();
  const idCampo = id ?? auto;
  const idAjuda = ajuda ? `${idCampo}-ajuda` : undefined;
  const idErro = erro ? `${idCampo}-erro` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={idCampo} className="text-[15px] font-semibold">{rotulo}</label>
      <input
        id={idCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[idErro, idAjuda].filter(Boolean).join(" ") || undefined}
        className={cx(
          "min-h-13 w-full rounded-campo border-2 border-tinta bg-branco px-4 text-base text-tinta shadow-adesivo-sm",
          erro && "border-erro shadow-[2px_2px_0_var(--tc-erro)]",
          className,
        )}
        {...resto}
      />
      {erro && <p id={idErro} className="m-0 text-sm font-semibold text-erro">{erro}</p>}
      {ajuda && <p id={idAjuda} className="m-0 text-sm text-tinta-suave">{ajuda}</p>}
    </div>
  );
}
