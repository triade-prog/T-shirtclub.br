import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// PWA da loja (F11.6): service worker só com a casca e as imagens, página sem conexão e o
// aviso de instalação no iPhone.
const LOJA = "http://localhost:3000";

test.describe("PWA da loja", () => {
  test("manifesto, service worker só com a casca e página sem conexão", async ({ page, context }) => {
    await page.goto(`${LOJA}/`);
    const manifesto = await (await page.request.get(`${LOJA}/manifest.webmanifest`)).json();
    expect([manifesto.display, manifesto.start_url, manifesto.icons.length]).toEqual(["standalone", "/", 3]);

    expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active))).toBe(true);
    await page.reload();
    await page.request.get(`${LOJA}/api/v1/health`).catch(() => undefined);
    const guardados = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const nome of await caches.keys()) for (const r of await (await caches.open(nome)).keys()) urls.push(new URL(r.url).pathname);
      return urls;
    });
    expect(guardados).toContain("/offline");
    expect(guardados.filter((u) => u.startsWith("/api/") || u === "/r" || u === "/")).toEqual([]);

    await context.setOffline(true);
    await page.goto(`${LOJA}/qualquer-pagina`);
    await expect(page.getByRole("heading", { name: "Sem conexão agora" })).toBeVisible();
    await context.setOffline(false);
  });

  test("página sem conexão acessível", async ({ page }) => {
    await page.goto(`${LOJA}/offline`);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations).toEqual([]);
  });

  test("aviso de instalação só no iPhone, e some quando a cliente dispensa", async ({ page }, info) => {
    await page.goto(`${LOJA}/`);
    const aviso = page.getByText("Tenha a loja na tela do seu iPhone");
    if (info.project.name !== "iphone") {
      await expect(aviso).toHaveCount(0);
      return;
    }
    await expect(aviso).toBeVisible();
    await page.getByRole("button", { name: "Agora não" }).click();
    await expect(aviso).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: /FAZ O/ })).toBeVisible();
    await page.waitForTimeout(500); // o aviso decide depois da hidratação
    await expect(aviso).toHaveCount(0);
  });
});
