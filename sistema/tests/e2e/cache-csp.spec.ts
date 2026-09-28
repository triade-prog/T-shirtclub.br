import { expect, test } from "@playwright/test";

// CSP com nonce e cache (proposta de cache/ISR, item 1). Toda página da loja sai com um nonce
// novo, então o HTML nunca pode ir para cache compartilhado: um nonce guardado na CDN seria o
// mesmo para todas as clientes e a CSP perderia o efeito. As rotas com dados da cliente levam
// ainda a trava explícita "private, no-store". Roda na loja com catálogo (3003, api falsa).
const LOJA = "http://localhost:3003";

const PAGINAS = ["/", "/colecao/limone", "/produto/limone-amalfi-coast", "/sacola", "/consulta", "/offline", "/privacidade", "/pagamento-aprovado?reserva=1", "/pagina-que-nao-existe"];

for (const caminho of PAGINAS) {
  test(`${caminho}: scripts com nonce e nenhum bloqueio da CSP`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { bloqueiosCsp: string[] };
      w.bloqueiosCsp = [];
      document.addEventListener("securitypolicyviolation", (e) => w.bloqueiosCsp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const erros: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) erros.push(m.text()); });

    // "load": os scripts da página já rodaram (networkidle não serve: o Next deixa pré-carga aberta)
    const resposta = await page.goto(`${LOJA}${caminho}`, { waitUntil: "load" });
    const nonce = /'nonce-([^']+)'/.exec(resposta!.headers()["content-security-policy"] ?? "")?.[1];
    expect(nonce).toBeTruthy();
    // Página gerada no pedido: os scripts levam o nonce deste cabeçalho (estática não teria)
    expect(await page.locator("script[nonce]").count()).toBeGreaterThan(0);
    // O navegador esconde o valor do nonce no DOM, então a conferência é pela própria CSP:
    // nenhum script ficou de fora
    expect(await page.evaluate(() => (window as unknown as { bloqueiosCsp: string[] }).bloqueiosCsp)).toEqual([]);
    expect(erros).toEqual([]);
    // HTML com nonce nunca em cache compartilhado
    const cache = resposta!.headers()["cache-control"] ?? "";
    expect(cache).toContain("no-store");
    expect(cache).not.toMatch(/public|s-maxage/);
  });
}

test("rotas com dados da cliente: sem cache, nem na CDN nem no navegador", async ({ request }) => {
  for (const caminho of ["/sacola", "/consulta", "/r", "/reserva", "/pagamento-aprovado?reserva=1", "/api/v1/health"]) {
    const r = await request.get(`${LOJA}${caminho}`, { maxRedirects: 0, failOnStatusCode: false });
    const cache = r.headers()["cache-control"] ?? "";
    expect(cache, caminho).toContain("no-store");
    expect(cache, caminho).toContain("private");
  }
  // O "Adicionar ao Club" grava o cookie da sacola num redirecionamento: também sem cache
  const r = await request.get(`${LOJA}/sacola?adicionar=limone-amalfi-coast&tamanho=unico`, { maxRedirects: 0 });
  expect(r.status()).toBe(303);
  expect(r.headers()["set-cookie"]).toBeTruthy();
  expect(r.headers()["cache-control"]).toBe("private, no-store");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  // Pagamento aprovado sem reserva não é página (nem conversão): volta para o início
  const semReserva = await request.get(`${LOJA}/pagamento-aprovado`, { maxRedirects: 0 });
  expect([semReserva.status(), semReserva.headers()["location"]]).toEqual([307, "/"]);
  // A revalidação só aceita POST com o segredo; a recusa também não fica em cache
  const rv = await request.post(`${LOJA}/revalidar`, { failOnStatusCode: false });
  expect(rv.status()).toBe(401);
  expect(rv.headers()["cache-control"]).toContain("no-store");
});
