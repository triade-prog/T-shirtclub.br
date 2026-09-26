import { expect, test } from "@playwright/test";

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
