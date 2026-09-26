// Relógio da reserva (regra 7, D5): 15 min para pagar e mais 5 de tolerância, sempre pelo
// relógio do servidor (a tela corrige o desvio do aparelho com o "agora" da API).

export type FaseRelogio = "PRAZO" | "TOLERANCIA" | "FIM";

export interface Relogio {
  fase: FaseRelogio;
  /** Até o fim do prazo (na tolerância, até o fim dela). */
  restanteMs: number;
  /** Quanto do prazo ainda resta, de 0 a 1 (a costura da V4). */
  fracao: number;
}

export function calcularRelogio(criadaEm: string, expiraEm: string, toleranciaAte: string | null, agoraMs: number): Relogio {
  const inicio = Date.parse(criadaEm);
  const fim = Date.parse(expiraEm);
  const tolerancia = toleranciaAte ? Date.parse(toleranciaAte) : fim;
  if (agoraMs < fim) return { fase: "PRAZO", restanteMs: fim - agoraMs, fracao: Math.min(1, (fim - agoraMs) / Math.max(1, fim - inicio)) };
  if (agoraMs < tolerancia) return { fase: "TOLERANCIA", restanteMs: tolerancia - agoraMs, fracao: 0 };
  return { fase: "FIM", restanteMs: 0, fracao: 0 };
}

/** "11:24" (minutos e segundos), sem passar de 99:59. */
export function formatarTempo(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.min(99, Math.floor(total / 60));
  return `${String(m).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
