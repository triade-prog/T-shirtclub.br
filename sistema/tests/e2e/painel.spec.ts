import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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

const TELAS = ["/", "/operacao", "/reservas", "/reservas/nova", "/cancelamentos", "/entregas", "/catalogo", "/estoque", "/promocoes", "/pagamentos", "/contestacoes", "/bloqueados", "/vip", "/acessos", "/whatsapp", "/auditoria", "/conta"];

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
      descricao: null, composicao: "100% algodão", modelagem: null, cuidados: null,
      tamanhos: [{ id: "v1", tamanho: "UNICO", rotulo: "Único · P ao 42", ativa: true, disponivel: 12 }, { id: "v2", tamanho: "PLUS", rotulo: "Plus · 44 ao 48", ativa: false, disponivel: 0 }],
      variantes: [
        { id: "v1", tamanho: "UNICO", rotulo: "Único · P ao 42", sku: "LIM-AMA-UNI", ativa: true, medidas: {}, estoque: { total: 12, reservado: 0, vendido: 0, disponivel: 12 } },
        { id: "v2", tamanho: "PLUS", rotulo: "Plus · 44 ao 48", sku: "LIM-AMA-PLUS", ativa: false, medidas: {}, estoque: { total: 0, reservado: 0, vendido: 0, disponivel: 0 } },
      ],
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
  await expect(checklist).toContainText("Sugestão: Confirme as medidas do Único antes de publicar.");
  await expect(checklist).toContainText("Feito: À venda em Único.");

  // Tamanhos (0370): liga o Plus, com medidas; o checklist acompanha
  const plus = page.getByRole("group", { name: "Plus · 44 ao 48" });
  await plus.getByLabel("À venda na loja").check();
  await plus.getByLabel("Medidas (uma por linha)").fill("busto: 116");
  await expect(checklist).toContainText("Feito: À venda em Único e Plus.");
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
  expect(enviados[0]!.corpo).toMatchObject({
    nome: "Limone Positano", publicado: false, precoCentavos: 4999,
    variantes: [
      { tamanho: "UNICO", sku: "LIM-AMA-UNI", ativa: true, medidas: {} },
      { tamanho: "PLUS", sku: "LIM-AMA-PLUS", ativa: true, medidas: { busto: 116 } },
    ],
  });
  expect(enviados[1]!.corpo).toMatchObject({ escopo: "ESPECIFICOS", produtos: [{ produtoId: OUTRA }, { produtoId: PECA }], grupo: { qtd: 3, precoCentavos: 11999 } });
});

