import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Início (28/09) na loja com catálogo (3003, api falsa com 2 coleções com capa): a capa vira um
// carrossel com um slide por coleção, com pausa e escolha do slide, e o bloco de coleções vira
// uma linha de atalhos.
const LOJA = "http://localhost:3003";

test("início: carrossel das capas com pausa, escolha do slide e axe", async ({ page }) => {
  await page.goto(`${LOJA}/`);
  const carrossel = page.getByRole("region", { name: "Coleções em destaque" });
  await expect(carrossel.getByRole("link", { name: /Ver Limone/ })).toHaveAttribute("href", "/colecao/limone");
  await expect(carrossel.getByRole("img", { name: "Campanha Limone" })).toBeVisible();

  await carrossel.getByRole("button", { name: "Pausar o carrossel" }).click();
  await expect(carrossel.getByRole("button", { name: "Continuar o carrossel" })).toBeVisible();
  await carrossel.getByRole("button", { name: "Mostrar Sardines Club" }).click();
  await expect(carrossel.getByRole("button", { name: "Mostrar Sardines Club" })).toHaveAttribute("aria-current", "true");
  // Só o slide da vez fica acessível: o outro sai do foco e do leitor de tela
  await expect(carrossel.getByRole("link", { name: /Ver Sardines Club/ })).toHaveAttribute("href", "/colecao/sardines-club");
  await expect(carrossel.getByRole("link", { name: /Ver Limone/ })).toHaveCount(0);

  const colecoes = page.getByRole("region", { name: "Coleções" });
  await expect(colecoes.getByRole("link", { name: "Limone" })).toHaveAttribute("href", "/colecao/limone");

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("início: troca sozinho; com movimento reduzido, começa parado", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(`${LOJA}/`);
  const carrossel = page.getByRole("region", { name: "Coleções em destaque" });
  await expect(carrossel.getByRole("button", { name: "Mostrar Sardines Club" })).toHaveAttribute("aria-current", "true", { timeout: 9_000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${LOJA}/`);
  await expect(page.getByRole("button", { name: "Continuar o carrossel" })).toBeVisible();
});
