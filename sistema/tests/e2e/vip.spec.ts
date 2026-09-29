import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Lista VIP (0390) na loja com catálogo (3003, api falsa com cupom de 10%): o pop-up aparece
// alguns segundos depois de chegar, com os dois aceites separados; quem entra vê o cupom e o
// pop-up não volta; quem fecha, também não. O rodapé tem a mesma inscrição.
const LOJA = "http://localhost:3003";
test.use({ storageState: { cookies: [], origins: [] } });

async function semViolacoes(page: Page, tela: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${tela} · ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("pop-up: aparece depois de alguns segundos, pede os dois aceites e mostra o cupom", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto(`${LOJA}/`);
  const popup = page.getByRole("dialog", { name: "Entre para a Lista VIP" });
  await expect(popup).toBeHidden();
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await expect(popup).toContainText("10% OFF na primeira compra");
  await semViolacoes(page, "pop-up");

  await popup.getByLabel("WhatsApp", { exact: true }).fill("(77) 99812-8809");
  await popup.getByRole("button", { name: "Quero ser VIP" }).click();
  await expect(popup.getByText("Marque as duas opções para entrar na lista.")).toBeVisible();
  await popup.getByLabel("Quero receber novidades, drops e ofertas da T-shirt Club pelo WhatsApp.").check();
  await popup.getByLabel(/Li e concordo com a Política de privacidade/).check();
  await popup.getByRole("button", { name: "Quero ser VIP" }).click();
  await expect(popup.getByText("Você está na Lista VIP.")).toBeVisible();
  await expect(popup.getByText("VIP10")).toBeVisible();
  await semViolacoes(page, "pop-up, inscrita");
  expect(await page.evaluate(() => localStorage.getItem("tc-vip"))).toBe("1");

  // Fechar pelo X; quem entrou não volta a ver o pop-up (fica marcado neste aparelho)
  await popup.getByRole("button", { name: "Fechar" }).click();
  await expect(popup).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("tc-vip-fechado"))).toBeNull();
});

test("pop-up: fechado com Esc, espera 30 dias; nunca na sacola", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto(`${LOJA}/sacola`);
  await page.waitForTimeout(9_000);
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto(`${LOJA}/colecao/limone`);
  const popup = page.getByRole("dialog", { name: "Entre para a Lista VIP" });
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  expect(Number(await page.evaluate(() => localStorage.getItem("tc-vip-fechado")))).toBeGreaterThan(Date.now() - 60_000);
});

test("rodapé: vantagens, Lista VIP e dados da loja", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tc-vip-fechado", String(Date.now())));
  await page.goto(`${LOJA}/`);
  const rodape = page.getByRole("contentinfo");
  await expect(rodape.getByRole("region", { name: "Vantagens da loja" }).getByRole("listitem")).toHaveCount(6);
  await expect(rodape).toContainText("3 por R$ 119,99");
  await expect(rodape).toContainText("Ganhe 10% OFF na primeira compra");
  await expect(rodape.getByRole("navigation", { name: "Coleções" }).getByRole("link", { name: "Limone" })).toHaveAttribute("href", "/colecao/limone");
  await expect(rodape).toContainText("CNPJ 60.814.144/0001-03");
  await rodape.scrollIntoViewIfNeeded();
  await semViolacoes(page, "rodapé");

  const vip = rodape.getByRole("region", { name: /Drops novos/ });
  await vip.getByLabel("WhatsApp", { exact: true }).fill("(77) 99812-8809");
  await vip.getByLabel("Quero receber novidades, drops e ofertas da T-shirt Club pelo WhatsApp.").check();
  await vip.getByLabel(/Li e concordo com a Política de privacidade/).check();
  await vip.getByRole("button", { name: "Quero ser VIP" }).click();
  await expect(vip.getByText("VIP10")).toBeVisible();
});

// Na página de uma coleção (28/09): rodapé curto na cor dela, sem as vantagens e a Lista VIP; com a
// campanha ligada, na paleta da campanha. Navegando pelos links, o rodapé troca sem recarregar.
test("rodapé na coleção: curto, na cor da coleção, e volta ao completo fora dela", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tc-vip-fechado", String(Date.now())));
  await page.goto(`${LOJA}/`);
  const rodape = page.getByRole("contentinfo");
  await rodape.getByRole("navigation", { name: "Coleções" }).getByRole("link", { name: "Limone" }).click();
  await expect(page).toHaveURL(`${LOJA}/colecao/limone`);
  await expect(rodape.getByRole("region", { name: "Vantagens da loja" })).toHaveCount(0);
  await expect(rodape.getByRole("region", { name: /Drops novos/ })).toHaveCount(0);
  await expect(rodape.getByRole("link", { name: "Limone" })).toHaveAttribute("aria-current", "page");
  await expect(rodape).toContainText("CNPJ 60.814.144/0001-03");
  await expect(rodape).toHaveClass(/col-limao/);
  // A cor na tela, não só a classe: o tom escuro do Limão com o texto branco (auditoria de 28/09:
  // a classe estava certa e o fundo saía transparente)
  const faixa = rodape.locator(":scope > div").first();
  await expect(faixa).toHaveCSS("background-color", "rgb(107, 86, 0)");
  await expect(faixa).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(rodape.getByRole("link", { name: "T-shirt Club.br" }).locator("img")).toBeVisible();
  await rodape.scrollIntoViewIfNeeded();
  await semViolacoes(page, "rodapé da coleção");

  // Campanha ligada (Estate Italiana na api falsa): a faixa na tinta da marca, como toda a campanha (D38)
  await rodape.getByRole("link", { name: "Estate Italiana" }).click();
  await expect(page).toHaveURL(`${LOJA}/colecao/estate-italiana`);
  await expect(rodape).toHaveClass(/paleta-estate-italiana/);
  await expect(faixa).toHaveCSS("background-color", "rgb(38, 25, 30)");
  await rodape.scrollIntoViewIfNeeded();
  await semViolacoes(page, "rodapé da campanha");

  // De volta ao início, o rodapé completo
  await rodape.getByRole("link", { name: "T-shirt Club.br" }).click();
  await expect(page).toHaveURL(`${LOJA}/`);
  await expect(rodape.getByRole("region", { name: "Vantagens da loja" })).toBeVisible();
});

// Na sacola (29/09): o rodapé verde com os links e os dados da loja, sem as vantagens e a Lista VIP,
// para não tirar a atenção de quem está fechando o pedido. Ao sair da sacola, volta o completo.
test("rodapé na sacola: sem as vantagens e a Lista VIP", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tc-vip-fechado", String(Date.now())));
  await page.goto(`${LOJA}/sacola`);
  const rodape = page.getByRole("contentinfo");
  await expect(rodape.getByRole("navigation", { name: "Ajuda" })).toBeVisible();
  await expect(rodape).toContainText("CNPJ 60.814.144/0001-03");
  await expect(rodape.getByRole("region", { name: "Vantagens da loja" })).toHaveCount(0);
  await expect(rodape.getByRole("region", { name: /Drops novos/ })).toHaveCount(0);
  await rodape.scrollIntoViewIfNeeded();
  await semViolacoes(page, "rodapé da sacola");

  await rodape.getByRole("link", { name: "T-shirt Club.br" }).click();
  await expect(page).toHaveURL(`${LOJA}/`);
  await expect(rodape.getByRole("region", { name: "Vantagens da loja" })).toBeVisible();
});
