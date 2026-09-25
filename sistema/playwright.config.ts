import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta no celular (Android e iPhone), axe e comparação visual dos componentes.
// Local: os apps já rodando em 3000/3001 (next start). CI: o webServer sobe os dois.
const chromiumLocal = process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  snapshotPathTemplate: "tests/e2e/__telas__/{testFilePath}/{arg}-{projectName}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" } },
  use: { trace: "retain-on-failure", ...chromiumLocal },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"], ...chromiumLocal } },
    { name: "iphone", use: { ...devices["iPhone 14"], browserName: "chromium", ...chromiumLocal } },
  ],
  webServer: process.env.CI
    ? [
        { command: "pnpm --filter @tshirtclub/web start", url: "http://localhost:3000/_componentes", reuseExistingServer: false, env: { MOSTRAR_COMPONENTES: "1" } },
        { command: "pnpm --filter @tshirtclub/admin start", url: "http://localhost:3001/_componentes", reuseExistingServer: false, env: { MOSTRAR_COMPONENTES: "1" } },
      ]
    : undefined,
});
