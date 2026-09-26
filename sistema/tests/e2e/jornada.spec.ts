import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Jornada completa da cliente no celular (T26), da vitrine ao pedido pago com a entrega
// escolhida, com o axe em cada tela. A loja roda na porta 3003 apontando para a api-public
// falsa (tests/e2e/api-falsa/api-publica.mjs, porta 4010); o playwright.config sobe as duas.
const LOJA = "http://localhost:3003";

async function semViolacoes(page: Page, tela: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${tela} · ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("da vitrine ao pedido: sacola, reserva com código do WhatsApp, PIX e retirada", async ({ page }) => {
  test.setTimeout(90_000);
  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));

  // Início → produto
  await page.goto(`${LOJA}/`);
  await semViolacoes(page, "início");
  await page.getByRole("link", { name: /Limone Amalfi Coast/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Amalfi Coast");
  // A foto chega do "Storage" pelo next/image (ORIGEM_IMAGENS no build e na loja)
  const foto = page.getByRole("img", { name: "Camiseta Limone Amalfi Coast, frente" });
  await expect.poll(() => foto.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await semViolacoes(page, "produto");

  // Produto → sacola
  await page.getByRole("button", { name: "Adicionar ao Club" }).click();
  await expect(page).toHaveURL(`${LOJA}/sacola`);
  await expect(page.getByText("Limone Amalfi Coast").first()).toBeVisible();
  await semViolacoes(page, "sacola");

  // Sacola → Seus dados
  await page.getByRole("link", { name: /Reservar minhas peças/ }).click();
  await expect(page).toHaveURL(`${LOJA}/reserva`);
  await page.getByRole("button", { name: "Receber código no WhatsApp" }).click();
  await expect(page.getByText("Escreva seu nome.")).toBeVisible();
  await semViolacoes(page, "seus dados com erros");
  await page.getByLabel("Nome").fill("Carol Teste");
  await page.getByLabel("WhatsApp").fill("(77) 99812-8809");
  await page.getByText("Retirar na loja").click();
  await page.getByRole("button", { name: "Receber código no WhatsApp" }).click();

  // Código pelo WhatsApp
  await expect(page).toHaveURL(/\/reserva\/codigo\?t=/);
  const campo = page.getByLabel("Código de 6 dígitos");
  await expect(campo).toBeVisible();
  await semViolacoes(page, "código");
  await campo.fill("000000");
  await page.getByRole("button", { name: "Confirmar e reservar" }).click();
  await expect(page.getByText(/código.*(errado|não confere|inválido)/i).first()).toBeVisible();
  await campo.fill("123456");
  await page.getByRole("button", { name: "Confirmar e reservar" }).click();

  // Reserva ativa → PIX → pago
  await expect(page).toHaveURL(/\/reserva\/\d+$/);
  await page.getByRole("button", { name: "Gerar código PIX" }).click();
  await expect(page.getByRole("button", { name: /Copiar código PIX/ })).toBeVisible();
  await semViolacoes(page, "PIX");
  await expect(page.getByRole("heading", { name: "Suas peças são suas." })).toBeVisible({ timeout: 15_000 });
  await semViolacoes(page, "pago");

  // Meu pedido: retirada confirmada, pedido em preparação
  await page.getByRole("button", { name: "Confirmar retirada" }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText("Em preparação");
  await semViolacoes(page, "meu pedido");
  expect(erros).toEqual([]);
});
