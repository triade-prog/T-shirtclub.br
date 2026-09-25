// Gera os arquivos da marca a partir do logo oficial (docs/design/marca/logo-original.webp):
// tira o fundo rosa-claro (preenchimento a partir das bordas, parando no contorno verde),
// recorta a sobra e grava logo, favicon e ícones do app em apps/*/public/marca.
// Uso: node scripts/gerar-marca.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "../docs/design/marca/logo-original.webp");

const { data, info } = await sharp(origem).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const fundo = [data[0], data[1], data[2]];
const dist = (i) => Math.hypot(data[i] - fundo[0], data[i + 1] - fundo[1], data[i + 2] - fundo[2]);

// Preenche a partir das bordas tudo o que é parecido com o fundo.
const LIMITE = 28, BORDA = 70;
const visto = new Uint8Array(W * H);
const fila = [];
for (let x = 0; x < W; x++) fila.push([x, 0], [x, H - 1]);
for (let y = 0; y < H; y++) fila.push([0, y], [W - 1, y]);
while (fila.length) {
  const [x, y] = fila.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const k = y * W + x;
  if (visto[k]) continue;
  const d = dist(k * 4);
  if (d > BORDA) continue;
  visto[k] = 1;
  // Suaviza a borda: quanto mais perto do fundo, mais transparente.
  data[k * 4 + 3] = d <= LIMITE ? 0 : Math.round(255 * (d - LIMITE) / (BORDA - LIMITE));
  if (d <= LIMITE) fila.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

const logo = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 0 }).png().toBuffer();
const meta = await sharp(logo).metadata();

for (const app of ["web", "admin"]) {
  const pasta = join(raiz, "apps", app, "public", "marca");
  mkdirSync(pasta, { recursive: true });
  await sharp(logo).resize({ width: 480 }).webp({ quality: 88 }).toFile(join(pasta, "logo.webp"));
  await sharp(logo).resize({ width: 480 }).png({ compressionLevel: 9 }).toFile(join(pasta, "logo.png"));
  // Ícones quadrados: logo centralizado no rosa-bruma da marca.
  const quadrado = async (lado, margem, arquivo) => {
    const interno = Math.round(lado * (1 - 2 * margem));
    const img = await sharp(logo).resize({ width: interno, height: interno, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    await sharp({ create: { width: lado, height: lado, channels: 4, background: "#FDE7EF" } })
      .composite([{ input: img, gravity: "center" }]).png().toFile(join(pasta, arquivo));
  };
  await quadrado(32, 0.02, "favicon-32.png");
  await quadrado(180, 0.08, "apple-touch-icon.png");
  await quadrado(192, 0.06, "icone-192.png");
  await quadrado(512, 0.06, "icone-512.png");
  await quadrado(512, 0.16, "icone-512-maskable.png");
}
console.log(`logo recortado: ${meta.width}x${meta.height}`);
