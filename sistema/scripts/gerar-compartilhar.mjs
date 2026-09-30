// Gera a imagem de compartilhamento da loja (Open Graph, 1200 × 630): a que aparece na prévia
// quando alguém manda o link no WhatsApp, Instagram ou Facebook. Monta a arte em HTML, com o logo,
// as fontes da marca e a arte do preço do bucket, e fotografa com o Chromium do Playwright.
// Uso (de sistema/): node scripts/gerar-compartilhar.mjs
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const saida = join(raiz, "apps/web/public/marca/compartilhar.png");
const ORIGEM = process.env.ORIGEM_IMAGENS ?? "https://woetzyiutwrpxgeiecsu.supabase.co";
const ARTE_PRECO = `${ORIGEM}/storage/v1/object/public/catalogo/imagens%20site/lettering-preco-119-99.webp`;

const logo = `data:image/png;base64,${readFileSync(join(raiz, "apps/web/public/marca/logo-limao.png")).toString("base64")}`;
const arte = await fetch(ARTE_PRECO);
if (!arte.ok) throw new Error(`Arte do preço respondeu ${arte.status}`);
const preco = `data:image/webp;base64,${Buffer.from(await arte.arrayBuffer()).toString("base64")}`;

// As fontes vão embutidas: o Chromium não passa pelos certificados do proxy como o Node
const FONTES = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;1,9..144,680&family=Poppins:wght@600&display=block";
let css = await (await fetch(FONTES, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36" } })).text();
for (const url of new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) ?? [])) {
  const fonte = Buffer.from(await (await fetch(url)).arrayBuffer()).toString("base64");
  css = css.replaceAll(url, `data:font/woff2;base64,${fonte}`);
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${css}</style>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fff9f5; color: #26191e; font-family: Poppins, sans-serif; overflow: hidden; }
  .topo { display: grid; grid-template-columns: 470px 1fr; align-items: center; gap: 40px; height: 540px; padding: 0 64px; }
  .logo { width: 470px; height: auto; }
  .sobre { font-size: 17px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: #6b5d62; }
  h1 { font-family: Fraunces, serif; font-weight: 700; font-size: 66px; line-height: 1.02; letter-spacing: -0.035em; margin-top: 14px; }
  h1 em { font-style: italic; font-weight: 680; color: #e8478a; }
  .oferta { display: flex; align-items: center; gap: 16px; margin-top: 30px; font-family: Fraunces, serif; font-style: italic; font-weight: 680; font-size: 40px; letter-spacing: -0.03em; }
  .tres { display: inline-block; font-size: 1.6em; line-height: 0.7; color: #e8478a; transform: rotate(-6deg); paint-order: stroke fill;
    -webkit-text-stroke: 0.05em #26191e; text-shadow: 0.045em 0.05em 0 #26191e; margin-right: 6px; }
  .oferta img { height: 96px; transform: rotate(-3deg); }
  .faixa { height: 90px; border-top: 3px solid #26191e; background: #dff04a; display: flex; align-items: center; justify-content: space-between; padding: 0 64px;
    font-size: 24px; font-weight: 600; }
</style></head><body>
  <div class="topo">
    <img class="logo" src="${logo}" alt="">
    <div>
      <p class="sobre">Caetité · Bahia</p>
      <h1>Camisetas com<br>estampa <em>própria.</em></h1>
      <p class="oferta"><span><b class="tres">3</b> T-shirts por</span><img src="${preco}" alt=""></p>
    </div>
  </div>
  <div class="faixa"><span>Monte seu Club</span><span>tshirtclub.vercel.app</span></div>
</body></html>`;

// Fora do container do Playwright, CHROMIUM aponta para um Chromium já instalado
const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
await pagina.setContent(html, { waitUntil: "networkidle" });
await pagina.evaluate(() => globalThis.document.fonts.ready);
const png = await pagina.screenshot({ type: "png" });
await navegador.close();
await sharp(png).png({ compressionLevel: 9, palette: false }).toFile(saida);
console.log(`Gerado ${saida}`);
