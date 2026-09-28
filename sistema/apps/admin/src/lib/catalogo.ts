// Utilidades das telas de catálogo, estoque e promoções do painel (fatia 10).

/** URL pública da foto no bucket catalogo. */
export function urlFoto(caminho: string): string {
  return `${process.env.NEXT_PUBLIC_ORIGEM_IMAGENS ?? ""}/storage/v1/object/public/catalogo/${caminho}`;
}

/**
 * "49,99", "1.234,50" ou "15.50" → centavos; inválido → null. Sem vírgula, ponto seguido de
 * 1 ou 2 dígitos no fim é o decimal ("15.5" é R$ 15,50, não R$ 155).
 */
export function paraCentavos(texto: string): number | null {
  const bruto = texto.trim().replace(/^R\$\s*/, "");
  const limpo = !bruto.includes(",") && /^\d+\.\d{1,2}$/.test(bruto) ? bruto : bruto.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

/** Centavos → "49,99" (para preencher campos). */
export function paraReais(centavos: number | null | undefined): string {
  return centavos === null || centavos === undefined ? "" : (centavos / 100).toFixed(2).replace(".", ",");
}

/** "Limone Amalfi Coast" → "limone-amalfi-coast". */
export function paraSlug(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** ISO → valor de <input type="datetime-local"> no horário de Brasília (UTC-3). */
export function paraCampoData(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Valor de <input type="datetime-local"> (horário de Brasília) → ISO com -03:00. */
export function deCampoData(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor) ? `${valor}:00-03:00` : null;
}

/** Medidas "busto: 104" (uma por linha) ↔ objeto. */
export function paraMedidas(texto: string): Record<string, string | number> | null {
  const medidas: Record<string, string | number> = {};
  for (const linha of texto.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^([^:]{1,40}):\s*(.{1,60})$/.exec(linha);
    if (!m) return null;
    const valor = m[2]!.trim().replace(",", ".");
    medidas[m[1]!.trim()] = /^\d+(\.\d+)?$/.test(valor) ? Number(valor) : m[2]!.trim();
  }
  return Object.keys(medidas).length <= 20 ? medidas : null;
}
export function deMedidas(medidas: Record<string, string | number> | null | undefined): string {
  return Object.entries(medidas ?? {}).map(([k, v]) => `${k}: ${String(v).replace(".", ",")}`).join("\n");
}

/** O Safari não gera WebP no canvas (devolve PNG); a foto não pode subir com o formato errado. */
export class ErroSemWebp extends Error {}
export const TEXTO_SEM_WEBP = "Este navegador não converte fotos para WebP (o Safari não converte). Envie pelo Chrome, Edge ou Firefox.";

/**
 * Foto escolhida → WebP de até 1600 px no lado maior (as fotos do catálogo são WebP, 4:5,
 * cerca de 35 KB na loja). Só no navegador.
 */
export async function paraWebp(arquivo: File, maiorLado = 1600): Promise<{ blob: Blob; largura: number; altura: number }> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, maiorLado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  tela.getContext("2d")!.drawImage(bitmap, 0, 0, largura, altura);
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/webp", 0.85));
  if (!blob) throw new Error("webp");
  if (blob.type !== "image/webp") throw new ErroSemWebp();
  return { blob, largura, altura };
}

/** Envia o arquivo para a URL assinada do Storage (PUT direto, não passa pela Vercel). */
export async function enviarArquivo(url: string, blob: Blob): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "PUT", headers: { "content-type": "image/webp", "x-upsert": "false" }, body: blob });
    return r.ok;
  } catch {
    return false;
  }
}
