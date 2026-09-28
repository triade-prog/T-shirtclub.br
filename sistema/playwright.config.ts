import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta no celular (Android e iPhone), axe e comparação visual dos componentes.
// Local: os apps já rodando em 3000/3001 (next start). CI: o webServer sobe os dois.
// A jornada da cliente (jornada.spec.ts) usa uma loja na 3003 ligada à api-public falsa
// (4010), que o webServer sobe também no local se não estiverem rodando. O build precisa de
// ORIGEM_IMAGENS=http://127.0.0.1:4010 para as fotos da api falsa passarem pelo next/image.
const JORNADA = { SUPABASE_FUNCTIONS_URL: "http://127.0.0.1:4010", REPASSE_SEGREDO: "e2e", ORIGEM_IMAGENS: "http://127.0.0.1:4010", WHATSAPP_LOJA: "5577998155772", REVALIDAR_SEGREDO: "e2e-revalidar" };
const servidoresJornada = [
  { command: "node tests/e2e/api-falsa/api-publica.mjs 4010", url: "http://127.0.0.1:4010/saude", reuseExistingServer: !process.env.CI },
  { command: "pnpm --filter @tshirtclub/web exec next start --port 3003", url: "http://localhost:3003/offline", reuseExistingServer: !process.env.CI, env: JORNADA },
  // A mesma loja com a conta do Google Ads configurada (anuncios.spec.ts): aviso de cookies, tag e conversão
  { command: "pnpm --filter @tshirtclub/web exec next start --port 3004", url: "http://localhost:3004/offline", reuseExistingServer: !process.env.CI,
    env: { ...JORNADA, GOOGLE_ADS_ID: "AW-123456789", GOOGLE_ADS_ROTULO_COMPRA: "compraTeste1" } },
];
const chromiumLocal = process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  snapshotPathTemplate: "tests/e2e/__telas__/{testFilePath}/{arg}-{projectName}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" } },
  // O pop-up da Lista VIP fica "fechado há pouco" em todos os testes; vip.spec.ts começa sem isso
  use: { trace: "retain-on-failure", storageState: "tests/e2e/estado-inicial.json", ...chromiumLocal },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"], ...chromiumLocal } },
    { name: "iphone", use: { ...devices["iPhone 14"], browserName: "chromium", ...chromiumLocal } },
  ],
  webServer: process.env.CI
    ? [
        { command: "pnpm --filter @tshirtclub/web start", url: "http://localhost:3000/_componentes", reuseExistingServer: false, env: { MOSTRAR_COMPONENTES: "1" } },
        { command: "pnpm --filter @tshirtclub/admin start", url: "http://localhost:3001/_componentes", reuseExistingServer: false, env: { MOSTRAR_COMPONENTES: "1" } },
        ...servidoresJornada,
      ]
    : servidoresJornada,
});
