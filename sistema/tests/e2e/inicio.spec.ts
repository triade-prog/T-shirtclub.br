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

test("início: troca sozinho; com movimento reduzido, começa parado", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(`${LOJA}/`);
  const carrossel = page.getByRole("region", { name: "Coleções em destaque" });
  await expect(carrossel.getByRole("button", { name: "Mostrar Riviera" })).toHaveAttribute("aria-current", "true", { timeout: 9_000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${LOJA}/`);
  await expect(page.getByRole("button", { name: "Continuar o carrossel" })).toBeVisible();
});
