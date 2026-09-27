import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAINEL = "http://localhost:3001";

// Telas do painel (fatias 9 a 11, desenho V4 em docs/design/v4/painel). Sem a api-admin (CI sem Supabase), o login aparece e as telas
// da operação avisam sem quebrar; o fluxo com dados é conferido à parte, com a api falsa.

test("login do painel: e-mail, senha, acessível e sem erro de CSP", async ({ page }) => {
  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${PAINEL}/entrar`);
  await expect(page.getByLabel("E-mail")).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Senha")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Confira o e-mail e a senha" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations).toEqual([]);
  expect(erros).toEqual([]);
});

const TELAS = ["/", "/operacao", "/reservas", "/cancelamentos", "/entregas", "/catalogo", "/estoque", "/promocoes", "/pagamentos", "/contestacoes", "/bloqueados", "/whatsapp", "/auditoria", "/conta"];

test("sem sessão, as telas vão para o login e voltam depois", async ({ page }) => {
  await page.goto(`${PAINEL}/`);
  await expect(page).toHaveURL(`${PAINEL}/entrar`);
  await page.goto(`${PAINEL}/reservas?status=RESERVADO`);
  await expect(page).toHaveURL(`${PAINEL}/entrar?voltar=${encodeURIComponent("/reservas?status=RESERVADO")}`);
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

for (const caminho of TELAS) {
  test(`${caminho} sem a api-admin avisa sem quebrar`, async ({ page, context }) => {
    // Um cookie de sessão qualquer passa pelo proxy; quem confere a sessão é a api-admin.
    await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
    await page.goto(`${PAINEL}${caminho}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    await expect(page.getByText(/fora do ar|Tente de novo|não conseguimos/i).first()).toBeVisible();
  });
}

// Cadastro da peça (V5.1) com a api-admin simulada: prévia com o cartão da loja, "Pronta para
// publicar?", a caixa do Club (regrava a promoção) e a barra de salvar.
test("cadastro da peça: prévia, checklist, Club e acessível", async ({ page, context }) => {
  const PECA = "11111111-1111-4111-8111-111111111111";
  const OUTRA = "22222222-2222-4222-8222-222222222222";
  const CLUB = "33333333-3333-4333-8333-333333333333";
  const enviados: { metodo: string; caminho: string; corpo: unknown }[] = [];
  const respostas: Record<string, unknown> = {
    "v1/admin/dashboard": { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 0, vencidos: 0 }, emPreparacao: 0, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } },
    "v1/admin/collections": [{ id: "c1", nome: "Limone", slug: "limone", descricao: null, cor: "LIMAO", capa: null, posicao: 1, ativa: true, produtos: 1 }],
    "v1/admin/promotions": [{ id: CLUB, tipo: "COMPRE_MAIS", nome: "Club 3", modo: "PRECO_POR_GRUPO", inicio: "2026-09-01T03:00:00+00:00", fim: "2026-12-31T03:00:00+00:00", situacao: "ATIVA", escopo: "ESPECIFICOS", produtos: [OUTRA], grupo: { qtd: 3, precoCentavos: 11999 }, umaPorCliente: false }],
    [`v1/admin/products/${PECA}`]: {
      id: PECA, codigo: "LIM-AMA", slug: "limone-amalfi", nome: "Limone Amalfi", precoCentavos: 4999, colecaoId: "c1", ativo: true, publicado: false,
      capa: null, fotos: [], estoque: { total: 12, reservado: 0, vendido: 0, disponivel: 12 }, movimentos: [],
      descricao: null, composicao: "100% algodão", modelagem: null, medidas: {}, cuidados: null,
    },
  };
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const caminho = new URL(r.url()).pathname.replace(/^\/api\//, "");
    if (r.method() !== "GET") {
      enviados.push({ metodo: r.method(), caminho, corpo: r.postDataJSON() });
      return rota.fulfill({ json: { id: caminho.includes("promotions") ? CLUB : PECA } });
    }
    return caminho in respostas ? rota.fulfill({ json: respostas[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/catalogo/produtos/${PECA}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Limone");
  const previa = page.locator(".previa-cartao");
  await expect(previa.getByText("Limone Amalfi")).toBeVisible();
  await expect(previa.getByText("R$ 49,99")).toBeVisible();
  // Fora do Club até marcar; marcando, a prévia mostra a oferta
  await expect(previa.getByText("3 por R$ 119,99")).toHaveCount(0);
  await page.getByLabel("Participa do Club: 3 por R$ 119,99").check();
  await expect(previa.getByText("3 por R$ 119,99")).toBeVisible();
  await page.getByLabel("Nome da peça").fill("Limone Positano");
  await expect(previa.getByText("Limone Positano")).toBeVisible();

  const checklist = page.locator(".checklist");
  await expect(checklist).toContainText("Falta: Acrescente pelo menos a foto de capa.");
  await expect(checklist).toContainText("Sugestão: Confirme as medidas antes de publicar.");
  await expect(checklist).toContainText("Feito: 12 peças disponíveis.");
  // Um lugar para cada ângulo que falta; o da frente vira a capa
  await expect(page.getByRole("button", { name: "Capa · frente", exact: true })).toHaveAttribute("type", "file");
  await expect(page.getByRole("button", { name: "Costas", exact: true })).toHaveAttribute("type", "file");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations).toEqual([]);

  // Sem capa, "Publicar na loja" explica o que falta e não envia nada
  await page.getByRole("button", { name: "Publicar na loja" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Para publicar, falta:" })).toContainText("acrescente pelo menos a foto de capa");
  expect(enviados).toEqual([]);

  // Salvar rascunho: grava a peça (sem publicar) e põe a peça na promoção do Club
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Peça salva." })).toBeVisible();
  expect(enviados.map((e) => `${e.metodo} ${e.caminho}`)).toEqual([`PUT v1/admin/products/${PECA}`, `PUT v1/admin/promotions/${CLUB}`]);
  expect(enviados[0]!.corpo).toMatchObject({ nome: "Limone Positano", publicado: false, precoCentavos: 4999 });
  expect(enviados[1]!.corpo).toMatchObject({ escopo: "ESPECIFICOS", produtos: [{ produtoId: OUTRA }, { produtoId: PECA }], grupo: { qtd: 3, precoCentavos: 11999 } });
});
