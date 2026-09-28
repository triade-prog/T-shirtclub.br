import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Página da coleção (28/09) na loja com catálogo (3003, api falsa): capa com o título e a foto,
// faixa verde com a chamada, e as peças logo depois do título, com o Club numa faixa compacta
// que reconhece o trio completo quando a sacola tem 3 peças.
const LOJA = "http://localhost:3003";

// Pelo "Adicionar ao Club" de sempre (GET /sacola?adicionar), que grava o cookie da sacola.
async function adicionar(page: Page, slug: string, tamanho: "unico" | "plus" = "unico") {
  await page.goto(`${LOJA}/sacola?adicionar=${slug}&tamanho=${tamanho}`);
}

test("coleção: capa, chamada, faixa do Club antes das peças e o trio completo", async ({ page }) => {
  await adicionar(page, "limone-amalfi-coast");
  await adicionar(page, "limone-amalfi-coast", "plus");
  await adicionar(page, "outra-estampa");
  await page.goto(`${LOJA}/colecao/limone`);
  await expect(page.getByRole("heading", { level: 1, name: "Limone." })).toBeVisible();
  await expect(page.getByRole("img", { name: "Campanha Limone" })).toBeVisible();
  await expect(page.getByText("Limões, listras e o verão italiano que não acaba.")).toBeVisible();

  const faixa = page.getByRole("region", { name: "Monte seu Club: 3 de 3" });
  await expect(faixa).toContainText("Seu trio está completo ✓");
  await expect(faixa).toContainText("3 por R$ 119,99");
  const peca = page.getByRole("link", { name: /Limone Amalfi Coast/ }).first();
  expect((await faixa.boundingBox())!.y).toBeLessThan((await peca.boundingBox())!.y);
  expect((await page.getByRole("navigation", { name: "Filtrar peças" }).boundingBox())!.y).toBeLessThan((await faixa.boundingBox())!.y);

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("coleção: sacola vazia convida a misturar; uma peça começa o trio", async ({ page }) => {
  await page.goto(`${LOJA}/colecao/limone`);
  const vazia = page.getByRole("region", { name: "Monte seu Club: 0 de 3" });
  await expect(vazia).toContainText("Misture com qualquer coleção");
  await adicionar(page, "limone-amalfi-coast");
  await page.goto(`${LOJA}/colecao/limone`);
  await expect(page.getByRole("region", { name: "Monte seu Club: 1 de 3" })).toContainText("Começou o seu trio.");
});
