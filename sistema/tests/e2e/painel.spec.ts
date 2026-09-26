import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAINEL = "http://localhost:3001";

// Telas do painel (fatias 9 e 10, desenho V4 em docs/design/v4/painel). Sem a api-admin (CI sem Supabase), o login aparece e as telas
// da operação avisam sem quebrar; o fluxo com dados é conferido à parte, com a api falsa.

test("login do painel: e-mail, senha, acessível e sem erro de CSP", async ({ page }) => {
  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${PAINEL}/entrar`);
  await expect(page.getByLabel("E-mail")).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Senha")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Confira o e-mail e a senha" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations).toEqual([]);
  expect(erros).toEqual([]);
});

for (const caminho of ["/reservas", "/cancelamentos", "/entregas", "/catalogo", "/estoque", "/promocoes"]) {
  test(`${caminho} sem a api-admin avisa sem quebrar`, async ({ page }) => {
    await page.goto(`${PAINEL}${caminho}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    await expect(page.getByText(/fora do ar|Tente de novo|não conseguimos/i).first()).toBeVisible();
  });
}