// Prévia na loja (etapa 1) com a api-admin simulada: coleções e looks desenhados com os componentes da
// loja numa janela na largura do celular ou do computador, mudando enquanto o formulário muda.
test("prévia na loja: coleção e look mudam com o formulário, no celular e no computador", async ({ page, context }) => {
  const C1 = "55555555-5555-4555-8555-555555555551";
  const C2 = "55555555-5555-4555-8555-555555555552";
  const colecoes = [
    { id: C1, nome: "Limone", slug: "limone", descricao: "Sol e limão.", chamada: null, cor: "LIMAO", capa: { caminho: "colecoes/limone.webp", alt: "Limões" }, posicao: 1, ativa: true, produtos: 2,
      campanha: "Ciao, Estate!", temporada: "SS26", edicao: "Coleção 01", capaCelular: null, paleta: "ESTATE_ITALIANA", campanhaAtiva: false, capitulos: [], iconeStory: "limao" },
    { id: C2, nome: "Riviera", slug: "riviera", descricao: null, chamada: null, cor: "MEDITERRANEO", capa: null, posicao: 2, ativa: true, produtos: 0,
      campanha: null, temporada: null, edicao: null, capaCelular: null, paleta: "CLUB", campanhaAtiva: false, capitulos: [], iconeStory: null },
  ];
  const produto = { id: "p1", codigo: "LIM-01", slug: "limone-amalfi", nome: "Limone Amalfi", precoCentavos: 4999, colecaoId: "c1", ativo: true, publicado: true,
    capa: null, fotos: 1, estoque: { total: 5, reservado: 0, vendido: 0, disponivel: 5 } };
  // A 2ª página da lista de peças (de 1 em 1 aqui): os capítulos precisam ver a coleção inteira
  const produto2 = { ...produto, id: "p2", codigo: "LIM-02", slug: "limoncello", nome: "Limoncello" };
  const respostas: Record<string, unknown> = {
    "v1/admin/collections": colecoes,
    "v1/admin/looks": [{ id: "l1", titulo: "Praia", foto: { caminho: "looks/praia.webp", alt: "Praia" }, posicao: 1, ativo: true, produtos: [] }],
    "v1/admin/products": { itens: [produto], total: 1, pagina: 1, porPagina: 20 },
  };
  let salvo: unknown = null;
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const caminho = new URL(rota.request().url()).pathname.replace(/^\/api\//, "");
    if (rota.request().method() !== "GET") {
      salvo = rota.request().postDataJSON();
      return rota.fulfill({ json: { id: C1 } });
    }
    if (caminho === "v1/admin/products" && new URL(rota.request().url()).searchParams.get("colecao")) {
      const pagina = Number(new URL(rota.request().url()).searchParams.get("pagina") ?? "1");
      return rota.fulfill({ json: { itens: pagina === 1 ? [produto] : pagina === 2 ? [produto2] : [], total: 2, pagina, porPagina: 1 } });
    }
    return caminho in respostas ? rota.fulfill({ json: respostas[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  // A aba lista as coleções; cada uma abre a sua página, e "Nova coleção" abre a página vazia
  await page.goto(`${PAINEL}/catalogo?aba=colecoes`);
  await expect(page.getByRole("link", { name: "Nova coleção" })).toHaveAttribute("href", "/catalogo/colecoes/nova");
  await expect(page.getByRole("link", { name: /Riviera/ })).toContainText("Sem capa");
  // Selos: coleção ativa ou oculta e, com campanha, se ela está ligada (Limone: campanha desligada)
  await expect(page.getByRole("link", { name: /Limone/ })).toContainText("Coleção ativa");
  await expect(page.getByRole("link", { name: /Limone/ })).toContainText("Campanha desligada");
  await expect(page.getByRole("link", { name: /Riviera/ })).not.toContainText("Campanha");
  // O ícone do Pick your story (0500); sem escolha, a camiseta
  await expect(page.getByRole("link", { name: /Limone/ })).toContainText("Pick your story: limão");
  await expect(page.getByRole("link", { name: /Riviera/ })).toContainText("Pick your story: camiseta");
  await page.getByRole("link", { name: /Limone/ }).click();
  await expect(page).toHaveURL(`${PAINEL}/catalogo/colecoes/${C1}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Limone");
  await expect(page.locator(".status").filter({ hasText: "Campanha desligada" })).toBeVisible();
  const computador = page.frameLocator('iframe[title="Prévia na loja (computador)"]');
  // Pick your story com as coleções ativas na ordem, o slide do carrossel e o topo da campanha
  await expect(computador.locator("#inicio-colecoes")).toHaveText("Pick your story.");
  await expect(computador.getByText("Riviera", { exact: true })).toBeVisible();
  // Em 3 partes com título; no Pick your story, as outras coleções ficam apagadas
  await expect(computador.getByText(/o Pick your story, com esta coleção em destaque/)).toBeVisible();
  await expect(computador.getByText(/A página desta coleção/)).toBeVisible();
  await expect(computador.locator("#inicio-colecoes + ul li").filter({ hasText: "Riviera" })).toHaveCSS("opacity", "0.3");
  await expect(computador.locator("#inicio-colecoes + ul li").filter({ hasText: "Limone" })).toHaveCSS("opacity", "1");
  await expect(computador.getByText("Ver Limone", { exact: true })).toBeVisible();
  // Parte 3: a página como a loja mostra hoje (campanha desligada: o banner, o nome e a faixa verde
  // da página comum); parte 4: como fica quando a campanha for ligada
  await expect(computador.getByText(/A página desta coleção hoje: o topo$/)).toBeVisible();
  await expect(computador.getByText("Coleção · 2 estampas", { exact: true })).toBeVisible();
  await expect(computador.getByText(/Quando a campanha for ligada/)).toBeVisible();
  await expect(computador.getByText("Ciao, Estate!", { exact: true })).toBeVisible();
  await expect(computador.locator(".paleta-estate-italiana")).toHaveCount(1);
  // O círculo é o ícone escolhido (0500), sem foto
  await expect(computador.locator("#inicio-colecoes + ul svg.lucide-citrus")).toHaveCount(1);
  await expect(computador.locator("#inicio-colecoes + ul img")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Limão" })).toBeChecked();

  // Muda com o formulário, sem salvar
  await page.getByLabel("Nome", { exact: true }).fill("Limone Nuovo");
  await expect(computador.getByText("Ver Limone Nuovo", { exact: true })).toBeVisible();
  await page.getByLabel("Campanha ligada na loja").check();
  await expect(computador.getByText(/Quando a campanha for ligada/)).toHaveCount(0);
  await expect(computador.getByText(/o topo, com a campanha ligada/)).toBeVisible();
  await expect(computador.getByText("Coleção · 2 estampas", { exact: true })).toHaveCount(0);
  // Pick your story só com o nome da coleção, mesmo com a campanha ligada (29/09: o nome da campanha
  // já está no lettering do círculo e aparecia duas vezes); o componente é o mesmo da loja
  await expect(computador.locator("#inicio-colecoes + ul li").filter({ hasText: "Limone Nuovo" })).toHaveText("Limone Nuovo");
  await page.getByLabel("Universo da página").selectOption("RIVIERA");
  await expect(computador.locator(".paleta-riviera")).toHaveCount(1);
  // Outro ícone muda o círculo na prévia, sem salvar
  await page.getByRole("radio", { name: "Pomba" }).check();
  await expect(computador.locator("#inicio-colecoes + ul svg.lucide-bird")).toHaveCount(1);
  await expect(computador.locator("#inicio-colecoes + ul svg.lucide-citrus")).toHaveCount(0);
  // Ligada sem as fotos: o painel avisa o que falta (não impede)
  const aviso = page.getByRole("status").filter({ hasText: "Campanha ligada sem" });
  await expect(aviso).toContainText("a foto do celular 4:5");
  await expect(aviso).toContainText("os capítulos");
  await expect(aviso).not.toContainText("a capa 16:9");

  // Capítulos: as peças de todas as páginas, e uma estampa num capítulo só
  await page.getByRole("button", { name: "Adicionar capítulo" }).click();
  await page.getByRole("button", { name: "Adicionar capítulo" }).click();
  const cap1 = page.getByRole("group", { name: "Capítulo 1" });
  const cap2 = page.getByRole("group", { name: "Capítulo 2" });
  await expect(cap1.getByLabel("Limoncello")).toBeVisible();
  await cap1.getByLabel("Limone Amalfi", { exact: true }).check();
  await expect(cap2.getByLabel("Limone Amalfi (no capítulo 1)")).toBeDisabled();
  await expect(cap2.getByLabel("Limoncello")).toBeEnabled();
  // O capítulo 2 ainda está vazio (não é salvo): só o 1 conta
  await expect(aviso).toContainText("a foto do capítulo 1.");
  await expect(aviso).not.toContainText("os capítulos");
  // Um capítulo com estampa precisa de nome e título para salvar
  await cap1.getByLabel("Nome do capítulo", { exact: true }).fill("Mattina — Mercato");
  await cap1.getByLabel("Título", { exact: true }).fill("Il mercato apre cedo.");

  // No celular, a janela tem a largura do celular (e os tamanhos de celular da loja valem)
  await page.getByRole("button", { name: "Celular" }).click();
  const quadro = page.locator('iframe[title="Prévia na loja (celular)"]');
  await expect(quadro).toHaveCSS("width", "390px");
  const celular = page.frameLocator('iframe[title="Prévia na loja (celular)"]');
  // Tamanho de celular na prévia: o anel do destaque tem 74 px (capa de 66 + respiro de 3 + borda); no computador, 98
  await expect(celular.locator("#inicio-colecoes + ul li span").first()).toHaveCSS("width", "74px");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Salvar fica na página, com o aviso; voltar leva à lista
  await page.getByRole("button", { name: "Salvar coleção" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Coleção salva." })).toBeVisible();
  expect(salvo).toMatchObject({ iconeStory: "pomba" });
  expect(salvo).not.toHaveProperty("fotoStory");
  await expect(page).toHaveURL(`${PAINEL}/catalogo/colecoes/${C1}`);
  await page.getByRole("link", { name: "← Coleções" }).click();
  await expect(page).toHaveURL(`${PAINEL}/catalogo?aba=colecoes`);

  // Look novo: entra na seção do Shop the Look, depois do que já existe, com as peças marcadas
  await page.goto(`${PAINEL}/catalogo?aba=looks`);
  await page.getByRole("button", { name: "Novo look" }).click();
  const looks = page.frameLocator('iframe[title="Prévia na loja (computador)"]');
  await expect(looks.getByText("Shop the Look", { exact: true })).toBeVisible();
  await page.getByLabel("Título").fill("Denim");
  await page.getByLabel("Ordem").fill("5");
  await expect(looks.getByText("Look 02", { exact: true })).toBeVisible();
  await expect(looks.getByText("Denim", { exact: true })).toBeVisible();
  await page.getByLabel(/Limone Amalfi/).check();
  await expect(looks.getByText("Limone Amalfi", { exact: true })).toBeVisible();
});

// Lista VIP (0390) com a api-admin simulada: lista, cupom de boas-vindas, exportar e tirar da lista.
test("Lista VIP: contatos, cupom de boas-vindas, exportar planilha e tirar da lista", async ({ page, context }) => {
  const ID = "44444444-4444-4444-8444-444444444444";
  const enviados: { metodo: string; caminho: string; corpo: unknown }[] = [];
  const respostas: Record<string, unknown> = {
    "v1/admin/dashboard": { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 0, vencidos: 0 }, emPreparacao: 0, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } },
    "v1/admin/vip": { total: 1, itens: [{ id: ID, telefone: "+5577998128809", nome: "Marina", origem: "POPUP", em: "2026-09-28T01:00:00Z" }] },
    "v1/admin/vip/config": { cupom: null, valendo: false, contatos: 1, cupons: [{ codigo: "VIP10", nome: "Boas-vindas VIP", modo: "PERCENTUAL", valor: 10, situacao: "ATIVA" }] },
  };
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const caminho = new URL(r.url()).pathname.replace(/^\/api\//, "");
    if (r.method() !== "GET") {
      enviados.push({ metodo: r.method(), caminho, corpo: r.postData() ? r.postDataJSON() : null });
      if (caminho === "v1/admin/vip/export") return rota.fulfill({ json: [{ telefone: "+5577998128809", nome: "Marina", origem: "POPUP", em: "2026-09-28T01:00:00Z" }] });
      if (caminho === "v1/admin/vip/config") {
        respostas[caminho] = { ...(respostas[caminho] as object), cupom: "VIP10", valendo: true };
        return rota.fulfill({ json: respostas[caminho] });
      }
      return rota.fulfill({ json: { ok: true } });
    }
    return caminho in respostas ? rota.fulfill({ json: respostas[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/vip`);
  await expect(page.getByRole("heading", { level: 1, name: "Lista VIP" })).toBeVisible();
  const contatos = page.getByRole("list", { name: "Contatos da Lista VIP" });
  await expect(contatos).toContainText("Marina");
  await expect(contatos).toContainText("Pop-up");

  await page.getByLabel("Cupom mostrado a quem entra").selectOption("VIP10");
  await expect(page.getByText("Valendo", { exact: true })).toBeVisible();
  expect(enviados.find((e) => e.caminho === "v1/admin/vip/config")).toMatchObject({ metodo: "PUT", corpo: { cupom: "VIP10" } });

  const baixar = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar planilha" }).click();
  expect((await baixar).suggestedFilename()).toMatch(/^lista-vip-\d{4}-\d{2}-\d{2}\.csv$/);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Tirar Marina da lista" }).click();
  await expect.poll(() => enviados.some((e) => e.metodo === "DELETE" && e.caminho === `v1/admin/vip/${ID}`)).toBe(true);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

// Reserva manual (0470) com a api-admin simulada: peça, cliente, desconto com motivo e venda paga.
test("nova reserva: escolhe a peça, vê o total, exige o motivo do desconto e registra a venda paga", async ({ page, context }) => {
  const PECA = "11111111-1111-4111-8111-111111111111";
  const RESERVA = "44444444-4444-4444-8444-444444444444";
  const enviados: { caminho: string; corpo: Record<string, unknown> }[] = [];
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const caminho = new URL(r.url()).pathname.replace(/^\/api\//, "");
    if (caminho === "v1/admin/dashboard") {
      return rota.fulfill({ json: { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 0, vencidos: 0 }, emPreparacao: 0, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } } });
    }
    if (caminho === "v1/admin/products") {
      return rota.fulfill({ json: { itens: [{
        id: PECA, codigo: "LIM-01", slug: "limone", nome: "Limone Amalfi", precoCentavos: 4999, colecaoId: "c1", ativo: true, publicado: true,
        capa: null, fotos: 1, estoque: { total: 2, reservado: 0, vendido: 0, disponivel: 2 },
        tamanhos: [{ id: "v1", tamanho: "UNICO", rotulo: "Único", ativa: true, disponivel: 2 }, { id: "v2", tamanho: "PLUS", rotulo: "Plus", ativa: false, disponivel: 0 }],
      }], pagina: 1, porPagina: 20, total: 1 } });
    }
    const corpo = (r.postDataJSON() ?? {}) as Record<string, unknown>;
    enviados.push({ caminho, corpo });
    if (caminho === "v1/admin/reservations/quote") {
      const qtd = (corpo.itens as { qtd: number }[]).reduce((s, i) => s + i.qtd, 0);
      const manual = Number(corpo.descontoManualCentavos ?? 0);
      return rota.fulfill({ json: { subtotalCentavos: 4999 * qtd, descontoCentavos: 0, descontoManualCentavos: manual, totalCentavos: 4999 * qtd - manual, aplicada: null, cupom: null, linhas: [] } });
    }
    if (caminho === "v1/admin/reservations") return rota.fulfill({ status: 201, json: { reserva: { id: RESERVA, numero: 1050 } } });
    return rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/reservas/nova`);
  await expect(page.getByRole("heading", { level: 1, name: "Nova reserva" })).toBeVisible();
  await page.getByLabel("Nome da cliente").fill("Ana Paula");
  await page.getByLabel("WhatsApp da cliente").fill("(77) 99812-8809");
  await page.getByRole("button", { name: "Adicionar Limone Amalfi, Único" }).click();
  await page.getByRole("button", { name: "Adicionar Limone Amalfi, Único" }).click();
  await expect(page.getByLabel("Quantidade de Limone Amalfi")).toHaveValue("2");
  await expect(page.locator(".price-total")).toHaveText("R$ 99,98");

  await page.getByLabel("Já pago em dinheiro").check();
  await page.getByLabel("Desconto da loja (R$, opcional)").fill("9,98");
  await expect(page.locator(".price-total")).toHaveText("R$ 90,00");
  await page.getByRole("button", { name: "Registrar venda paga" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Escreva o motivo do desconto" })).toBeVisible();
  expect(enviados.filter((e) => e.caminho === "v1/admin/reservations")).toEqual([]);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByLabel("Motivo do desconto").fill("Cliente fiel");
  await page.getByRole("button", { name: "Registrar venda paga" }).click();
  await expect(page).toHaveURL(`${PAINEL}/reservas/${RESERVA}`);
  const criada = enviados.find((e) => e.caminho === "v1/admin/reservations")!.corpo;
  expect(criada).toMatchObject({
    nome: "Ana Paula", telefone: "+5577998128809", entrega: "RETIRADA", pagamento: "DINHEIRO",
    itens: [{ produtoId: PECA, varianteId: "v1", qtd: 2 }], descontoManualCentavos: 998, motivoDesconto: "Cliente fiel", totalEsperadoCentavos: 9000,
  });
});

// WhatsApp em abas (0570) com a api-admin simulada. Base comum: o painel logado, o resumo do
// WhatsApp e os chamados; cada teste responde o que a aba dele pede (tratar) e registra os envios.
const DASH_WA = { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 0, vencidos: 0 }, emPreparacao: 0, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } };
const configWa = (extra: Record<string, unknown> = {}) => ({
  conectado: true, modoLancamento: false, ritmo: { intervaloMinS: 4, intervaloMaxS: 9, tetoHora: 120 }, ritmoLancamento: { intervaloMinS: 2, intervaloMaxS: 5, tetoHora: 600 },
  fila: { pendentes: 2, enviadasHoje: 42, falhasHoje: 1, descartadasHoje: 0, maisAntigaPendente: null }, notificacoes: [], ...extra,
});
const SEM_CHAMADOS = { abertos: [], finalizados: [], notas: { media: null, total: 0 } };
type Envio = { metodo: string; caminho: string; corpo: unknown };
async function simularWhatsapp(page: Page, context: BrowserContext, tratar: (metodo: string, caminho: string, corpo: unknown, busca: URLSearchParams) => unknown) {
  const enviados: Envio[] = [];
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const url = new URL(r.url());
    const caminho = url.pathname.replace(/^\/api\//, "");
    const corpo = r.postData() ? r.postDataJSON() : null;
    if (r.method() !== "GET") enviados.push({ metodo: r.method(), caminho, corpo });
    const resposta = tratar(r.method(), caminho, corpo, url.searchParams);
    if (resposta !== undefined) return rota.fulfill({ json: resposta });
    const base: Record<string, unknown> = { "v1/admin/dashboard": DASH_WA, "v1/admin/whatsapp": configWa(), "v1/admin/whatsapp/chamados": SEM_CHAMADOS };
    return caminho in base ? rota.fulfill({ json: base[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });
  return enviados;
}
const semViolacoes = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
};

// Atendimento: a faixa do topo, as conversas (quem precisa de vocês primeiro), a conversa inteira
// em balões, a ficha com o chamado e as reservas, assumir e os números; no celular, uma coisa por vez.
test("WhatsApp: atendimento com faixa, conversas, conversa em balões e ficha", async ({ page, context }) => {
  const ha = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  let chamado = { numero: 12, status: "ABERTO", motivo: "DUVIDA", abertoEm: ha(30), assumidoEm: null as string | null, assumidoVia: null as string | null, assumidoPor: null as string | null,
    lembreteEm: null, resolvidoEm: null, resolvidoVia: null, resolvidoPor: null, notaPedida: false, nota: null };
  const antigo = { ...chamado, numero: 11, status: "RESOLVIDO", motivo: "EQUIPE", abertoEm: ha(3000), resolvidoEm: ha(2900), resolvidoVia: "WHATSAPP", notaPedida: true, nota: 5 };
  const conversas = () => [
    { chat: "5577998128809", telefone: "+5577998128809", nome: "Ana", ultima: { em: ha(28), texto: "é pra amanhã", como: "CHAMADO" }, equipeRespondeuEm: null, chamado },
    { chat: "5577991110002", telefone: "+5577991110002", nome: "Bia", ultima: { em: ha(90), texto: "qual o frete?", como: "RESPOSTA" }, equipeRespondeuEm: null, chamado: null },
  ];
  const conversa = () => ({
    chat: "5577998128809", telefone: "+5577998128809", nome: "Ana", bloqueado: false,
    eventos: [
      { tipo: "ENVIO", em: ha(2000), id: "12345678-0000-4000-8000-000000000000", modelo: "pedido_entregue", params: { numero: 1031 }, status: "LIDA", erro: null, tentativas: 1 },
      { tipo: "CLIENTE", em: ha(40), texto: "qual o frete?", como: "RESPOSTA", resposta: { titulo: "Entrega e frete", acao: "TEXTO", texto: "Você escolhe *depois* de pagar." } },
      { tipo: "CLIENTE", em: ha(30), texto: "Vocês fazem embrulho pra presente?", como: "CHAMADO", resposta: null },
      { tipo: "CHAMADO", em: ha(30), evento: "ABERTO", numero: 12, motivo: "DUVIDA", via: null, por: null, nota: null },
      { tipo: "EQUIPE", em: ha(5) },
    ],
    reservas: [{ id: "e1111111-1111-4111-8111-111111111111", numero: 1048, status: "RESERVADO", totalCentavos: 4999, criadaEm: ha(50), expiraEm: null, entregueEm: null, substatus: null }],
    chamados: [chamado, antigo],
  });
  const enviados = await simularWhatsapp(page, context, (metodo, caminho, _c, busca) => {
    if (caminho === "v1/admin/whatsapp/chamados") return { abertos: chamado.status === "RESOLVIDO" ? [] : [chamado], finalizados: [antigo], notas: { media: 5, total: 1 } };
    if (caminho === "v1/admin/whatsapp/conversas") return conversas();
    if (caminho === "v1/admin/whatsapp/conversa") return conversa();
    if (caminho === "v1/admin/whatsapp/chamados/12/assumir") { chamado = { ...chamado, status: "EM_ATENDIMENTO", assumidoEm: ha(0), assumidoVia: "PAINEL", assumidoPor: "Carol" }; return SEM_CHAMADOS; }
    if (caminho === "v1/admin/whatsapp/numeros") return { dias: Number(busca.get("dias")), conversas: 12, soClubinha: 9, chamados: 3, abertos: 1, porMotivo: { EQUIPE: 1, TROCA: 1, DUVIDA: 1 },
      minutosAteAssumir: 14, minutosAteFinalizar: 95, lembretes: 1, notas: { media: 4.5, total: 2, porNota: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } } };
    return metodo === "GET" ? undefined : SEM_CHAMADOS;
  });

  await page.goto(`${PAINEL}/whatsapp`);
  await expect(page.getByRole("navigation", { name: "Áreas do WhatsApp" }).getByRole("link", { name: "Atendimento" })).toHaveAttribute("aria-current", "page");
  const faixa = page.getByRole("region", { name: "Resumo do WhatsApp" });
  await expect(faixa).toContainText("Conectado");
  await expect(faixa).toContainText("1 chamado aberto");
  await expect(faixa).toContainText("30 min esperando a equipe");
  await expect(faixa).toContainText("42 enviadas hoje");
  await expect(faixa.getByRole("link", { name: "1 falha hoje" })).toHaveAttribute("href", "/whatsapp/envios?status=FALHOU");

  // Quem precisa de vocês primeiro; "Todas" mostra a Bia também
  const lista = page.getByRole("list", { name: "Conversas" });
  await expect(page.getByRole("button", { name: /Precisa de vocês/ })).toHaveAttribute("aria-pressed", "true");
  await expect(lista.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(lista.getByRole("listitem")).toHaveCount(2);
  await page.getByLabel("Buscar conversa").fill("#12");
  await expect(lista.getByRole("listitem")).toHaveCount(1);

  // A conversa inteira, com o número no corpo do pedido
  await lista.getByRole("button", { name: /Ana/ }).click();
  await expect(page.getByRole("heading", { name: "Ana", level: 2 })).toBeFocused();
  expect(enviados.find((e) => e.caminho === "v1/admin/whatsapp/conversa")).toEqual({ metodo: "POST", caminho: "v1/admin/whatsapp/conversa", corpo: { chat: "5577998128809" } });
  const bolhas = page.getByRole("list", { name: "Conversa com Ana" });
  await expect(bolhas).toContainText("Mensagem automática · Pedido entregue");
  await expect(bolhas).toContainText("#1031");
  await expect(bolhas).toContainText("Respondeu: Entrega e frete");
  await expect(bolhas.locator("b", { hasText: "depois" })).toBeVisible();
  await expect(bolhas).toContainText("Chamado #12 aberto · Dúvida que a Clubinha não respondeu");
  await expect(bolhas).toContainText("Respondeu pelo celular da loja");
  await expect(page.getByRole("link", { name: /Abrir no WhatsApp/ })).toHaveAttribute("href", "https://wa.me/5577998128809");

  // A ficha: o chamado, as reservas e os anteriores; assumir pelo painel
  const ficha = page.getByRole("complementary", { name: "Ficha da cliente" });
  await expect(ficha.getByRole("link", { name: "#1048" })).toHaveAttribute("href", "/reservas/e1111111-1111-4111-8111-111111111111");
  await expect(ficha).toContainText("nota 5 de 5");
  await ficha.getByRole("button", { name: "Assumir o chamado #12" }).click();
  await expect(ficha).toContainText("assumido por Carol pelo painel");
  await expect(ficha.getByRole("button", { name: "Assumir o chamado #12" })).toHaveCount(0);
  expect(enviados.some((e) => e.caminho === "v1/admin/whatsapp/chamados/12/assumir")).toBe(true);

  // Números do atendimento
  const numeros = page.getByRole("region", { name: "Números do atendimento" });
  await expect(numeros).toContainText("75%");
  await expect(numeros).toContainText("14 min");
  await numeros.getByRole("button", { name: "30 dias" }).click();
  await expect(numeros.getByRole("button", { name: "30 dias" })).toHaveAttribute("aria-pressed", "true");
  await semViolacoes(page);

  // No celular, a conversa toma a tela e volta para a lista
  await page.getByRole("button", { name: "← Conversas" }).click();
  await expect(lista).toBeVisible();
  // No computador, as três colunas juntas
  await page.setViewportSize({ width: 1440, height: 900 });
  await lista.getByRole("button", { name: /Ana/ }).click();
  await expect(lista).toBeVisible();
  await expect(ficha).toBeVisible();
  await expect(page.getByRole("button", { name: "← Conversas" })).toBeHidden();
  await semViolacoes(page);
});

// Clubinha: o menu na ordem, a prévia num celular (negrito e endereço reais, os dois defeitos da
// tela antiga), resposta nova com as palavras normalizadas, ordem, desligar e o horário.
test("WhatsApp: Clubinha com menu, prévia no celular e horário de atendimento", async ({ page, context }) => {
  const ids = ["a1111111-1111-4111-8111-111111111111", "a2222222-2222-4222-8222-222222222222", "a3333333-3333-4333-8333-333333333333"];
  let lista = {
    pausaHoras: 4, atendimento: { inicioHora: 8, fimHora: 20, lembreteMinutos: 20 }, loja: { endereco: "R. Sátiro Santos, 38", horario: "Aberto 24 horas" },
    respostas: [
      { id: ids[0], acao: "TEXTO", titulo: "Horário e endereço", palavras: ["endereco"], texto: "A loja fica aqui:\n📍 {endereco}", ativa: true },
      { id: ids[1], acao: "MINHA_RESERVA", titulo: "Minha reserva", palavras: [], texto: null, ativa: true },
      { id: ids[2], acao: "EQUIPE", titulo: "Falar com a equipe", palavras: ["atendente"], texto: "Pronto! Já avisamos a equipe.", ativa: true },
    ] as { id: string; acao: string; titulo: string; palavras: string[]; texto: string | null; ativa: boolean }[],
  };
  const enviados = await simularWhatsapp(page, context, (metodo, caminho, corpo) => {
    if (!caminho.startsWith("v1/admin/whatsapp/respostas")) return undefined;
    const c = corpo as Record<string, never>;
    const id = caminho.split("/").at(-1)!;
    if (metodo === "POST") lista.respostas.push({ id: "a4444444-4444-4444-8444-444444444444", acao: "TEXTO", texto: null, ativa: true, ...c });
    else if (caminho.endsWith("/ordem")) lista.respostas = (c.ids as string[]).map((i) => lista.respostas.find((x) => x.id === i)!);
    else if (caminho.endsWith("/pausa")) lista = { ...lista, pausaHoras: c.pausaHoras, atendimento: { inicioHora: c.inicioHora, fimHora: c.fimHora, lembreteMinutos: c.lembreteMinutos } };
    else if (metodo === "PUT") lista.respostas = lista.respostas.map((x) => (x.id === id ? { ...x, ...c } : x));
    return lista;
  });

  await page.goto(`${PAINEL}/whatsapp/clubinha`);
  const celular = page.locator(".wa-celular");
  await expect(celular).toContainText("1 · Horário e endereço");
  await expect(celular.locator("b", { hasText: /^1$/ })).toBeVisible();
  await expect(celular).not.toContainText("*1*");
  // O texto da opção mostra o endereço da loja, não {endereco}
  const menu = page.getByRole("region", { name: "Menu da Clubinha" });
  await expect(menu).toContainText("📍 R. Sátiro Santos, 38");
  await expect(menu).not.toContainText("{endereco}");
  await menu.getByRole("button", { name: "Ver no celular “Horário e endereço”" }).click();
  await expect(celular).toContainText("A loja fica aqui:");
  await expect(celular).toContainText("Manda menu que eu te mostro as opções");

  // Nova resposta: palavra curta não passa; depois, palavras sem acento e sem repetir
  await menu.getByRole("button", { name: "Nova resposta" }).click();
  const nova = menu.getByRole("form", { name: "Nova resposta" });
  await nova.getByLabel("Nome no menu").fill("Pagamento");
  await nova.getByLabel("Palavras que disparam a resposta").fill("PIX, x");
  await nova.getByLabel("Texto da resposta").fill("PIX ou cartão, pelo site.");
  await nova.getByRole("button", { name: "Criar resposta" }).click();
  await expect(nova.getByText(/“x” não serve/)).toBeVisible();
  await nova.getByLabel("Palavras que disparam a resposta").fill("PIX, Cartão de crédito, pix");
  await nova.getByRole("button", { name: "Criar resposta" }).click();
  await expect(celular).toContainText("4 · Pagamento");
  expect(enviados.at(-1)).toEqual({ metodo: "POST", caminho: "v1/admin/whatsapp/respostas",
    corpo: { titulo: "Pagamento", palavras: ["pix", "cartao de credito"], texto: "PIX ou cartão, pelo site.", ativa: true } });

  // A equipe sobe; Minha reserva desligada sai do menu
  await menu.getByRole("button", { name: "Subir “Falar com a equipe”" }).click();
  await expect(celular).toContainText("2 · Falar com a equipe");
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/whatsapp/respostas/ordem", corpo: { ids: [ids[0], ids[2], ids[1], "a4444444-4444-4444-8444-444444444444"] } });
  await menu.getByRole("button", { name: "Editar “Minha reserva”" }).click();
  const minha = menu.getByRole("form", { name: "Editar “Minha reserva”" });
  await expect(minha.getByLabel("Texto da resposta")).toHaveCount(0);
  await minha.getByRole("checkbox", { name: "Ativa no menu" }).click();
  await minha.getByRole("button", { name: "Salvar" }).click();
  await expect(celular).not.toContainText("Minha reserva");
  await expect(menu.getByText("Desligada")).toBeVisible();

  // Horário de atendimento: início antes do fim
  const horario = page.getByRole("form", { name: "Horário de atendimento" });
  await horario.getByLabel("Começa às (hora)").fill("21");
  await horario.getByRole("button", { name: "Salvar horário" }).click();
  await expect(horario.getByText(/vem depois do início/)).toBeVisible();
  await horario.getByLabel("Começa às (hora)").fill("9");
  await horario.getByLabel("Termina às (hora)").fill("18");
  await horario.getByLabel("Minutos até o lembrete").fill("30");
  await horario.getByLabel("Horas de silêncio da Clubinha").fill("6");
  await horario.getByRole("button", { name: "Salvar horário" }).click();
  await expect(page.getByRole("form", { name: "Horário de atendimento" })).toContainText("Das 9h às 18h, se ninguém assumir um chamado em 30 minutos");
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/whatsapp/respostas/pausa", corpo: { inicioHora: 9, fimHora: 18, lembreteMinutos: 30, pausaHoras: 6 } });
  await semViolacoes(page);
});

// Mensagens automáticas: por etapa, com a prévia do texto e o liga e desliga.
test("WhatsApp: mensagens automáticas por etapa, com a prévia", async ({ page, context }) => {
  let posVenda = false;
  const notificacoes = () => [
    { id: "codigo", nome: "Código de verificação", quando: "Quando a cliente pede o código", essencial: true, ligada: true },
    { id: "pedido_entregue", nome: "Pedido entregue", quando: "Quando a loja confirma a entrega", essencial: false, ligada: true },
    { id: "pos_venda", nome: "Pós-entrega", quando: "2 dias depois da entrega", essencial: false, ligada: posVenda },
  ];
  const enviados = await simularWhatsapp(page, context, (metodo, caminho, corpo) => {
    if (caminho === "v1/admin/settings/whatsapp") posVenda = (corpo as { notificacoes: { pos_venda: boolean } }).notificacoes.pos_venda;
    if (caminho === "v1/admin/whatsapp" || caminho === "v1/admin/settings/whatsapp") return configWa({ notificacoes: notificacoes() });
    return undefined;
  });

  await page.goto(`${PAINEL}/whatsapp/mensagens`);
  const reserva = page.getByRole("region", { name: "Reserva" });
  await expect(reserva).toContainText("Essencial");
  const entrega = page.getByRole("region", { name: "Entrega" });
  await entrega.getByText("Ver a mensagem").click();
  await expect(entrega).toContainText("#1048");
  const pos = page.getByRole("region", { name: "Pós-venda" });
  await expect(pos).toContainText("0 de 1 ligada");
  await pos.getByRole("checkbox", { name: "Enviar “Pós-entrega”" }).click();
  await expect(pos).toContainText("1 de 1 ligada");
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/settings/whatsapp", corpo: { notificacoes: { pos_venda: true } } });
  await semViolacoes(page);
});

// Envios: o histórico com o filtro vindo da faixa, o motivo da falha, "Tentar de novo" e o ritmo.
test("WhatsApp: envios com falha, tentar de novo e ritmo", async ({ page, context }) => {
  const falhou = { id: "f1111111-1111-4111-8111-111111111111", telefone: "+5577998128809", modelo: "pedido_entregue", params: { numero: 1048 }, status: "FALHOU", tentativas: 5,
    criadaEm: "2026-10-03T12:00:00Z", enviadaEm: null, entregueEm: null, proximaTentativa: null, erro: "recusada", nome: "Ana",
    reserva: { id: "e1111111-1111-4111-8111-111111111111", numero: 1048 }, naoReenvia: null as string | null };
  const semLink = { ...falhou, id: "f2222222-2222-4222-8222-222222222222", modelo: "reserva_criada", params: { numero: 1049, nome: "Bia", pecas: 1, totalCentavos: 4999, expiraEm: "2026-10-03T13:00:00Z" },
    nome: "Bia", reserva: { id: "e2222222-2222-4222-8222-222222222222", numero: 1049 }, naoReenvia: "SEM_LINK" };
  const dias = Array.from({ length: 7 }, (_, i) => ({ dia: `2026-09-${String(27 + i).padStart(2, "0")}`, enviadas: i * 5, falhas: i === 6 ? 2 : 0, descartadas: 0 }));
  const enviados = await simularWhatsapp(page, context, (metodo, caminho, _c, busca) => {
    if (caminho === "v1/admin/whatsapp/envios") return { mensagens: busca.get("status") === "FALHOU" ? [falhou, semLink] : [], dias };
    if (caminho.endsWith("/reenviar")) { falhou.status = "PENDENTE"; falhou.naoReenvia = "STATUS"; return { ok: true }; }
    if (caminho === "v1/admin/settings/whatsapp") return configWa();
    return undefined;
  });

  await page.goto(`${PAINEL}/whatsapp/envios?status=FALHOU`);
  await expect(page.getByRole("button", { name: "Falharam" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Enviadas por dia" }).getByRole("table")).toContainText("2");
  const lista = page.getByRole("list", { name: "Mensagens da fila" });
  await expect(lista).toContainText("Falhou depois de 5 tentativas: recusada");
  await expect(lista).toContainText("Tinha o link da reserva, que não fica guardado.");
  await expect(lista.getByRole("button", { name: /Tentar de novo/ })).toHaveCount(1);
  const tentar = lista.getByRole("button", { name: /Tentar de novo/ });
  await expect(tentar).toHaveAccessibleName(/Pedido entregue para Ana/);
  await tentar.click();
  await expect(page.getByRole("status").filter({ hasText: "de volta na fila" })).toContainText("Pedido entregue para Ana: de volta na fila.");
  expect(enviados.find((e) => e.caminho.endsWith("/reenviar"))).toEqual({ metodo: "POST", caminho: `v1/admin/whatsapp/envios/${falhou.id}/reenviar`, corpo: {} });

  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(page.getByText("Nenhuma mensagem neste período.")).toBeVisible();

  const ritmo = page.getByRole("form", { name: "Ritmo de envio" });
  await ritmo.getByLabel("Intervalo máximo (segundos)").fill("3");
  await ritmo.getByRole("button", { name: "Salvar ritmo" }).click();
  await expect(ritmo.getByText(/maior que o mínimo/)).toBeVisible();
  await ritmo.getByLabel("Intervalo máximo (segundos)").fill("12");
  await ritmo.getByRole("button", { name: "Salvar ritmo" }).click();
  await expect.poll(() => enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/settings/whatsapp",
    corpo: { modoLancamento: false, ritmo: { intervaloMinS: 4, intervaloMaxS: 12, tetoHora: 120 } } });
  await semViolacoes(page);
});

// Configurações: desconectado em destaque, avisos para a equipe e um teste só, já com o número.
test("WhatsApp: configurações com avisos para a equipe e teste", async ({ page, context }) => {
  const AVISOS = [
    { id: "nova_reserva", nome: "Nova reserva", quando: "Quando uma cliente reserva pelo site" },
    { id: "lista_vip", nome: "Entrou na lista VIP", quando: "Quando alguém se inscreve na lista VIP" },
  ];
  let avisos = { telefone: null as string | null, desligados: [] as string[] };
  const tela = () => ({ telefone: avisos.telefone, avisos: AVISOS.map((a) => ({ ...a, ligado: !avisos.desligados.includes(a.id) })) });
  const enviados = await simularWhatsapp(page, context, (metodo, caminho, corpo) => {
    if (caminho === "v1/admin/whatsapp") return configWa({ conectado: false });
    if (caminho === "v1/admin/whatsapp/avisos") { if (metodo === "PUT") avisos = { ...avisos, ...(corpo as object) }; return tela(); }
    if (caminho === "v1/admin/whatsapp/test") return { ok: true, naFila: true };
    return undefined;
  });

  await page.goto(`${PAINEL}/whatsapp/configuracoes`);
  await expect(page.getByRole("region", { name: "Resumo do WhatsApp" })).toContainText("Desconectado");
  await expect(page.getByRole("link", { name: "Conectar agora" })).toHaveAttribute("href", "/whatsapp/configuracoes");
  await expect(page.getByRole("button", { name: "Mostrar QR code" })).toBeVisible();

  const card = page.getByRole("region", { name: "Avisos para a equipe" });
  await expect(card).toContainText("Desligados: grave um número para começar.");
  await expect(card.getByRole("checkbox", { name: "Avisar “Nova reserva”" })).toBeDisabled();
  await card.getByLabel("WhatsApp que recebe os avisos").fill("77 9988");
  await card.getByRole("button", { name: "Ligar os avisos" }).click();
  await expect(card.getByText(/Digite o número com DDD/)).toBeVisible();
  await card.getByLabel("WhatsApp que recebe os avisos").fill("(77) 99888-7777");
  await card.getByRole("button", { name: "Ligar os avisos" }).click();
  await expect(card).toContainText("Ligados para (77) 99888-7777.");
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/whatsapp/avisos", corpo: { telefone: "+5577998887777" } });
  await card.getByRole("checkbox", { name: "Avisar “Entrou na lista VIP”" }).click();
  await expect(card.getByRole("checkbox", { name: "Avisar “Entrou na lista VIP”" })).not.toBeChecked();
  expect(enviados.at(-1)!.corpo).toEqual({ desligados: ["lista_vip"] });

  // Um teste só, já com o número da equipe
  const teste = page.getByRole("form", { name: "Testar o envio" });
  await expect(teste.getByLabel("WhatsApp da equipe")).toHaveValue("(77) 99888-7777");
  await teste.getByRole("button", { name: "Enviar teste" }).click();
  await expect(teste).toContainText("Mensagem na fila.");
  expect(enviados.at(-1)).toEqual({ metodo: "POST", caminho: "v1/admin/whatsapp/test", corpo: { telefone: "+5577998887777" } });
  await expect(page.getByRole("button", { name: "Enviar aviso de teste" })).toHaveCount(0);
  await semViolacoes(page);

  await card.getByRole("button", { name: "Parar os avisos" }).click();
  await expect(card).toContainText("Desligados: grave um número para começar.");
});

// Entregas e frete em Kanban (03/10) com a api-admin simulada: uma coluna por etapa, contagem,
// filtro por modalidade, busca, o botão do cartão muda a etapa e a etapa da Operação em destaque.
test("Entregas e frete: Kanban por etapa, filtro, busca e ações do cartão", async ({ page, context }) => {
  const enviados: { metodo: string; caminho: string; corpo: unknown }[] = [];
  const reserva = (n: number, nome: string, id: string) => ({ id, numero: n, nome, telefone: "+5577998128809", totalCentavos: 4999, pagaEm: "2026-10-10T13:00:00Z" });
  let lista = [
    { modalidade: "RETIRADA", substatus: "EM_PREPARACAO", codigoRetirada: "29LFET", reserva: reserva(1001, "Ana", "e1111111-1111-4111-8111-111111111111"),
      desde: new Date().toISOString(), pecas: [{ nome: "Limone Amalfi", tamanho: "Único · P ao 42", qtd: 1 }, { nome: "Pomodoro", tamanho: "Plus · 44 ao 48", qtd: 2 }] },
    { modalidade: "MOTOBOY", substatus: "AGUARDANDO_CALCULO_FRETE", endereco: { cep: "46400000", rua: "Rua A", numero: "10", bairro: "Centro", cidade: "Caetité", uf: "BA" },
      reserva: reserva(1002, "Bia", "e2222222-2222-4222-8222-222222222222"), desde: new Date(Date.now() - 50 * 3_600_000).toISOString() },
    { modalidade: "ENVIO", substatus: "FRETE_VENCIDO", frete: { valorCentavos: 2500, pagarAte: "2026-10-10T15:00:00Z" }, endereco: { rua: "Rua B", numero: "5", bairro: "Centro", cidade: "Guanambi", uf: "BA" },
      reserva: reserva(1003, "Carla", "e3333333-3333-4333-8333-333333333333") },
    { modalidade: "ENVIO", substatus: "ENVIADO", rastreio: "QB123456789BR", reserva: reserva(1004, "Duda", "e4444444-4444-4444-8444-444444444444") },
    { modalidade: "MOTOBOY", substatus: "SAIU_PARA_ENTREGA", reserva: { ...reserva(1005, "Eva", "e5555555-5555-4555-8555-555555555555"), status: "ENTREGUE", entregueEm: "2026-10-10T18:00:00Z" } },
  ] as Record<string, unknown>[];
  const respostas: Record<string, unknown> = {
    "v1/admin/dashboard": { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 1, vencidos: 1 }, emPreparacao: 1, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } },
  };
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const caminho = new URL(r.url()).pathname.replace(/^\/api\//, "");
    if (caminho === "v1/admin/fulfillments") return rota.fulfill({ json: lista });
    if (r.method() !== "GET") {
      const corpo = r.postData() ? r.postDataJSON() : null;
      enviados.push({ metodo: r.method(), caminho, corpo });
      if (caminho.endsWith("/deliver")) lista = lista.map((f) => ((f.reserva as { id: string }).id === caminho.split("/")[3] ? { ...f, reserva: { ...(f.reserva as object), status: "ENTREGUE", entregueEm: "2026-10-10T19:00:00Z" } } : f));
      if (caminho.endsWith("/fulfillment/substatus")) lista = lista.map((f) => ((f.reserva as { id: string }).id === caminho.split("/")[3] ? { ...f, substatus: corpo.substatus } : f));
      return rota.fulfill({ json: { ok: true } });
    }
    return caminho in respostas ? rota.fulfill({ json: respostas[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/entregas?substatus=FRETE_VENCIDO`);
  const coluna = (titulo: string) => page.getByRole("region", { name: titulo, exact: true });
  await expect(coluna("Calcular o frete")).toHaveClass(/destaque/);
  await expect(coluna("Calcular o frete").getByRole("article")).toHaveCount(2);
  await expect(coluna("Calcular o frete")).toContainText("Frete vencido");
  await expect(coluna("Em preparação")).toContainText("29LFET");
  await expect(coluna("Retirada e a caminho")).toContainText("QB123456789BR");
  // O mesmo quadro da Operação: 5 colunas, a vazia com o 0 e o aviso
  await expect(page.locator(".kanban .lane")).toHaveCount(5);
  await expect(coluna("Com a cliente")).toContainText("Nada por aqui agora.");
  await expect(coluna("Com a cliente").locator(".lane-count")).toHaveText("0");
  // Resumo: com a loja (calcular, preparar, a caminho), esperando a cliente, parados e entregues
  const resumo = page.getByRole("region", { name: "Resumo das entregas" });
  await expect(resumo).toContainText("4 com a loja");
  await expect(resumo).toContainText("0 esperando a cliente");
  await expect(resumo).toContainText("1 parado há mais de 1 dia");
  await expect(resumo).toContainText("1 entregue em 7 dias");
  // O cartão: peças, tempo na etapa (vermelho depois de 2 dias), endereço com Copiar, WhatsApp e Ver pedido
  await expect(page.getByRole("article", { name: "#1001" }).locator(".order-name")).toHaveText("Ana · 3 peças");
  await expect(page.getByRole("article", { name: "#1001" }).locator(".k-pecas")).toHaveText("Limone Amalfi, Pomodoro (Plus) × 2");
  await expect(page.getByRole("article", { name: "#1002" }).locator(".k-time")).toHaveClass(/atrasado/);
  await expect(page.getByRole("article", { name: "#1002" })).toContainText(/Próximo passo\s*Calcular o frete/);
  await expect(page.getByRole("article", { name: "#1002" }).getByRole("button", { name: "Copiar o endereço do pedido #1002" })).toBeVisible();
  await expect(page.getByRole("article", { name: "#1002" }).getByRole("link", { name: /WhatsApp de Bia/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/5577998128809/);
  await expect(page.getByRole("article", { name: "#1002" }).getByRole("link", { name: "Ver pedido #1002" })).toHaveAttribute("href", "/reservas/e2222222-2222-4222-8222-222222222222");
  // Só o que é com a loja
  await page.getByRole("button", { name: "Com a loja", exact: true }).click();
  await expect(coluna("Entregues")).toContainText("Nada com este filtro.");
  await expect(coluna("Calcular o frete").getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  // Entregue: na última coluna, sem botões, e fora de "Retirada e a caminho"
  await expect(coluna("Retirada e a caminho").getByRole("article")).toHaveCount(1);
  await expect(coluna("Entregues").getByRole("article", { name: "#1005" })).toContainText("Entregue");
  await expect(coluna("Entregues").getByRole("button")).toHaveCount(0);

  // Filtro e busca
  await page.getByRole("button", { name: "Envio", exact: true }).click();
  await expect(coluna("Calcular o frete").getByRole("article")).toHaveCount(1);
  await expect(coluna("Em preparação")).toContainText("Nada com este filtro.");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.getByLabel("Buscar pedido").fill("bia");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Buscar pedido").fill("");

  // Calcular o frete abre o formulário no cartão
  const bia = page.getByRole("article", { name: "#1002" });
  await bia.getByRole("button", { name: "Calcular o frete" }).click();
  await expect(bia.getByLabel("Valor do frete (R$)")).toBeVisible();

  // O botão do cartão leva o pedido para a próxima coluna
  await page.getByRole("article", { name: "#1001" }).getByRole("button", { name: /Marcar: Pronto para retirada/ }).click();
  await expect(coluna("Retirada e a caminho").getByRole("article", { name: "#1001" })).toBeVisible();
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/reservations/e1111111-1111-4111-8111-111111111111/fulfillment/substatus", corpo: { substatus: "PRONTO_PARA_RETIRADA" } });

  // Marcar como entregue leva o pedido para a coluna Entregue, o mais recente primeiro
  const duda = page.getByRole("article", { name: "#1004" });
  await duda.getByRole("button", { name: "Marcar como entregue" }).click();
  await duda.getByRole("button", { name: "Confirmar entrega" }).click();
  await expect(coluna("Entregues").getByRole("article")).toHaveCount(2);
  await expect(coluna("Entregues").getByRole("article").first()).toHaveAccessibleName("#1004");
  await expect(coluna("Retirada e a caminho").getByRole("article")).toHaveCount(1);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // No computador, as 5 colunas lado a lado e do mesmo tamanho, como no Kanban do dia
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect.poll(async () => (await coluna("Com a cliente").boundingBox())?.width).toBeGreaterThan(262);
  const larguras = await page.locator(".kanban .lane").evaluateAll((ls) => ls.map((l) => Math.round(l.getBoundingClientRect().width)));
  expect(new Set(larguras).size).toBe(1);
  const tops = await page.locator(".kanban .lane").evaluateAll((ls) => ls.map((l) => Math.round(l.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // No topo, ao lado de "Operação online", o acesso rápido ao WhatsApp Web
  const whats = page.getByRole("banner").getByRole("link", { name: "WhatsApp (abre o WhatsApp Web em outra aba)" });
  await expect(whats).toHaveAttribute("href", "https://web.whatsapp.com/");
  await expect(whats).toHaveAttribute("target", "_blank");
  expect((await whats.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

// Histórico de cancelamentos e de pagamentos (0600) com a api-admin simulada: o cancelamento feito
// pela loja aparece em Cancelamentos → Histórico, e Pagamentos abre com todos os pagamentos.
test("Cancelamentos e Pagamentos: o histórico com o cancelamento da loja e todos os pagamentos", async ({ page, context }) => {
  const reserva = { id: "e1111111-1111-4111-8111-111111111111", numero: 1001, status: "EXPIRADO", nome: "teste", telefone: "+5577998128809", totalCentavos: 400 };
  const pagamentos = [
    { id: "p2", status: "PENDENTE", grupo: "AGUARDANDO", forma: "PIX", finalidade: "PRODUTOS", valorCentavos: 4999, criadoEm: "2026-10-03T22:00:00Z",
      reserva: { ...reserva, id: "e2222222-2222-4222-8222-222222222222", numero: 1002, nome: "Ana", status: "RESERVADO", totalCentavos: 4999 } },
    { id: "p1", status: "ESTORNADO", grupo: "ESTORNADO", forma: "PIX", finalidade: "PRODUTOS", valorCentavos: 400, criadoEm: "2026-10-03T13:00:00Z",
      aprovadoEm: "2026-10-03T13:01:00Z", estornadoEm: "2026-10-03T20:30:00Z", idProvedor: "128700000", reserva },
  ];
  const pedidos: string[] = [];
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const url = new URL(rota.request().url());
    const caminho = url.pathname.replace(/^\/api\//, "");
    pedidos.push(caminho + url.search);
    if (caminho === "v1/admin/cancellation-requests") return rota.fulfill({ json: [] });
    if (caminho === "v1/admin/store-cancellations") {
      return rota.fulfill({ json: [{ id: reserva.id, canceladaEm: "2026-10-03T20:30:00Z", canceladaPor: "Carol", motivo: "Teste de estorno", pago: true, estornoCentavos: 400, reserva }] });
    }
    if (caminho === "v1/admin/payment-reviews") return rota.fulfill({ json: [] });
    if (caminho === "v1/admin/payments") {
      const grupo = url.searchParams.get("grupo");
      return rota.fulfill({ json: { totais: { AGUARDANDO: 1, ESTORNADO: 1 }, itens: pagamentos.filter((p) => grupo === "TODOS" || p.grupo === grupo) } });
    }
    return rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  // Sem pedido pendente, a tela já abre no Histórico
  await page.goto(`${PAINEL}/cancelamentos`);
  await expect(page.getByRole("button", { name: "Histórico" })).toHaveAttribute("aria-pressed", "true");
  const cartao = page.getByRole("region", { name: "Cancelamento da loja, reserva #1001" });
  await expect(cartao).toContainText("Cancelado pela loja");
  await expect(cartao).toContainText("“Teste de estorno”");
  await expect(cartao).toContainText("por Carol");
  await expect(cartao).toContainText("Estorno de R$ 4,00 no Mercado Pago");
  await page.getByRole("button", { name: "Pendentes" }).click();
  await expect(page.getByText("Nenhum pedido esperando decisão.")).toBeVisible();
  await page.getByRole("button", { name: "Ver o histórico" }).click();
  await expect(cartao).toBeVisible();
  let axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.goto(`${PAINEL}/pagamentos`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pagamentos");
  const lista = page.getByRole("list", { name: "Pagamentos" });
  await expect(lista.getByRole("listitem")).toHaveCount(2);
  await expect(lista.getByRole("listitem").first()).toContainText("Aguardando pagamento");
  await expect(lista.getByRole("listitem").last()).toContainText("Mercado Pago nº 128700000");
  await expect(lista.getByRole("listitem").last()).toContainText("Estornado em");
  await expect(page.getByRole("button", { name: "Todos · 2" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Estornados · 1" }).click();
  await expect(lista.getByRole("listitem")).toHaveCount(1);
  expect(pedidos).toContain("v1/admin/payments?grupo=ESTORNADO");
  await page.getByRole("button", { name: /^Em análise/ }).first().click();
  await expect(page.getByText("Nenhum pagamento esperando decisão.")).toBeVisible();
  axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

// Dashboard (0610) com a api-admin simulada: o pedido pago que a loja cancelou fica fora da conta, e
// zero hoje com zero ontem aparece como "igual", não solto.
test("Dashboard: o pedido cancelado pela loja fica fora da conta", async ({ page, context }) => {
  const totais = (extra: Record<string, unknown> = {}) => ({ pedidos: 0, pecasBrutaCentavos: 0, freteCentavos: 0, receitaBrutaCentavos: 0, descontosCentavos: 0,
    estornosCentavos: 0, receitaLiquidaCentavos: 0, ticketMedioCentavos: null, pecas: 0, pedidosClub: 0, reservasEncerradas: 0, reservasPagas: 0, ...extra });
  const comercial = {
    periodo: "HOJE", atual: totais({ canceladosPelaLoja: 1 }), anterior: totais(), meta: null,
    serie: Array.from({ length: 7 }, (_, i) => ({ dia: `2026-09-${String(27 + i).padStart(2, "0")}`, receitaLiquidaCentavos: 0 })),
    colecoes: [], mix: { pagamento: {}, entrega: {}, tamanho: {} }, estoque: [], estoqueTotal: 0,
    pulso: { ativas: 0, precisamDeAcao: 0, pagas: 0, freteParaCalcular: 0, entreguesHoje: 0 }, whatsapp: { conectado: true },
  };
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const caminho = new URL(rota.request().url()).pathname.replace(/^\/api\//, "");
    if (caminho === "v1/admin/comercial") return rota.fulfill({ json: comercial });
    return rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });
  await page.goto(`${PAINEL}/`);
  const kpis = page.getByRole("region", { name: "Indicadores principais" });
  const pedidos = kpis.getByRole("article").filter({ hasText: "Pedidos pagos" });
  await expect(pedidos).toContainText("1 cancelado pela loja ficou fora da conta");
  await expect(kpis.getByRole("article").filter({ hasText: "Receita líquida" })).toContainText("=vs. ontem até agora");
  await expect(kpis.getByRole("article").filter({ hasText: "Conversão" })).toContainText("—");
  await expect(page.getByText("Pedido cancelado pela loja não conta como venda, nem o estorno dele.")).toBeVisible();
});

// Acessos (0520) com a api-admin simulada: resumo, gráfico por dia, páginas, origens e aparelhos.
test("Acessos: visitantes por dia, páginas, origens e aparelhos", async ({ page, context }) => {
  const dias = (n: number) => Array.from({ length: n }, (_, i) => ({ dia: `2026-09-${String(i + 1).padStart(2, "0")}`, visitas: i * 3, visitantes: i }));
  const resposta = (n: number) => ({
    inicio: "2026-09-01", fim: "2026-09-30", hoje: { visitas: 87, visitantes: 29 }, ontem: { visitas: 60, visitantes: 21 },
    seteDias: { visitas: 400, visitantes: 150 }, periodo: { visitas: 1200, visitantes: 480 }, dias: dias(n),
    paginas: [{ caminho: "/", nome: null, visitas: 700 }, { caminho: "/colecao/fe", nome: "Fé", visitas: 210 }, { caminho: "/produto/amen", nome: "Amen", visitas: 90 }],
    origens: [{ origem: "instagram", entradas: 300 }, { origem: "direto", entradas: 120 }, { origem: "whatsapp", entradas: 60 }],
    aparelhos: { celular: 400, tablet: 10, computador: 70 },
  });
  const pedidos: string[] = [];
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname === "/api/v1/admin/acessos") {
      pedidos.push(url.search);
      return rota.fulfill({ json: resposta(Number(url.searchParams.get("dias"))) });
    }
    return rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/acessos`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Quem visitou");
  const resumo = page.getByRole("region", { name: "Resumo dos acessos" });
  await expect(resumo).toContainText("Visitantes hoje");
  await expect(resumo).toContainText("29");
  await expect(resumo).toContainText("1.200 páginas vistas");
  await expect(page.getByRole("list", { name: "Visitantes por dia" }).getByRole("listitem")).toHaveCount(30);
  await expect(page.getByRole("listitem", { name: /^Hoje: 29 visitantes, 87 páginas vistas$/ })).toHaveCount(1);
  await expect(page.getByText("Início", { exact: true })).toBeVisible();
  await expect(page.getByText("Fé", { exact: true })).toBeVisible();
  await expect(page.getByText("Instagram", { exact: true })).toBeVisible();
  await expect(page.getByText("Celular", { exact: true })).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "7 dias" }).click();
  await expect(page.getByRole("list", { name: "Visitantes por dia" }).getByRole("listitem")).toHaveCount(7);
  expect(pedidos).toEqual(["?dias=30", "?dias=7"]);
});

// Barra lateral recolhida (03/10): no computador, o botão do topo deixa só os ícones (com o nome
// para o leitor de tela e o contador no canto) e a escolha fica para a próxima tela; no celular,
// o menu continua abrindo por cima, sem o botão de recolher.
test("menu lateral: esconder e mostrar no computador, lembrando a escolha", async ({ page, context }) => {
  await simularWhatsapp(page, context, (_m, caminho) =>
    caminho === "v1/admin/dashboard" ? { ...DASH_WA, acoes: { ...DASH_WA.acoes, emPreparacao: 1 } } : undefined);
  await page.goto(`${PAINEL}/whatsapp/configuracoes`);
  await expect(page.getByRole("button", { name: "Esconder menu" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  const menu = page.getByRole("complementary", { name: "Menu do painel" });
  const esconder = page.getByRole("button", { name: "Esconder menu" });
  await expect(esconder).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByText("Entregas e frete")).toBeVisible();
  await esconder.click();

  const mostrar = page.getByRole("button", { name: "Mostrar menu" });
  await expect(mostrar).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await menu.boundingBox())?.width).toBeLessThan(100);
  // O nome sai da tela, mas continua no link para o leitor de tela
  expect((await menu.getByText("Entregas e frete").boundingBox())?.width).toBeLessThanOrEqual(1);
  const entregas = menu.getByRole("link", { name: /^Entregas e frete/ });
  await expect(entregas).toBeVisible();
  await expect(entregas.locator(".nav-count")).toHaveText(/1/);
  await semViolacoes(page);

  // Outra tela e a volta: continua recolhida (cookie lido no servidor)
  await page.goto(`${PAINEL}/whatsapp/envios`);
  await expect(page.getByRole("button", { name: "Mostrar menu" })).toBeVisible();
  expect((await menu.boundingBox())?.width).toBeLessThan(100);
  await page.getByRole("button", { name: "Mostrar menu" }).click();
  await expect.poll(async () => (await menu.getByText("Entregas e frete").boundingBox())?.width).toBeGreaterThan(50);
  expect((await context.cookies()).find((c) => c.name === "painel_menu")?.value).toBe("aberto");
});

// Reserva v2 (0580): um status só nas etapas, o próximo passo, a peça com o preço cheio riscado e
// o motivo do desconto, o número do Mercado Pago, a linha do tempo com as mensagens de WhatsApp
// (texto e "Tentar de novo") e os chamados, e a cliente com atalho para a conversa no Atendimento.
test("reserva: etapas, peças, linha do tempo com o WhatsApp e atalho para a conversa", async ({ page, context }) => {
  const R = "e1111111-1111-4111-8111-111111111111";
  const t = (h: string) => `2026-10-03T${h}:00.000Z`;
  const detalhe = {
    id: R, numero: 1001, status: "PAGAMENTO_CONFIRMADO", nome: "Ana Paula", telefone: "+5577981239809", entrega: "RETIRADA", canal: "PAINEL",
    subtotalCentavos: 4999, descontoCentavos: 4599, totalCentavos: 400, cupom: null,
    criadaEm: t("04:36"), expiraEm: t("05:36"), pagaEm: t("04:38"), forma: "PIX",
    itens: [{ produtoId: "p1", varianteId: "v1", nome: "When Life Gives You Lemons", tamanho: "UNICO", rotuloTamanho: "Único · P ao 42", qtd: 1,
      precoTabelaCentavos: 4999, descontoCentavos: 4599, totalCentavos: 400, capa: null }],
    descontos: [{ tipo: "MANUAL", valorCentavos: 4599, rotulo: "Desconto da loja" }],
    manual: { criadaPor: "Carol", motivoDesconto: "teste" },
    logistica: { modalidade: "RETIRADA", substatus: "EM_PREPARACAO", confirmadaEm: t("04:38"), codigoRetirada: "29LFET" },
    pagamentos: [{ id: "pg1", finalidade: "PRODUTOS", forma: "PIX", status: "APROVADO", valorCentavos: 400, criadoEm: t("04:37"), aprovadoEm: t("04:38"),
      provedor: "mercadopago", idProvedor: "123456789" }],
    cancelamentos: [],
    transicoes: [
      { evento: "T1", para: "RESERVADO", ator: "ADMIN", atorNome: "Carol", motivo: "Reserva manual pelo painel", em: t("04:36") },
      { evento: "T2", de: "RESERVADO", para: "PAGAMENTO_CONFIRMADO", ator: "PROVEDOR", em: t("04:38") },
    ],
    auditoria: [{ id: 1, em: t("04:36"), ator: "ADMIN", atorNome: "Carol", acao: "reserva.manual" }],
    mensagens: [
      { id: "m1", modelo: "pagamento_confirmado", params: { nome: "Ana Paula", numero: 1001, totalCentavos: 400, forma: "PIX", pecas: 1 }, status: "LIDA",
        tentativas: 1, criadaEm: t("04:38"), enviadaEm: t("04:38") },
      { id: "m2", modelo: "entrega_confirmada", params: { numero: 1001, modalidade: "RETIRADA" }, status: "FALHOU", tentativas: 5,
        criadaEm: t("05:01"), erro: "recusada" },
    ],
    cliente: { bloqueado: false, reservas: 2, expiracoes30Dias: 0, compras: 2, comprasCentavos: 3400, chat: "5577981239809",
      outras: [{ id: "e2222222-2222-4222-8222-222222222222", numero: 1000, status: "ENTREGUE", totalCentavos: 3000, criadaEm: t("01:00") }],
      chamados: [{ numero: 12, status: "RESOLVIDO", motivo: "DUVIDA", abertoEm: t("05:10"), assumidoEm: t("05:12"), assumidoVia: "PAINEL", assumidoPor: "Carol",
        resolvidoEm: t("05:20"), resolvidoVia: "PAINEL", resolvidoPor: "Carol", notaPedida: true, nota: 5 }] },
  };
  const enviados = await simularWhatsapp(page, context, (metodo, caminho) => {
    if (caminho === `v1/admin/reservations/${R}`) return detalhe;
    if (caminho === "v1/admin/whatsapp/envios/m2/reenviar") return { ok: true };
    if (caminho === "v1/admin/whatsapp/conversas") return [];
    if (metodo === "POST" && caminho === "v1/admin/whatsapp/conversa") {
      return { chat: "5577981239809", telefone: "+5577981239809", nome: "Ana", bloqueado: false, eventos: [], reservas: [], chamados: [] };
    }
    return undefined;
  });

  await page.goto(`${PAINEL}/reservas/${R}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reserva #1001");
  await expect(page.getByText("Ana Paula · R$ 4,00 · venda pelo painel, por Carol")).toBeVisible();
  // Um status só: a etapa alcançada
  const etapas = page.getByRole("region", { name: "Etapas da reserva" });
  await expect(etapas.locator("[aria-current=step]")).toContainText("Em preparação");
  await expect(etapas.getByRole("listitem")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Separar as peças e avisar que está pronta" })).toBeVisible();
  await expect(page.getByText("29LFET")).toBeVisible();

  // Peça com o preço cheio riscado, o motivo junto do desconto e o número do Mercado Pago
  const pecas = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Peças" }) });
  await expect(pecas.locator(".piece s")).toHaveText(/R\$\s49,99/);
  await expect(pecas.locator(".piece-price")).toHaveText(/R\$\s4,00/);
  await expect(pecas.getByText("Motivo: teste")).toBeVisible();
  await expect(page.getByText("Mercado Pago nº 123456789")).toBeVisible();

  // Linha do tempo: tudo, na ordem
  const linha = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Linha do tempo" }) });
  await expect(linha.locator(".event > .evento-corpo > b")).toHaveText([
    "Reserva criada", "Pagamento aprovado", "Entrega combinada: Retirada na loja", "WhatsApp: Pagamento confirmado",
    "WhatsApp: Modalidade de entrega confirmada", "Chamado #12 aberto", "Chamado #12 finalizado", "Agora: Separar as peças e avisar que está pronta",
  ]);
  await expect(linha.getByText(/Mercado Pago/)).toBeVisible();
  await expect(linha.getByText(/Carol · Reserva manual pelo painel/)).toBeVisible();
  await linha.getByText("Ver o texto").first().click();
  await expect(linha.locator(".bolha").first()).toContainText("1001");
  await expect(linha.getByText("Falhou depois de 5 tentativas: recusada")).toBeVisible();
  await semViolacoes(page);
  await linha.getByRole("button", { name: /Tentar de novo/ }).click();
  await expect(linha.getByRole("status")).toHaveText("De volta na fila. Ela sai no próximo envio.");
  expect(enviados.some((e) => e.caminho === "v1/admin/whatsapp/envios/m2/reenviar")).toBe(true);

  // A cliente: compras, outra reserva e a conversa no Atendimento (sem o número no endereço)
  const cliente = page.getByRole("complementary", { name: "Entrega e cliente" });
  await expect(cliente.getByRole("link", { name: "#1000" })).toHaveAttribute("href", "/reservas/e2222222-2222-4222-8222-222222222222");
  await expect(cliente.getByText("R$ 34,00")).toBeVisible();
  await cliente.getByRole("link", { name: "Ver conversa" }).click();
  await expect(page).toHaveURL(`${PAINEL}/whatsapp`);
  await expect.poll(() => enviados.find((e) => e.caminho === "v1/admin/whatsapp/conversa")?.corpo).toEqual({ chat: "5577981239809" });
});

// Cancelar pela loja e entrega pelo painel (0590). Base: um pedido pago com motoboy, sem endereço.
function pedidoPago(extra: Record<string, unknown> = {}) {
  const t = (h: string) => `2026-10-03T${h}:00.000Z`;
  return {
    id: "e3333333-3333-4333-8333-333333333333", numero: 1002, status: "PAGAMENTO_CONFIRMADO", nome: "Bia Santos", telefone: "+5577990001111",
    entrega: "MOTOBOY", canal: "SITE", subtotalCentavos: 4999, descontoCentavos: 0, totalCentavos: 4999, criadaEm: t("10:00"), expiraEm: t("11:00"),
    pagaEm: t("10:05"), itens: [{ produtoId: "p1", nome: "Limone Amalfi", qtd: 1, precoTabelaCentavos: 4999, totalCentavos: 4999 }], descontos: [],
    logistica: { modalidade: "MOTOBOY", substatus: "AGUARDANDO_MODALIDADE", codigoRetirada: "K7Q2AB" },
    pagamentos: [{ id: "pg1", finalidade: "PRODUTOS", forma: "PIX", status: "APROVADO", valorCentavos: 4999, criadoEm: t("10:04"), aprovadoEm: t("10:05"), idProvedor: "999" }],
    cancelamentos: [], transicoes: [{ evento: "T1", para: "RESERVADO", ator: "CLIENTE", em: t("10:00") }, { evento: "T2", para: "PAGAMENTO_CONFIRMADO", ator: "PROVEDOR", em: t("10:05") }],
    auditoria: [], mensagens: [], cliente: { bloqueado: false, reservas: 1, expiracoes30Dias: 0, compras: 1, comprasCentavos: 4999, outras: [], chamados: [] },
    ...extra,
  };
}

test("reserva: a loja cancela o pedido pago, com o estorno, e vê o que acontece antes", async ({ page, context }) => {
  const R = "e3333333-3333-4333-8333-333333333333";
  let detalhe = pedidoPago();
  const enviados = await simularWhatsapp(page, context, (metodo, caminho) => {
    if (caminho === `v1/admin/reservations/${R}`) return detalhe;
    if (caminho === `v1/admin/reservations/${R}/cancel` && metodo === "GET") {
      return { pode: true, pago: true, pecas: 1, estornar: [{ id: "pg1", finalidade: "PRODUTOS", forma: "PIX", valorCentavos: 4999 }] };
    }
    if (caminho === `v1/admin/reservations/${R}/cancel`) {
      detalhe = pedidoPago({ status: "EXPIRADO", motivoEncerramento: "CANCELADA_PELA_LOJA", expiradaEm: "2026-10-03T12:00:00.000Z",
        pagamentos: [{ ...pedidoPago().pagamentos[0], status: "ESTORNADO" }] });
      return detalhe;
    }
    return undefined;
  });
  await page.goto(`${PAINEL}/reservas/${R}`);
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  const caixa = page.getByRole("region", { name: "Cancelar o pedido #1002?" });
  await expect(caixa).toContainText("A peça volta para o estoque e para a vitrine.");
  await expect(caixa).toContainText(/Estorno de R\$\s49,99 \(peças, PIX\) pelo Mercado Pago, na hora\./);
  await semViolacoes(page);
  await caixa.getByRole("button", { name: "Cancelar e estornar" }).click();
  await expect(caixa.getByText("Escreva o motivo do cancelamento: ele fica na auditoria.")).toBeVisible();
  await caixa.getByLabel("Motivo do cancelamento").fill("Peça com defeito");
  await caixa.getByRole("button", { name: "Cancelar e estornar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cancelamento feito" })).toBeVisible();
  expect(enviados.find((e) => e.caminho === `v1/admin/reservations/${R}/cancel`)?.corpo).toEqual({ motivo: "Peça com defeito" });
  await expect(page.getByRole("region", { name: "Etapas da reserva" }).locator("[aria-current=step]")).toContainText("Cancelada");
  await expect(page.getByRole("button", { name: /Cancelar (pedido|reserva)/ })).toHaveCount(0);
});

test("reserva: a loja informa o endereço do motoboy e copia para a etiqueta", async ({ page, context }) => {
  const R = "e3333333-3333-4333-8333-333333333333";
  const endereco = { cep: "46400000", rua: "R. Sátiro Santos", numero: "38", bairro: "Centro", cidade: "Caetité", uf: "BA" };
  let detalhe = pedidoPago();
  const enviados = await simularWhatsapp(page, context, (metodo, caminho) => {
    if (caminho === `v1/admin/reservations/${R}`) return detalhe;
    if (caminho === `v1/admin/reservations/${R}/fulfillment` && metodo === "PUT") {
      detalhe = pedidoPago({ logistica: { modalidade: "MOTOBOY", substatus: "AGUARDANDO_CALCULO_FRETE", confirmadaEm: "2026-10-03T10:30:00.000Z", endereco } });
      return detalhe;
    }
    return undefined;
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await page.goto(`${PAINEL}/reservas/${R}`);
  const entrega = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Entrega", exact: true }) });
  await expect(entrega).toContainText("A cliente ainda não informou o endereço no site.");
  await entrega.getByRole("button", { name: "Informar endereço" }).click();
  const form = entrega.getByRole("form", { name: "Mudar a entrega" });
  await form.getByLabel("CEP").fill("46400-000");
  await form.getByRole("button", { name: "Salvar entrega" }).click();
  await expect(form.getByRole("alert")).toHaveText("Falta a rua do endereço.");
  await form.getByLabel("Rua").fill("R. Sátiro Santos");
  await form.getByLabel("Número").fill("38");
  await form.getByLabel("Bairro").fill("Centro");
  await semViolacoes(page);
  await form.getByRole("button", { name: "Salvar entrega" }).click();
  await expect(entrega.locator("address")).toContainText("R. Sátiro Santos, 38");
  await expect(entrega.locator("address")).toContainText("Centro · Caetité/BA · CEP 46400-000");
  expect(enviados.find((e) => e.caminho === `v1/admin/reservations/${R}/fulfillment`)?.corpo).toEqual({ modalidade: "MOTOBOY", endereco });
  await expect(entrega.getByRole("button", { name: "Copiar endereço" })).toBeVisible();
});

test("nova reserva: motoboy já pago pede o endereço; pelo link, não", async ({ page, context }) => {
  await simularWhatsapp(page, context, () => undefined);
  await page.goto(`${PAINEL}/reservas/nova`);
  await page.getByLabel("Entrega").selectOption("MOTOBOY");
  await expect(page.getByRole("group", { name: "Endereço de entrega" })).toHaveCount(0);
  await page.getByLabel("Já pago em dinheiro").check();
  await expect(page.getByRole("group", { name: "Endereço de entrega" })).toBeVisible();
  await expect(page.getByLabel("Cidade")).toHaveValue("Caetité");
  await semViolacoes(page);
  await page.getByLabel("Cliente paga pelo link").check();
  await expect(page.getByRole("group", { name: "Endereço de entrega" })).toHaveCount(0);
});
