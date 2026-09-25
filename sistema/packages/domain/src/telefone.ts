// Telefone da cliente: a identidade no sistema. Guardado em E.164 (+55 DDD 9XXXX-XXXX).
// Só celular: o código chega pelo WhatsApp.

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type ResultadoTelefone = { ok: true; e164: string } | { ok: false; codigo: "PHONE_INVALID" };

/**
 * Normaliza o que a cliente digitou para E.164.
 * Aceita máscara, +55/55, zero de longa distância e número antigo sem o nono dígito
 * (8 dígitos começando por 6 a 9 recebe o 9 na frente). Fixo é recusado.
 */
export function normalizarTelefone(entrada: string): ResultadoTelefone {
  let d = entrada.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  else if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);

  const invalido = { ok: false, codigo: "PHONE_INVALID" } as const;
  if (d.length !== 10 && d.length !== 11) return invalido;

  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return invalido;

  let assinante = d.slice(2);
  if (assinante.length === 8) {
    if (!/^[6-9]/.test(assinante)) return invalido; // fixo
    assinante = "9" + assinante;
  }
  if (!/^9[1-9]\d{7}$/.test(assinante)) return invalido;
  if (/^(\d)\1+$/.test(assinante)) return invalido;

  return { ok: true, e164: `+55${ddd}${assinante}` };
}

function partes(e164: string): { ddd: string; numero: string } {
  if (!/^\+55\d{11}$/.test(e164)) throw new Error("Telefone fora do formato E.164 esperado");
  return { ddd: e164.slice(3, 5), numero: e164.slice(5) };
}

/** (77) 99812-8809 */
export function formatarTelefone(e164: string): string {
  const { ddd, numero } = partes(e164);
  return `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
}

/** (77) •••••-8809: como o telefone aparece nas telas e mensagens. */
export function mascararTelefone(e164: string): string {
  const { ddd, numero } = partes(e164);
  return `(${ddd}) •••••-${numero.slice(-4)}`;
}

/**
 * O WhatsApp às vezes identifica números brasileiros sem o nono dígito (5577 9812 8809).
 * Retorna as duas formas (sem o "+") para comparar com o remetente do webhook (G4).
 */
export function variantesWhatsApp(e164: string): [string, string] {
  const { ddd, numero } = partes(e164);
  return [`55${ddd}${numero}`, `55${ddd}${numero.slice(1)}`];
}

/** Compara o remetente do WhatsApp (só dígitos, com ou sem o 9) com o telefone da reserva. */
export function mesmoTelefone(remetenteWa: string, e164: string): boolean {
  const d = remetenteWa.replace(/\D/g, "");
  return variantesWhatsApp(e164).includes(d);
}
