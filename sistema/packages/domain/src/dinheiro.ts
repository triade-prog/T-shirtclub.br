// Valores sempre em centavos (inteiros), como no banco.

const formato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 11999 → "R$ 119,99" (com espaço comum no lugar do espaço inseparável do Intl). */
export function formatarReais(centavos: number): string {
  if (!Number.isInteger(centavos)) throw new Error("Valor em centavos precisa ser inteiro");
  return formato.format(centavos / 100).replace(/\u00a0/g, " ");
}
