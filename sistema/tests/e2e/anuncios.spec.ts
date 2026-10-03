import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Google Ads (tráfego pago) na loja da porta 3004, com a conta de teste configurada: o aviso de
// cookies, a tag só depois do aceite (sem ele nada vai para o Google), a CSP liberando só os
// domínios do Google e a conversão da compra na página de pagamento aprovado. O gtag.js é
// trocado por um arquivo vazio: nenhum pedido sai para o Google de verdade.
const LOJA = "http://localhost:3004";

async function vigiar(page: Page) {
  const tag: string[] = [];
  await page.route("https://www.googletagmanager.com/**", (rota) => {
    tag.push(rota.request().url());
    return rota.fulfill({ contentType: "text/javascript", body: "window.tagDeTeste = true;" });
  });
  await page.addInitScript(() => {
    const w = window as unknown as { bloqueiosCsp: string[] };
    w.bloqueiosCsp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.bloqueiosCsp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const bloqueios = () => page.evaluate(() => (window as unknown as { bloqueiosCsp: string[] }).bloqueiosCsp);
  // A fila do gtag guarda objetos arguments: vira lista de listas para comparar
  const fila = () => page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((a) => Array.from(a)));
  return { tag, bloqueios, fila };
}

test("sem aceite, nada vai para o Google; o aviso não volta depois da escolha", async ({ page }) => {
  const { tag, bloqueios } = await vigiar(page);
  const resposta = await page.goto(`${LOJA}/`);
  expect(resposta!.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic' [^;]*https:\/\/www\.googletagmanager\.com/);
  const aviso = page.getByRole("region", { name: "Cookies de anúncio" });
  await expect(aviso).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await aviso.getByRole("button", { name: "Agora não" }).click();
  await expect(aviso).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(aviso).toBeHidden();
  expect(tag).toEqual([]);
  expect(await bloqueios()).toEqual([]);

  // A política conta os cookies de anúncio e deixa mudar a escolha: o aviso volta
  await page.goto(`${LOJA}/privacidade`);
  await expect(page.getByText(/Cookies de anúncio e de medição do Google só entram se você aceitar/)).toBeVisible();
  await expect(page.getByText("Google (Google Ads e Google Analytics), só com o seu aceite", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Mudar minha escolha de cookies" }).click();
  await expect(aviso).toBeVisible();
  expect(tag).toEqual([]);
});

test("com aceite: tag da conta e, no pagamento aprovado, a compra com valor e número da reserva", async ({ page }) => {
  test.setTimeout(60_000);
  const { tag, bloqueios, fila } = await vigiar(page);
  await page.goto(`${LOJA}/`);
  await page.getByRole("region", { name: "Cookies de anúncio" }).getByRole("button", { name: "Aceitar" }).click();
  await expect.poll(() => tag.length).toBe(1);
  expect(tag[0]).toBe("https://www.googletagmanager.com/gtag/js?id=AW-123456789");
  expect(await fila()).toContainEqual(["config", "AW-123456789"]);

  // Compra: sacola pela URL, dados, código do WhatsApp e PIX (a api falsa aprova sozinha)
  await page.goto(`${LOJA}/sacola?adicionar=limone-amalfi-coast&tamanho=unico`);
  await page.getByRole("link", { name: /Reservar minhas peças/ }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana Anúncio");
  await page.getByLabel("WhatsApp", { exact: true }).first().fill("(77) 99812-7701");
  await page.getByText("Retirar na loja").click();
  await page.getByRole("button", { name: "Receber código no WhatsApp" }).click();
  await page.getByLabel("Código de 6 dígitos").fill("123456");
  await page.getByRole("button", { name: "Confirmar e reservar" }).click();
  await expect(page).toHaveURL(/\/reserva\/\d+$/);
  const cargas = tag.length; // cada página carregada do zero pede a tag de novo
  await page.getByRole("button", { name: "Gerar código PIX" }).click();

  await expect(page).toHaveURL(/\/pagamento-aprovado\?reserva=\d+$/, { timeout: 15_000 });
  const numero = new URL(page.url()).searchParams.get("reserva");
  await expect(page.getByRole("heading", { name: "Suas peças são suas." })).toBeVisible();
  // Página nova carregada do zero: a tag vem de novo (é ela que registra o endereço da conversão)
  await expect.poll(() => tag.length).toBe(cargas + 1);
  await expect.poll(fila).toContainEqual(["event", "conversion", expect.objectContaining({
    send_to: "AW-123456789/compraTeste1", currency: "BRL", transaction_id: numero, value: expect.any(Number),
  })]);
  expect(await bloqueios()).toEqual([]);

  // Recarregar a página de aprovado não registra a compra de novo
  await page.reload();
  await expect(page.getByRole("heading", { name: "Suas peças são suas." })).toBeVisible();
  await expect.poll(() => tag.length).toBe(cargas + 2);
  expect((await fila()).filter((c) => c[1] === "conversion")).toEqual([]);
});
