import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Jornada completa da cliente no celular (T26), da vitrine ao pedido pago com a entrega
// escolhida, com o axe em cada tela. A loja roda na porta 3003 apontando para a api-public
// falsa (tests/e2e/api-falsa/api-publica.mjs, porta 4010); o playwright.config sobe as duas.
const LOJA = "http://localhost:3003";

async function semViolacoes(page: Page, tela: string) {
  // O Next manda o <title> das páginas dinâmicas pelo streaming, depois do conteúdo: sem esperar,
  // o axe às vezes via a página sem título (falhava de vez em quando no PIX). Sem título nenhum,
  // a espera falha do mesmo jeito.
  await expect(page).toHaveTitle(/\S/);
  const r =await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
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
  // Almost Gone: as peças acabando, com o selo da quantidade real
  const acabando = page.locator("#quase-esgotadas");
  await expect(acabando.getByRole("heading", { name: "Almost Gone" })).toBeVisible();
  await expect(acabando.getByText("Última unidade")).toBeVisible();
  await expect(acabando.getByRole("button", { name: "Adicionar Dog Parisienne (Único · P ao 42) à sacola" })).toBeVisible();
  // Com os dois tamanhos à venda, o + do cartão leva à escolha do tamanho
  await expect(page.getByRole("link", { name: "Escolher o tamanho de Limone Amalfi Coast" }).first()).toHaveAttribute("href", "/produto/limone-amalfi-coast?escolha=tamanho#tamanho");
  await page.getByRole("link", { name: "Limone Amalfi Coast", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Amalfi Coast");
  // A foto chega do "Storage" pelo next/image (ORIGEM_IMAGENS no build e na loja)
  const foto = page.getByRole("img", { name: "Camiseta Limone Amalfi Coast, frente" });
  await expect.poll(() => foto.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await semViolacoes(page, "produto");
  // 8 peças no total: sem selo na peça; o Plus, com 3, mostra "Últimas 3" na escolha do tamanho
  await expect(page.locator("#tamanho").getByText("Últimas 3")).toBeVisible();

  // Tamanho (0370): o Único vem marcado; a cliente escolhe o Plus. As medidas são de cada tamanho.
  await expect(page.getByRole("radio", { name: "Único · P ao 42" })).toBeChecked();
  await page.getByRole("radio", { name: "Plus · 44 ao 48" }).check();
  await expect(page.getByRole("radio", { name: "Plus · 44 ao 48" })).toBeChecked();
  await expect(page.getByText("Plus · 44 ao 48: busto 116 cm · comprimento 72 cm")).toBeAttached();

  // Produto → sacola: a peça entra sem sair da página; o aviso mostra o progresso do trio
  // Preço da peça e o do Club separados, sem nada colado (29/09)
  await expect(page.getByText("R$ 49,99 a peça", { exact: true })).toBeVisible();
  await expect(page.getByText("ou 3 por R$ 119,99 no Club", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Adicionar ao Club" }).click();
  const aviso = page.getByRole("status", { name: "Aviso da sacola" });
  await expect(aviso).toContainText("Limone Amalfi Coast entrou na sacola.");
  await expect(aviso).toContainText("1/3 · Começou o seu trio.");
  await expect(page).toHaveURL(`${LOJA}/produto/limone-amalfi-coast`);
  await expect(page.getByRole("region", { name: "Monte seu Club: 1 de 3" })).toBeVisible();
  await semViolacoes(page, "peça adicionada");
  await aviso.getByRole("link", { name: "Ver sacola" }).click();
  await expect(page).toHaveURL(`${LOJA}/sacola`);
  await expect(page.getByText("Limone Amalfi Coast").first()).toBeVisible();
  await expect(page.getByText("Tamanho Plus · 44 ao 48")).toBeVisible();
  await semViolacoes(page, "sacola");

  // Sacola → Seus dados
  await page.getByRole("link", { name: /Reservar minhas peças/ }).click();
  await expect(page).toHaveURL(`${LOJA}/reserva`);
  await page.getByRole("button", { name: "Receber código no WhatsApp" }).click();
  await expect(page.getByText("Escreva seu nome.")).toBeVisible();
  await semViolacoes(page, "seus dados com erros");
  await page.getByLabel("Nome", { exact: true }).fill("Carol Teste");
  await page.getByLabel("WhatsApp", { exact: true }).first().fill("(77) 99812-8809");
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
  // Pago: a reserva abre uma vez na página de pagamento aprovado (conversão do tráfego pago)
  await expect(page).toHaveURL(/\/pagamento-aprovado\?reserva=\d+$/, { timeout: 15_000 });
  const numero = new URL(page.url()).searchParams.get("reserva");
  await expect(page.getByRole("heading", { name: "Suas peças são suas." })).toBeVisible();
  await semViolacoes(page, "pago");

  // Meu pedido: retirada confirmada, pedido em preparação
  await page.getByRole("button", { name: "Confirmar retirada" }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText("Em preparação");
  await semViolacoes(page, "meu pedido");
  // Uma vez só: voltando para a reserva, ela não abre de novo a página de aprovado
  await page.goto(`${LOJA}/reserva/${numero}`);
  await expect(page.locator('[aria-current="step"]')).toContainText("Em preparação");
  await expect(page).toHaveURL(`${LOJA}/reserva/${numero}`);
  expect(erros).toEqual([]);
});

// O + do cartão adiciona sem sair da página: o aviso e o progresso contam 1/3, 2/3, e o limite
// de 2 por estampa aparece no aviso, sem mexer na sacola.
test("+ do cartão: entra na sacola sem sair do início, com o progresso do trio", async ({ page }) => {
  await page.goto(`${LOJA}/`);
  const mais = page.locator("#quase-esgotadas").getByRole("button", { name: "Adicionar Dog Parisienne (Único · P ao 42) à sacola" });
  const aviso = page.getByRole("status", { name: "Aviso da sacola" });
  await mais.click();
  await expect(aviso).toContainText("Dog Parisienne entrou na sacola.");
  await expect(aviso).toContainText("1/3 · Começou o seu trio.");
  await expect(page.getByRole("region", { name: "Monte seu Club: 1 de 3" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: /Sacola/ })).toContainText("1");
  await mais.click();
  await expect(aviso).toContainText("2/3 · Falta só uma 👀");
  await expect(page.getByRole("region", { name: "Monte seu Club: 2 de 3" })).toBeVisible();
  await mais.click();
  await expect(aviso).toContainText("Cada estampa pode entrar no máximo 2 vezes, somando os tamanhos.");
  await expect(page.getByRole("region", { name: "Monte seu Club: 2 de 3" })).toBeVisible();
  await expect(page).toHaveURL(`${LOJA}/`);
  await aviso.getByRole("button", { name: "Fechar aviso" }).click();
  await expect(aviso).toBeEmpty();
});

// Alvos de toque de 44 px (F2.7): botões e links soltos, ou a área invisível .tc-alvo. Ficam
// de fora os links no meio de uma frase (exceção da WCAG) e o "Pular para o conteúdo".
test("alvos de toque de pelo menos 44 px nas telas da vitrine", async ({ page }) => {
  for (const caminho of ["/", "/colecao/limone", "/produto/limone-amalfi-coast", "/sacola", "/consulta", "/nao-existe"]) {
    await page.goto(`${LOJA}${caminho}`);
    // Com prazo: na 404 (agora com os scripts rodando) a pré-carga do Next pode não fechar
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const pequenos = await page.evaluate(() => {
      const saida: string[] = [];
      for (const e of document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, textarea, summary")) {
        if (e.matches(".sr-only, .sr-only *") || e.closest("p")) continue;
        const alvo = e instanceof HTMLInputElement && ["radio", "checkbox"].includes(e.type) ? (e.closest("label") ?? e) : e;
        const b = alvo.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        const extra = getComputedStyle(e, "::after");
        const w = Math.max(b.width, e.classList.contains("tc-alvo") ? parseFloat(extra.width) : 0);
        const h = Math.max(b.height, e.classList.contains("tc-alvo") ? parseFloat(extra.height) : 0);
        if (Math.min(w, h) < 44) saida.push(`${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(w)}x${Math.round(h)}`);
      }
      return saida;
    });
    expect(pequenos, caminho).toEqual([]);
  }
});

// Revalidação ao publicar: a peça fica no cache da loja até o painel avisar (POST /revalidar,
// que a api-admin chama depois de gravar o catálogo); aí a próxima visita já vem nova.
test("revalidação ao publicar: o aviso do painel tira o catálogo do cache na hora", async ({ page, request }, info) => {
  // O cache do catálogo é um só; um projeto basta (o outro revalidaria no meio deste teste).
  test.skip(info.project.name !== "android", "roda uma vez");
  const pagina = `${LOJA}/produto/revalidacao-${Date.now()}`;
  await page.goto(pagina);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("busca 1");
  await page.goto(pagina);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("busca 1");

  // Sem o segredo, nada muda
  expect((await request.post(`${LOJA}/revalidar`)).status()).toBe(401);
  expect((await request.post(`${LOJA}/revalidar`, { headers: { "x-revalidar-segredo": "errado" } })).status()).toBe(401);
  await page.goto(pagina);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("busca 1");

  const r = await request.post(`${LOJA}/revalidar`, { headers: { "x-revalidar-segredo": "e2e-revalidar" }, data: { etiquetas: ["catalogo"] } });
  expect(r.status()).toBe(200);
  await page.goto(pagina);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("busca 2");
});
