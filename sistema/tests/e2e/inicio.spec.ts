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
  // O nome da campanha na serifa itálica, como na página da campanha (D38)
  await expect(carrossel.getByText("Mare, Amore!")).toHaveCSS("font-style", "italic");
  await expect(page.getByText("Limone, Amore!")).toHaveCount(0);
  await expect(carrossel.getByRole("link", { name: /Ver Limone/ })).toHaveCount(0);

  // Monte seu Club: o "3" grande em citrino e o preço no lettering da loja, como nas campanhas
  const monte = page.locator("#monte-club");
  await expect(monte).toContainText("3 T-shirts por R$ 119,99");
  await expect(monte.locator("b.tc-numero-adesivo")).toHaveCSS("color", "rgb(223, 240, 74)");
  await expect(monte.locator('img[src*="lettering-preco-119-99"]')).toHaveCount(1);

  const colecoes = page.getByRole("region", { name: "Pick your story." });
  await expect(colecoes.getByRole("link", { name: "Limone" })).toHaveAttribute("href", "/colecao/limone");
  // Pick your story (0440): a foto escolhida no painel, no lugar da peça mais nova da coleção
  await expect(colecoes.getByRole("link", { name: "Limone" }).locator("img")).toHaveAttribute("src", /limone-detalhe\.webp/);
  // A foto escolhida aparece inteira (lettering com fundo transparente), sem o recorte redondo cortar
  await expect(colecoes.getByRole("link", { name: "Limone" }).locator("img")).toHaveCSS("object-fit", "contain");
  // O círculo tem o fundo claro da cor da coleção (Limão), enquanto a foto carrega ou sem foto
  await expect(colecoes.getByRole("link", { name: "Limone" }).locator(".col-limao")).toHaveCSS("background-color", "rgb(255, 249, 201)");

  // O axe mede o contraste do slide da vez depois da troca (0,7 s): no meio dela, o botão ainda está
  // meio transparente e o contraste sai errado (falhava de vez em quando no iPhone)
  await expect(carrossel.getByRole("group", { name: /Riviera/ })).toHaveCSS("opacity", "1");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("início: carrossel e faixa corrida de ponta a ponta, o 3 do Club na serifa, sem rolagem lateral", async ({ page }) => {
  // Tela mais larga que a página (1280 px): a foto e a faixa vão até as bordas (29/09)
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${LOJA}/`);
  const largura = await page.evaluate(() => document.documentElement.clientWidth);
  const foto = page.getByRole("region", { name: "Coleções em destaque" }).getByRole("img", { name: "Campanha Limone" });
  expect(Math.round((await foto.boundingBox())!.width)).toBe(largura);

  const faixa = page.getByRole("region", { name: "Oferta do Club" });
  await expect(faixa).toContainText("3 T-shirts por R$ 119,99");
  expect(Math.round((await faixa.boundingBox())!.width)).toBe(largura);
  await expect(faixa.locator(".tc-letreiro-trilho")).toHaveCSS("animation-play-state", "running");
  // Anda sozinha, então tem pausa (WCAG 2.2.2)
  const pausa = faixa.getByRole("button", { name: "Pausar a faixa da oferta" });
  await pausa.click();
  await expect(pausa).toHaveAttribute("aria-pressed", "true");
  await expect(faixa.locator(".tc-letreiro-trilho")).toHaveCSS("animation-play-state", "paused");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // "3 escolhas.": o 3 na serifa itálica do "Seu Club." (pedido da loja, 29/09)
  const tres = page.locator("#monte-club h2 em").first();
  await expect(tres).toHaveText("3");
  await expect(tres).toHaveCSS("font-style", "italic");
  expect(await tres.evaluate((e) => getComputedStyle(e).fontFamily)).toBe(
    await page.locator("#monte-club h2 em").last().evaluate((e) => getComputedStyle(e).fontFamily));

  // Com movimento reduzido, a faixa fica parada e o botão de pausa sai
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(faixa.locator(".tc-letreiro-trilho")).toHaveCSS("animation-name", "none");
  await expect(pausa).toBeHidden();
  const r = await new AxeBuilder({ page }).include("#monte-club").include('[aria-label="Oferta do Club"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
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
