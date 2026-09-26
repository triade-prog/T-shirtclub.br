import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const LOJA = "http://localhost:3000";

// Sem catálogo (CI sem Supabase) ou com slug inexistente, coleção e produto respondem 404
// com a página da loja, nunca 500.
for (const caminho of ["/colecao/nao-existe", "/produto/nao-existe", "/produto/..%2Fetc", "/colecao/Maiuscula"]) {
  test(`${caminho} responde 404`, async ({ page }) => {
    const r = await page.goto(`${LOJA}${caminho}`);
    expect(r!.status()).toBe(404);
    await expect(page.getByRole("link", { name: "T-shirt Club.br, página inicial" })).toBeVisible();
  });
}

// Sacola (fatia 3): o "Adicionar" é um GET que grava o cookie e volta para /sacola; sem
// catálogo, a peça aparece como fora da loja e o Remover (ação do servidor) esvazia a sacola.
test("sacola: adicionar pela URL, limite por modelo, remover e axe", async ({ page }) => {
  await page.goto(`${LOJA}/sacola`);
  await expect(page.getByRole("heading", { name: "Sua sacola está vazia." })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations).toEqual([]);

  await page.goto(`${LOJA}/sacola?adicionar=peca-teste`);
  await expect(page).toHaveURL(`${LOJA}/sacola`);
  await expect(page.getByRole("link", { name: /Sacola\s*1\s*peça/ })).toBeVisible();
  await page.goto(`${LOJA}/sacola?adicionar=peca-teste`);
  await page.goto(`${LOJA}/sacola?adicionar=peca-teste`);
  await expect(page).toHaveURL(/aviso=MAX_PER_MODEL/);
  await expect(page.getByText("Cada estampa pode entrar no máximo 2 vezes.")).toBeVisible();

  await page.getByRole("button", { name: "Remover peça que saiu da loja" }).click();
  await page.getByRole("button", { name: "Remover peça que saiu da loja" }).click();
  await expect(page.getByRole("heading", { name: "Sua sacola está vazia." })).toBeVisible();
});
