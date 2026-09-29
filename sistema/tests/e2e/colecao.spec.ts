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

// Coleção de campanha (0420, D35 e D36): marca, campanha, coleção e capítulos, na identidade da
// marca como a home (D38): o nome da campanha sobre a foto, títulos em tinta e o trio no bloco rosa.
test("coleção de campanha: foto com o nome, coleção, The Club Edit, capítulo e shop, com axe", async ({ page }) => {
  await page.goto(`${LOJA}/colecao/estate-italiana`);
  const nome = page.getByText("Ciao, Estate!", { exact: true });
  await expect(nome).toBeVisible();
  await expect(nome).toHaveCSS("font-style", "italic");
  // Sobre a foto: o nome e a foto da campanha no mesmo quadro
  const quadro = page.locator("main section").first();
  await expect(quadro.getByRole("img", { name: "Uma amiga olhando o mar" })).toBeVisible();
  await expect(quadro).toContainText("Ciao, Estate!");
  await expect(page.getByText("Estate Italiana · SS26", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(38, 25, 30)");
  await expect(page.getByText("Coleção 01 · 1 estampa", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Estate Italiana." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver a estampa/ })).toHaveAttribute("href", "#pecas");
  await expect(page.getByText("Limões, listras e o verão italiano que não acaba.")).toBeVisible();

  const capitulo = page.getByRole("region", { name: "Il mercato apre cedo." });
  await expect(capitulo).toContainText("01 · Mattina — Mercato");
  await expect(capitulo).toContainText("Cesta, jornal e tomates ainda com cheiro de horta.");
  await expect(capitulo.getByRole("img", { name: "Mercado de manhã" })).toBeVisible();
  await expect(capitulo.getByText("Limone Amalfi Coast")).toBeVisible();

  // Build Your Club com o progresso do trio; a única estampa está no capítulo, então não há "resto da coleção"
  const build = page.getByRole("region", { name: "Estate Italiana" });
  await expect(build).toContainText("1 estampa · monte seu trio");
  await expect(build).toContainText("3 T-shirts por R$ 119,99");
  // O "3" grande em citrino e o preço no lettering da loja (a arte só vale para R$ 119,99)
  await expect(build.locator("b.tc-numero-adesivo")).toHaveCSS("color", "rgb(223, 240, 74)");
  await expect(build.locator('img[src*="lettering-preco-119-99"]')).toHaveCount(1);
  await expect(build.getByRole("region", { name: "Monte seu Club: 0 de 3" })).toBeVisible();
  await expect(build).toHaveCSS("background-color", "rgb(232, 71, 138)");
  await expect(page.getByText("O resto")).toHaveCount(0);
  // Next story: a próxima campanha ligada (Riviera)
  await expect(page.getByRole("region", { name: "Mare, Amore!" }).getByRole("link", { name: /Descobrir Riviera/ })).toHaveAttribute("href", "/colecao/riviera");
  // Sem a nota editorial do Club: na campanha, os capítulos fazem esse papel
  await expect(page.getByText("Editorial note")).toHaveCount(0);

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

// Club Editions (D39): a vitrine da loja inteira, com todas as peças e um filtro por coleção
test("Club Editions mostra a loja inteira, com filtro por coleção que soma com o de disponibilidade, com axe", async ({ page }) => {
  await page.goto(`${LOJA}/colecao/club-editions`);
  const grade = page.locator("#pecas");
  await expect(grade.getByText("Toda a loja · 2 estampas", { exact: true })).toBeVisible();
  await expect(grade.getByRole("link", { name: "Limone Amalfi Coast", exact: true })).toBeVisible();
  await expect(grade.getByRole("link", { name: "Rio de Janeiro", exact: true })).toBeVisible();
  const porColecao = page.getByRole("navigation", { name: "Filtrar por coleção" });
  await expect(porColecao.getByRole("link")).toHaveText(["Todas as coleções · 2", "Limone · 1", "Club Editions · 1"]);
  await expect(porColecao.getByRole("link", { name: "Todas as coleções · 2" })).toHaveAttribute("aria-current", "page");

  await porColecao.getByRole("link", { name: "Limone · 1" }).click();
  await expect(page).toHaveURL(`${LOJA}/colecao/club-editions?colecao=limone#pecas`);
  await expect(grade.getByRole("link", { name: "Rio de Janeiro", exact: true })).toHaveCount(0);
  await expect(grade.getByRole("link", { name: "Limone Amalfi Coast", exact: true })).toBeVisible();
  await expect(porColecao.getByRole("link", { name: "Limone · 1" })).toHaveAttribute("aria-current", "page");
  // O filtro de disponibilidade guarda a coleção escolhida
  await expect(page.getByRole("navigation", { name: "Filtrar peças" }).getByRole("link", { name: "Disponíveis" }))
    .toHaveAttribute("href", "/colecao/club-editions?colecao=limone&filtro=disponiveis#pecas");

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("coleção: campanha gravada e desligada não aparece; o endereço antigo da Riviera leva ao novo", async ({ page, request }) => {
  await page.goto(`${LOJA}/colecao/limone`);
  await expect(page.getByRole("heading", { level: 1, name: "Limone." })).toBeVisible();
  await expect(page.getByText("Limone, Amore!")).toHaveCount(0);
  const r = await request.get(`${LOJA}/colecao/sardines-club`, { maxRedirects: 0 });
  expect(r.status()).toBe(308);
  expect(r.headers()["location"]).toBe("/colecao/riviera");
});
