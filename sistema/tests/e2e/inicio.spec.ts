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
  await carrossel.getByRole("button", { name: "Mostrar Riviera" }).click();
  await expect(carrossel.getByRole("button", { name: "Mostrar Riviera" })).toHaveAttribute("aria-current", "true");
  // Só o slide da vez fica acessível: o outro sai do foco e do leitor de tela
  await expect(carrossel.getByRole("link", { name: /Ver Riviera/ })).toHaveAttribute("href", "/colecao/riviera");
  // Campanha ligada: a legenda vem do HTML (no celular, com o carrossel 16:9, só no computador);
  // a desligada (Limone) não tem legenda nenhuma
  await expect(carrossel.getByText("Mare, Amore!")).toHaveCount(1);
  await expect(page.getByText("Limone, Amore!")).toHaveCount(0);
  await expect(carrossel.getByRole("link", { name: /Ver Limone/ })).toHaveCount(0);

  const colecoes = page.getByRole("region", { name: "Pick your story." });
  await expect(colecoes.getByRole("link", { name: "Limone" })).toHaveAttribute("href", "/colecao/limone");
  // Pick your story (0440): a foto escolhida no painel, no lugar da peça mais nova da coleção
  await expect(colecoes.getByRole("link", { name: "Limone" }).locator("img")).toHaveAttribute("src", /limone-detalhe\.webp/);

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("início: troca sozinho; com movimento reduzido, começa parado", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(`${LOJA}/`);
  const carrossel = page.getByRole("region", { name: "Coleções em destaque" });
  await expect(carrossel.getByRole("button", { name: "Mostrar Riviera" })).toHaveAttribute("aria-current", "true", { timeout: 9_000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${LOJA}/`);
  await expect(page.getByRole("button", { name: "Continuar o carrossel" })).toBeVisible();
});
