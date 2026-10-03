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

// Avisos da loja (0510) com a api-admin simulada: liga com o número da equipe, desliga um aviso,
// manda o teste e para os avisos.
test("WhatsApp: avisos para a equipe no WhatsApp pessoal", async ({ page, context }) => {
  const enviados: { metodo: string; caminho: string; corpo: unknown }[] = [];
  const AVISOS = [
    { id: "nova_reserva", nome: "Nova reserva", quando: "Quando uma cliente reserva pelo site" },
    { id: "lista_vip", nome: "Entrou na lista VIP", quando: "Quando alguém se inscreve na lista VIP" },
  ];
  let avisos = { telefone: null as string | null, desligados: [] as string[] };
  const tela = () => ({ telefone: avisos.telefone, avisos: AVISOS.map((a) => ({ ...a, ligado: !avisos.desligados.includes(a.id) })) });
  const respostas: Record<string, unknown> = {
    "v1/admin/dashboard": { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 0, vencidos: 0 }, emPreparacao: 0, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } },
    "v1/admin/whatsapp": { conectado: true, modoLancamento: false, ritmo: { intervaloMinS: 4, intervaloMaxS: 9, tetoHora: 120 }, ritmoLancamento: { intervaloMinS: 2, intervaloMaxS: 5, tetoHora: 600 },
      fila: { pendentes: 0, enviadasHoje: 0, falhasHoje: 0, descartadasHoje: 0, maisAntigaPendente: null }, notificacoes: [] },
    "v1/admin/whatsapp/chamados": { abertos: [], finalizados: [], notas: { media: null, total: 0 } },
  };
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const caminho = new URL(r.url()).pathname.replace(/^\/api\//, "");
    if (caminho === "v1/admin/whatsapp/avisos") {
      if (r.method() === "PUT") {
        const corpo = r.postDataJSON() as Partial<typeof avisos>;
        enviados.push({ metodo: "PUT", caminho, corpo });
        avisos = { ...avisos, ...corpo };
      }
      return rota.fulfill({ json: tela() });
    }
    if (r.method() !== "GET") {
      enviados.push({ metodo: r.method(), caminho, corpo: r.postData() ? r.postDataJSON() : null });
      return rota.fulfill({ status: 202, json: { ok: true, naFila: true } });
    }
    return caminho in respostas ? rota.fulfill({ json: respostas[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/whatsapp`);
  const card = page.getByRole("region", { name: "Avisos para a equipe" });
  await expect(card).toContainText("Desligados: grave um número para começar.");
  await expect(card.getByRole("checkbox", { name: "Avisar “Nova reserva”" })).toBeDisabled();

  // Número com DDD, gravado em E.164
  await card.getByLabel("WhatsApp que recebe os avisos").fill("77 9988");
  await card.getByRole("button", { name: "Ligar os avisos" }).click();
  await expect(card.getByText(/Digite o número com DDD/)).toBeVisible();
  await expect(card.getByLabel("WhatsApp que recebe os avisos")).toHaveAttribute("aria-invalid", "true");
  await card.getByLabel("WhatsApp que recebe os avisos").fill("(77) 99888-7777");
  await card.getByRole("button", { name: "Ligar os avisos" }).click();
  await expect(card).toContainText("Ligados para (77) 99888-7777.");
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/whatsapp/avisos", corpo: { telefone: "+5577998887777" } });

  // Desliga só a lista VIP
  // A chave muda quando o painel confirma (como as notificações da cliente)
  await card.getByRole("checkbox", { name: "Avisar “Entrou na lista VIP”" }).click();
  await expect(card.getByRole("checkbox", { name: "Avisar “Entrou na lista VIP”" })).not.toBeChecked();
  expect(enviados.at(-1)!.corpo).toEqual({ desligados: ["lista_vip"] });
  await expect(card.getByRole("checkbox", { name: "Avisar “Nova reserva”" })).toBeChecked();

  await card.getByRole("button", { name: "Enviar aviso de teste" }).click();
  await expect(card).toContainText("Aviso de teste na fila.");
  expect(enviados.at(-1)).toMatchObject({ metodo: "POST", caminho: "v1/admin/whatsapp/avisos/teste" });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await card.getByRole("button", { name: "Parar os avisos" }).click();
  await expect(card).toContainText("Desligados: grave um número para começar.");
  expect(enviados.at(-1)!.corpo).toEqual({ telefone: null });
});

// Atendimento automático (0540) com a api-admin simulada: prévia do menu, resposta nova com as
// palavras normalizadas, validação, ordem, desligar e a pausa.
test("WhatsApp: atendimento automático com menu e respostas rápidas", async ({ page, context }) => {
  const enviados: { metodo: string; caminho: string; corpo: unknown }[] = [];
  const ids = ["a1111111-1111-4111-8111-111111111111", "a2222222-2222-4222-8222-222222222222", "a3333333-3333-4333-8333-333333333333"];
  let lista = {
    pausaHoras: 4,
    respostas: [
      { id: ids[0], acao: "TEXTO", titulo: "Entrega e frete", palavras: ["frete", "motoboy"], texto: "Retirada, motoboy ou envio.", ativa: true },
      { id: ids[1], acao: "MINHA_RESERVA", titulo: "Minha reserva", palavras: [], texto: null, ativa: true },
      { id: ids[2], acao: "EQUIPE", titulo: "Falar com a equipe", palavras: ["atendente"], texto: "Pronto! Já avisamos a equipe.", ativa: true },
    ] as { id: string; acao: string; titulo: string; palavras: string[]; texto: string | null; ativa: boolean }[],
  };
  const respostas: Record<string, unknown> = {
    "v1/admin/dashboard": { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 0, vencidos: 0 }, emPreparacao: 0, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } },
    "v1/admin/whatsapp": { conectado: true, modoLancamento: false, ritmo: { intervaloMinS: 4, intervaloMaxS: 9, tetoHora: 120 }, ritmoLancamento: { intervaloMinS: 2, intervaloMaxS: 5, tetoHora: 600 },
      fila: { pendentes: 0, enviadasHoje: 0, falhasHoje: 0, descartadasHoje: 0, maisAntigaPendente: null }, notificacoes: [] },
    "v1/admin/whatsapp/avisos": { telefone: null, avisos: [] },
    "v1/admin/whatsapp/chamados": { abertos: [], finalizados: [], notas: { media: null, total: 0 } },
  };
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const caminho = new URL(r.url()).pathname.replace(/^\/api\//, "");
    if (caminho.startsWith("v1/admin/whatsapp/respostas")) {
      const corpo = r.postData() ? r.postDataJSON() : null;
      if (r.method() !== "GET") enviados.push({ metodo: r.method(), caminho, corpo });
      const id = caminho.split("/").at(-1)!;
      if (r.method() === "POST") lista.respostas.push({ id: "a4444444-4444-4444-8444-444444444444", acao: "TEXTO", texto: null, ativa: true, ...corpo });
      else if (caminho.endsWith("/ordem")) lista.respostas = corpo.ids.map((i: string) => lista.respostas.find((x) => x.id === i)!);
      else if (caminho.endsWith("/pausa")) lista = { ...lista, pausaHoras: corpo.pausaHoras };
      else if (r.method() === "PUT") lista.respostas = lista.respostas.map((x) => (x.id === id ? { ...x, ...corpo } : x));
      return rota.fulfill({ status: r.method() === "POST" ? 201 : 200, json: lista });
    }
    return caminho in respostas ? rota.fulfill({ json: respostas[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/whatsapp`);
  const card = page.getByRole("region", { name: "Atendimento automático" });
  await expect(card.locator(".previa-menu")).toHaveText("Me conta, como posso te ajudar? É só responder com o número:\n*1* · Entrega e frete\n*2* · Minha reserva\n*3* · Falar com a equipe");

  // Nova resposta: palavra curta não passa; depois, palavras sem acento e sem repetir
  await card.getByRole("button", { name: "Nova resposta" }).click();
  const nova = card.getByRole("form", { name: "Nova resposta" });
  await nova.getByLabel("Nome no menu").fill("Pagamento");
  await nova.getByLabel("Palavras que disparam a resposta").fill("PIX, x");
  await nova.getByLabel("Texto da resposta").fill("PIX ou cartão, pelo site.");
  await nova.getByRole("button", { name: "Criar resposta" }).click();
  await expect(nova.getByText(/“x” não serve/)).toBeVisible();
  await nova.getByLabel("Palavras que disparam a resposta").fill("PIX, Cartão de crédito, pix");
  await nova.getByRole("button", { name: "Criar resposta" }).click();
  await expect(card.locator(".previa-menu")).toContainText("*4* · Pagamento");
  expect(enviados.at(-1)).toEqual({ metodo: "POST", caminho: "v1/admin/whatsapp/respostas",
    corpo: { titulo: "Pagamento", palavras: ["pix", "cartao de credito"], texto: "PIX ou cartão, pelo site.", ativa: true } });

  // A equipe sobe para o primeiro lugar
  await card.getByRole("button", { name: "Subir “Falar com a equipe”" }).click();
  await expect(card.locator(".previa-menu")).toContainText("*2* · Falar com a equipe\n*3* · Minha reserva");
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: "v1/admin/whatsapp/respostas/ordem", corpo: { ids: [ids[0], ids[2], ids[1], "a4444444-4444-4444-8444-444444444444"] } });

  // Minha reserva desligada sai do menu; não tem texto para editar
  await card.getByRole("button", { name: "Editar “Minha reserva”" }).click();
  const minha = card.getByRole("form", { name: "Editar “Minha reserva”" });
  await expect(minha.getByLabel("Texto da resposta")).toHaveCount(0);
  await minha.getByRole("checkbox", { name: "Ativa no menu" }).click();
  await minha.getByRole("button", { name: "Salvar" }).click();
  await expect(card.locator(".previa-menu")).not.toContainText("Minha reserva");
  await expect(card.getByText("Desligada")).toBeVisible();
  expect(enviados.at(-1)).toEqual({ metodo: "PUT", caminho: `v1/admin/whatsapp/respostas/${ids[1]}`, corpo: { titulo: "Minha reserva", palavras: [], ativa: false } });

  await card.getByLabel(/Horas de silêncio/).fill("6");
  await card.getByRole("button", { name: "Salvar pausa" }).click();
  await expect(card).toContainText("por 6 horas");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

// Chamados (0550) com a api-admin simulada: abertos com o motivo, o telefone e o que a cliente
// escreveu; assumir e finalizar; finalizado com a nota e a média.
test("WhatsApp: chamados abertos, assumir e finalizar", async ({ page, context }) => {
  const enviados: string[] = [];
  const base = { nome: "Ana", telefone: "+5577998128809", final: "8809", pedido: { numero: 1048, status: "RESERVADO" }, notaPedida: false, nota: null,
    assumidoEm: null, assumidoVia: null, resolvidoEm: null, resolvidoVia: null };
  let lista = {
    abertos: [{ ...base, numero: 12, status: "ABERTO", motivo: "DUVIDA", abertoEm: "2026-10-10T17:00:00Z", mensagens: ["Vocês fazem embrulho pra presente?"] }],
    finalizados: [{ ...base, numero: 11, status: "RESOLVIDO", motivo: "EQUIPE", abertoEm: "2026-10-10T13:00:00Z", mensagens: [], resolvidoEm: "2026-10-10T14:00:00Z",
      resolvidoVia: "WHATSAPP", notaPedida: true, nota: 5 }],
    notas: { media: 5, total: 1 },
  };
  const respostas: Record<string, unknown> = {
    "v1/admin/dashboard": { reservas: { ativas: 0 }, acoes: { cancelamentosPendentes: 0, fretes: { aguardandoCalculo: 0, vencidos: 0 }, emPreparacao: 0, pagamentosEmAnalise: 0, disputasAbertas: 0, telefonesBloqueados: 0 }, whatsapp: { conectado: true } },
    "v1/admin/whatsapp": { conectado: true, modoLancamento: false, ritmo: { intervaloMinS: 4, intervaloMaxS: 9, tetoHora: 120 }, ritmoLancamento: { intervaloMinS: 2, intervaloMaxS: 5, tetoHora: 600 },
      fila: { pendentes: 0, enviadasHoje: 0, falhasHoje: 0, descartadasHoje: 0, maisAntigaPendente: null }, notificacoes: [] },
    "v1/admin/whatsapp/avisos": { telefone: null, avisos: [] },
    "v1/admin/whatsapp/respostas": { pausaHoras: 4, respostas: [] },
  };
  await context.addCookies([{ name: "__Host-painel", value: "x", domain: "localhost", path: "/", secure: true }]);
  await page.route("**/api/v1/admin/**", async (rota) => {
    const r = rota.request();
    const caminho = new URL(r.url()).pathname.replace(/^\/api\//, "");
    if (caminho.startsWith("v1/admin/whatsapp/chamados")) {
      if (r.method() === "POST") {
        enviados.push(caminho);
        const [aberto] = lista.abertos;
        if (caminho.endsWith("/assumir")) lista = { ...lista, abertos: [{ ...aberto!, status: "EM_ATENDIMENTO", assumidoEm: "2026-10-10T17:05:00Z", assumidoVia: "PAINEL" }] };
        else lista = { ...lista, abertos: [], finalizados: [{ ...aberto!, status: "RESOLVIDO", resolvidoEm: "2026-10-10T17:10:00Z", resolvidoVia: "PAINEL", notaPedida: true }, ...lista.finalizados] };
      }
      return rota.fulfill({ json: lista });
    }
    return caminho in respostas ? rota.fulfill({ json: respostas[caminho] }) : rota.fulfill({ status: 404, json: { erro: { codigo: "NOT_FOUND" } } });
  });

  await page.goto(`${PAINEL}/whatsapp`);
  const card = page.getByRole("region", { name: "Chamados" });
  await expect(card).toContainText("Nota média nos últimos 30 dias: 5 (1 nota)");
  const abertos = card.getByRole("list", { name: "Chamados abertos" });
  await expect(abertos).toContainText("Ana");
  await expect(abertos).toContainText("Dúvida que a Clubinha não respondeu");
  await expect(abertos).toContainText("(77) 99812-8809");
  await expect(abertos).toContainText("“Vocês fazem embrulho pra presente?”");
  await expect(card.getByRole("list", { name: "Chamados finalizados" })).toContainText("pelo WhatsApp · nota 5 de 5");

  await card.getByRole("button", { name: "Assumir o chamado #12" }).click();
  await expect(abertos).toContainText("Em atendimento");
  await expect(abertos).toContainText("pelo painel");
  await expect(card.getByRole("button", { name: "Assumir o chamado #12" })).toHaveCount(0);

  await card.getByRole("button", { name: "Finalizar o chamado #12" }).click();
  await expect(card).toContainText("Nenhum chamado aberto agora.");
  await expect(card.getByRole("list", { name: "Chamados finalizados" })).toContainText("nota pedida");
  expect(enviados).toEqual(["v1/admin/whatsapp/chamados/12/assumir", "v1/admin/whatsapp/chamados/12/finalizar"]);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
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
