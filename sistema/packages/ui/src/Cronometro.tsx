import { cx } from "./classes.ts";
import { formatarTempo, type Relogio } from "./relogio.ts";

export interface CronometroProps {
  relogio: Relogio;
  /** A hora do fim do prazo, já formatada ("14:32"). */
  ate: string;
  className?: string;
}

/**
 * Cronômetro da reserva (tela 7, D5): o tempo que falta, a hora do fim e a costura da V4, que
 * some da direita para a esquerda. Só exibe; o relógio vem de `calcularRelogio`.
 */
export function Cronometro({ relogio, ate, className }: CronometroProps) {
  const fim = relogio.fase !== "PRAZO";
  // Leitor de tela (F4.3): o texto só muda aos 5 minutos e no fim, então só fala nessas horas.
  const reta = relogio.restanteMs <= 5 * 60_000;
  return (
    <div className={cx("grid gap-2 rounded-[18px] border-2 border-tinta bg-citrino p-4 text-no-citrino shadow-adesivo-sm", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("font-display text-[44px] font-extrabold leading-none tabular-nums", fim && "text-tinta-suave")} aria-hidden="true">
          {fim ? "00:00" : formatarTempo(relogio.restanteMs)}
        </span>
        <span className="text-sm font-semibold">{fim ? `terminou às ${ate}` : `guardado até ${ate}`}</span>
      </div>
      <p className="sr-only" role="timer" aria-live="polite">
        {fim ? "O prazo para pagar terminou." : reta ? `Faltam menos de 5 minutos para pagar, até ${ate}.` : `Você tem até ${ate} para pagar.`}
      </p>
      <div className="h-2.5 overflow-hidden rounded-pilula border-[1.5px] border-tinta bg-papel">
        <i className="block h-full bg-rosa transition-[width] duration-1000 ease-linear motion-reduce:transition-none" style={{ width: `${Math.round(relogio.fracao * 100)}%` }} />
      </div>
    </div>
  );
}
