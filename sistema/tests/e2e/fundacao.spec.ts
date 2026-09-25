import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const LOJA = "http://localhost:3000";
const PAINEL = "http://localhost:3001";

async function semViolacoes(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Falha se a página violar a CSP (script sem nonce, recurso de fora etc.). */
function vigiarCsp(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|CSP/i.test(m.text())) erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

for (const [nome, base] of [["loja", LOJA], ["painel", PAINEL]] as const) {
  test.describe(nome, () => {
    test("página inicial: cabeçalhos de segurança, CSP respeitada e sem violação de acessibilidade", async ({ page }) => {
      const erros = vigiarCsp(page);
      const resposta = await page.goto(`${base}/`);
      const h = resposta!.headers();
      expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["strict-transport-security"]).toContain("includeSubDomains");
      expect(h["x-powered-by"]).toBeUndefined();
      await expect(page.locator("main")).toBeVisible();
      await semViolacoes(page);
      expect(erros).toEqual([]);
    });

    test("componentes: acessibilidade e comparação visual", async ({ page }) => {
      const erros = vigiarCsp(page);
      await page.goto(`${base}/_componentes`);
      await page.evaluate(() => document.fonts.ready);
      await semViolacoes(page);
      await expect(page).toHaveScreenshot(`componentes-${nome}-claro.png`, { fullPage: true });
      expect(erros).toEqual([]);
    });

    test("repasse /api responde no formato padrão e sem cache", async ({ request }) => {
      const r = await request.get(`${base}/api/v1/health`);
      expect(r.headers()["cache-control"]).toBe("no-store");
      const corpo = await r.json();
      expect(corpo.ok === true || typeof corpo.erro?.codigo === "string").toBe(true);
    });
  });
}

test("painel no tema escuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${PAINEL}/_componentes`);
  await page.evaluate(() => document.fonts.ready);
  await semViolacoes(page);
  await expect(page).toHaveScreenshot("componentes-painel-escuro.png", { fullPage: true });
});

test("a loja ignora o tema escuro do aparelho (D21)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${LOJA}/`);
  const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fundo).toBe("rgb(255, 252, 250)");
});

test("link da reserva sem referrer", async ({ request }) => {
  const r = await request.get(`${LOJA}/r`, { failOnStatusCode: false });
  expect(r.headers()["referrer-policy"]).toBe("no-referrer");
});
