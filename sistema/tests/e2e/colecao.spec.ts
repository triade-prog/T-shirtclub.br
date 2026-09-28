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

test("coleção: o endereço antigo leva ao novo, com o filtro", async ({ page, request }) => {
  const r = await request.get(`${LOJA}/colecao/limone-club?filtro=ultimas`, { maxRedirects: 0 });
  expect(r.status()).toBe(308);
  expect(r.headers()["location"]).toBe("/colecao/limone?filtro=ultimas");
  await page.goto(`${LOJA}/colecao/limone-club`);
  await expect(page).toHaveURL(`${LOJA}/colecao/limone`);
  await expect(page.getByRole("heading", { level: 1, name: "Limone." })).toBeVisible();
  expect((await request.get(`${LOJA}/colecao/nunca-existiu`)).status()).toBe(404);
});

// Coleção de campanha (0420, D35 e D36): marca, campanha, coleção e capítulos, na paleta própria.
test("coleção de campanha: foto limpa, campanha, coleção, The Club Edit, capítulo e shop, com axe", async ({ page }) => {
  await page.goto(`${LOJA}/colecao/estate-italiana`);
  await expect(page.getByText("Ciao, Estate!", { exact: true })).toBeVisible();
  await expect(page.getByText("Estate Italiana · SS26", { exact: true })).toBeVisible();
  await expect(page.getByText("Coleção 01 · 1 estampa", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Estate Italiana." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver a estampa/ })).toHaveAttribute("href", "#pecas");
  await expect(page.getByText("Limões, listras e o verão italiano que não acaba.")).toBeVisible();

  const capitulo = page.getByRole("region", { name: "Il mercato apre cedo." });
  await expect(capitulo).toContainText("01 · Mattina — Mercato");
  await expect(capitulo.getByRole("img", { name: "Mercado de manhã" })).toBeVisible();
  await expect(capitulo.getByText("Limone Amalfi Coast")).toBeVisible();

  await expect(page.getByText("Shop Estate Italiana · 1 estampa")).toBeVisible();
  await expect(page.getByRole("region", { name: "Monte seu Club: 0 de 3" })).toBeVisible();
  // Sem a nota editorial do Club: na campanha, os capítulos fazem esse papel
  await expect(page.getByText("Editorial note")).toHaveCount(0);

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
