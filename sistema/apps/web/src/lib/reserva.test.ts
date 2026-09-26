import { describe, expect, it } from "vitest";
import { calcularRelogio, formatarTempo } from "./reserva";

const criada = "2026-09-26T17:00:00.000Z";
const expira = "2026-09-26T17:15:00.000Z";
const tolerancia = "2026-09-26T17:20:00.000Z";
const em = (iso: string) => Date.parse(iso);

describe("relógio da reserva", () => {
  it("no prazo: tempo restante e fração", () => {
    const r = calcularRelogio(criada, expira, tolerancia, em("2026-09-26T17:03:36.000Z"));
    expect(r.fase).toBe("PRAZO");
    expect(formatarTempo(r.restanteMs)).toBe("11:24");
    expect(r.fracao).toBeCloseTo(0.76, 2);
  });

  it("depois dos 15 min, tolerância; depois dela, fim", () => {
    expect(calcularRelogio(criada, expira, tolerancia, em("2026-09-26T17:16:00.000Z"))).toMatchObject({ fase: "TOLERANCIA", fracao: 0 });
    expect(calcularRelogio(criada, expira, tolerancia, em("2026-09-26T17:20:00.000Z"))).toEqual({ fase: "FIM", restanteMs: 0, fracao: 0 });
    expect(calcularRelogio(criada, expira, null, em("2026-09-26T17:15:00.000Z")).fase).toBe("FIM");
  });

  it("formata e arredonda para cima", () => {
    expect(formatarTempo(0)).toBe("00:00");
    expect(formatarTempo(-5)).toBe("00:00");
    expect(formatarTempo(59_001)).toBe("01:00");
    expect(formatarTempo(900_000)).toBe("15:00");
  });
});
