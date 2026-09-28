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
