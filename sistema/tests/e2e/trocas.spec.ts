import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Política de trocas (29/09): 7 dias, sem uso e com a etiqueta. A página /trocas, o link no rodapé
// (completo e o curto das coleções), a aba da página da peça e a garantia na sacola.
const LOJA = "http://localhost:3003";

async function semViolacoes(page: Page, tela: string) {
  await expect(page).toHaveTitle(/\S/);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${tela} · ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("trocas: a página, o rodapé, a peça e a sacola, com axe", async ({ page }) => {
  // Sem o pop-up da Lista VIP por cima do rodapé (ele tem o teste dele em vip.spec)
  await page.addInitScript(() => localStorage.setItem("tc-vip-fechado", String(Date.now())));
  // Do rodapé da home para a página
  await page.goto(`${LOJA}/`);
  await page.getByRole("contentinfo").getByRole("link", { name: "Trocas e devoluções" }).click();
  await expect(page).toHaveURL(`${LOJA}/trocas`);
  await expect(page.getByRole("heading", { level: 1, name: "Trocas e devoluções." })).toBeVisible();
  await expect(page.getByText("Troca em até 7 dias, com a peça sem uso e com a etiqueta.")).toBeVisible();
  await expect(page.getByText(/direito de arrependimento/)).toBeVisible();
  await expect(page.getByRole("link", { name: /WhatsApp/ }).first()).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  await semViolacoes(page, "trocas");

  // O rodapé curto das coleções também leva à política
  await page.goto(`${LOJA}/colecao/limone`);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Trocas e devoluções" })).toHaveAttribute("href", "/trocas");

  // Na peça, a regra vem na aba "Trocas e cuidados", com o link
  await page.goto(`${LOJA}/produto/limone-amalfi-coast`);
  await page.locator("summary", { hasText: "Trocas e cuidados" }).click();
  await expect(page.getByText(/Troca em até 7 dias, com a peça sem uso e com a etiqueta\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver a política de trocas" })).toHaveAttribute("href", "/trocas");

  // Na sacola, a garantia da troca junto das outras, sem parecer botão
  await page.goto(`${LOJA}/sacola?adicionar=limone-amalfi-coast&tamanho=unico`);
  const garantias = page.getByRole("list", { name: "Garantias da compra" });
  await expect(garantias.getByRole("listitem")).toHaveCount(4);
  await expect(garantias).toContainText("Pix ou cartão");
  await expect(garantias).toContainText("Troca em 7 dias");
  await expect(garantias.getByRole("link", { name: /ver a política/ })).toHaveAttribute("href", "/trocas");
  await semViolacoes(page, "sacola");
});
