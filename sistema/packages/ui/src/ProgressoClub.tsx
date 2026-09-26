import { cx } from "./classes.ts";

export interface ProgressoClubProps {
  /** Peças na sacola; o Club fecha a cada 3. */
  pecas: number;
  titulo: string;
  texto?: string;
  /** Rótulos dos três passos; o padrão é "1ª peça", "2ª peça", "3ª peça". */
  rotulos?: [string, string, string];
  className?: string;
}

/**
 * Progresso do Club (D24): cartão citrino com os três passos. Conta dentro do trio atual
 * (4 peças = 1 de 3 no segundo Club); com o trio fechado, os três ficam feitos.
 */
export function ProgressoClub({ pecas, titulo, texto, rotulos = ["1ª peça", "2ª peça", "3ª peça"], className }: ProgressoClubProps) {
  const noTrio = pecas > 0 && pecas % 3 === 0 ? 3 : pecas % 3;
  return (
    <section
      aria-label={`Monte seu Club: ${noTrio} de 3`}
      className={cx("rounded-cartao border-2 border-no-citrino bg-citrino p-5 text-no-citrino shadow-adesivo-lg", className)}
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <h3 className="m-0 font-editorial text-[25px] font-bold leading-tight tracking-[-0.035em]">{titulo}</h3>
          {texto && <p className="m-0 mt-1 text-sm text-[#4a441a]">{texto}</p>}
        </div>
        <b className="font-display text-2xl font-extrabold" aria-hidden="true">{noTrio}/3</b>
      </div>
      <ol className="relative m-0 mt-4 grid list-none grid-cols-3 gap-2 p-0 before:absolute before:left-[16%] before:right-[16%] before:top-5 before:h-px before:bg-no-citrino/30">
        {rotulos.map((rotulo, i) => {
          const feito = i < noTrio;
          const atual = i === noTrio;
          return (
            <li key={rotulo} className="relative z-10 grid justify-items-center gap-1.5 text-center">
              <span
                aria-hidden="true"
                className={cx(
                  "grid size-10 place-items-center rounded-full border-2 border-no-citrino font-display text-sm font-extrabold text-no-citrino",
                  feito ? "bg-rosa" : "bg-[#fff9f5]",
                )}
              >
                {feito ? "✓" : i + 1}
              </span>
              <span className={cx("text-[10px] font-bold uppercase tracking-[0.1em]", feito || atual ? "text-no-citrino" : "text-[#4a441a]")}>
                {rotulo}
                <span className="sr-only">{feito ? ": escolhida" : atual ? ": a próxima" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
