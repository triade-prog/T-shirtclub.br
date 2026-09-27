import { assertEquals } from "@std/assert";
import type { Banco } from "../_shared/banco.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { criarApiPublica } from "./app.ts";

const SEGREDO = "s3gredo";
const A = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const B = "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
const C = "8b3c4d5e-6f7a-4b2c-8d3e-4f5a6b7c8d9e";
// Tamanhos (0370): Único de A e de B, e Plus de A
const A1 = "9c4d5e6f-7a8b-4c3d-9e4f-5a6b7c8d9e0f";
const A2 = "0d5e6f7a-8b9c-4d4e-8f5a-6b7c8d9e0f1a";
const B1 = "1e6f7a8b-9c0d-4e5f-9a6b-7c8d9e0f1a2b";
const item = (produtoId: string, varianteId: string, qtd: number) => ({ produtoId, varianteId, qtd });

const card = (id: string, slug: string) => ({ id, slug, nome: slug, precoCentavos: 4999, disponivel: 3, selo: "DISPONIVEL" });
const club = {
  id: "club", tipo: "COMPRE_MAIS", nome: "Monte seu Club", inicio: "2026-01-01T00:00:00Z", fim: "2027-01-01T00:00:00Z",
  escopo: "TODOS", produtos: [], modo: "PRECO_POR_GRUPO", grupo: { qtd: 3, precoCentavos: 11999 }, umaPorCliente: false,
};
const semana = {
  id: "semana", tipo: "DESCONTO_PRODUTO", nome: "Semana Limone", inicio: "2026-01-01T00:00:00Z", fim: "2027-01-01T00:00:00Z",
  escopo: "ESPECIFICOS", produtos: { [A]: { modo: "PERCENTUAL", valor: 20 } },
};
const cupom = {
  id: "cupom", tipo: "CUPOM", nome: "Boas-vindas", inicio: "2026-01-01T00:00:00Z", fim: "2027-01-01T00:00:00Z",
  escopo: "TODOS", produtos: [], modo: "VALOR", codigo: "BEMVINDA10", valor: 1000, quantidadeTotal: 10, quantidadeUsada: 0,
  limitePorCliente: 1, validadeDias: 3,
};

function montar(opcoes: { promocoes?: unknown[]; disponivel?: number; limite?: boolean } = {}) {
  const chamadas: { funcao: string; args: Record<string, unknown> }[] = [];
  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      chamadas.push({ funcao, args });
      const r: unknown = (() => {
        switch (funcao) {
          case "pricing_promotions": {
            const base = opcoes.promocoes ?? [club, semana];
            return args.p_coupon === "BEMVINDA10" ? [...base, cupom] : base;
          }
          case "catalog_home":
            return [
              { tipo: "NOVIDADES", titulo: "Chegou agora", conteudo: [card(A, "limone-amalfi"), card(B, "teddy-rosa")] },
              { tipo: "MONTE_SEU_CLUB", titulo: null, conteudo: null },
            ];
          case "catalog_products":
            return [card(A, "limone-amalfi")];
          case "catalog_product":
            return args.p_slug === "limone-amalfi" ? { ...card(A, "limone-amalfi"), fotos: [] } : null;
          case "catalog_collections":
            return [{ id: "c1", slug: "limone", nome: "Limone", cor: "LIMAO" }];
          case "catalog_looks":
            return [{ id: "l1", titulo: "Verão", produtos: [{ ...card(A, "limone-amalfi"), x: 0.4, y: 0.5 }] }];
          case "hit_rate_limit":
            return opcoes.limite ?? true;
          case "cart_products": {
            const todas = [
              { id: A1, produtoId: A, nome: "Limone Amalfi", rotulo: "Único · P ao 42" },
              { id: A2, produtoId: A, nome: "Limone Amalfi", rotulo: "Plus · 44 ao 48" },
              { id: B1, produtoId: B, nome: "Teddy Rosa", rotulo: "Único · P ao 42" },
            ];
            return {
              variantes: todas.filter((v) => (args.p_variant_ids as string[]).includes(v.id))
                .map((v) => ({ ...v, precoCentavos: 4999, disponivel: opcoes.disponivel ?? 2 })),
              limites: { maxPecas: 9, maxPorProduto: 2 },
            };
          }
          default:
            throw new Error(`rpc inesperada ${funcao}`);
        }
      })();
      return Promise.resolve(r as T);
    },
  };
  const app = criarApiPublica(SEGREDO, {
    banco,
    agora: () => new Date("2026-10-10T12:00:00Z"),
    whatsapp: whatsappFalso(),
    pagamentos: pagamentosFalso(),
    turnstile: { verificar: () => Promise.resolve(true) },
    pepper: "p".repeat(32),
    numeroLoja: "5577998155772",
    urlLoja: "https://tshirtclub.pt",
  });
  const pedir = (caminho: string, corpo?: unknown) =>
    app.request(`/api-public${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { "x-repasse-segredo": SEGREDO, "x-cliente-ip": "200.1.2.3", ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  return { pedir, chamadas };
}

Deno.test("página inicial: preço promocional em cada produto e a oferta do Club preenchida", async () => {
  const r = await montar().pedir("/v1/catalog/home");
  assertEquals(r.status, 200);
  const blocos = await r.json();
  assertEquals(blocos[0].conteudo[0].precoPromocionalCentavos, 3999);
  assertEquals(blocos[0].conteudo[1].precoPromocionalCentavos, null);
  assertEquals(blocos[0].conteudo[1].noClub, true);
  assertEquals(blocos[1].conteudo, { nome: "Monte seu Club", qtd: 3, precoCentavos: 11999, fim: "2027-01-01T00:00:00.000Z" });
});

Deno.test("sem oferta vigente, o bloco do Club some", async () => {
  const blocos = await (await montar({ promocoes: [] }).pedir("/v1/catalog/home")).json();
  assertEquals(blocos.map((b: { tipo: string }) => b.tipo), ["NOVIDADES"]);
});

Deno.test("produtos, filtros, página do produto e looks", async () => {
  const { pedir, chamadas } = montar();
  assertEquals((await (await pedir("/v1/catalog/products?collection=limone&availability=DISPONIVEL")).json())[0].slug, "limone-amalfi");
  assertEquals(chamadas.find((c) => c.funcao === "catalog_products")?.args, { p_collection: "limone", p_availability: "DISPONIVEL" });
  assertEquals((await pedir("/v1/catalog/products?availability=TUDO")).status, 400);
  assertEquals((await (await pedir("/v1/catalog/products/limone-amalfi")).json()).precoPromocionalCentavos, 3999);
  assertEquals((await pedir("/v1/catalog/products/nao-existe")).status, 404);
  assertEquals((await pedir("/v1/catalog/products/..%2Fetc")).status, 404);
  assertEquals((await (await pedir("/v1/catalog/looks")).json())[0].produtos[0].noClub, true);
  assertEquals((await (await pedir("/v1/catalog/collections")).json())[0].slug, "limone");
});

Deno.test("cotação: Monte seu Club a cada 3", async () => {
  const r = await montar({ promocoes: [club] }).pedir("/v1/cart/quote", { itens: [item(A, A1, 2), item(B, B1, 1)] });
  assertEquals(r.status, 200);
  const q = await r.json();
  assertEquals([q.subtotalCentavos, q.descontoCentavos, q.totalCentavos], [14997, 2998, 11999]);
  assertEquals(q.proximoGrupo.faltam, 3);
});

Deno.test("cotação: cupom aplicado, não é o melhor e inválido", async () => {
  const doisItens = { itens: [item(A, A1, 1), item(B, B1, 1)] };
  const aplicado = await (await montar({ promocoes: [club] }).pedir("/v1/cart/quote", { ...doisItens, cupom: "bemvinda10" })).json();
  assertEquals(aplicado.cupom, { codigo: "BEMVINDA10", situacao: "APLICADO" });
  assertEquals(aplicado.totalCentavos, 8998);
  const invalido = await (await montar().pedir("/v1/cart/quote", { ...doisItens, cupom: "NAOEXISTE" })).json();
  assertEquals(invalido.cupom, { codigo: "NAOEXISTE", situacao: "INVALIDO", motivo: "NAO_ENCONTRADO" });
});

Deno.test("cotação: sem estoque, limites e excesso de pedidos", async () => {
  const semEstoque = await montar({ disponivel: 1 }).pedir("/v1/cart/quote", { itens: [item(A, A2, 2)] });
  assertEquals(semEstoque.status, 409);
  assertEquals((await semEstoque.json()).erro, {
    codigo: "INSUFFICIENT_STOCK",
    detalhes: { produtos: ["Limone Amalfi · Plus · 44 ao 48"], itens: [{ produtoId: A, varianteId: A2, disponivel: 1 }] },
  });
  const desconhecido = await montar().pedir("/v1/cart/quote", { itens: [item(C, A1, 1)] });
  assertEquals((await desconhecido.json()).erro.detalhes.itens, [{ produtoId: C, varianteId: A1, disponivel: 0 }], "variante de outra peça");
  const tres = await montar().pedir("/v1/cart/quote", { itens: [item(A, A1, 3)] });
  assertEquals((await tres.json()).erro, { codigo: "MAX_PER_MODEL", detalhes: { maxPorProduto: 2 } });
  const somaTamanhos = await montar().pedir("/v1/cart/quote", { itens: [item(A, A1, 2), item(A, A2, 1)] });
  assertEquals((await somaTamanhos.json()).erro, { codigo: "MAX_PER_MODEL", detalhes: { maxPorProduto: 2 } }, "o limite soma os tamanhos");
  assertEquals((await montar({ limite: false }).pedir("/v1/cart/quote", { itens: [item(A, A1, 1)] })).status, 429);
  assertEquals((await montar().pedir("/v1/cart/quote", { itens: [] })).status, 400);
  assertEquals((await montar().pedir("/v1/cart/quote", { itens: [{ produtoId: A, qtd: 1 }] })).status, 400, "sem o tamanho");
});

Deno.test("cotação: Único e Plus da mesma peça fecham o Club com uma terceira", async () => {
  const q = await (await montar({ promocoes: [club] }).pedir("/v1/cart/quote", { itens: [item(A, A1, 1), item(A, A2, 1), item(B, B1, 1)] })).json();
  assertEquals(q.totalCentavos, 11999);
  assertEquals(q.linhas.map((l: { varianteId: string }) => l.varianteId), [A1, A2, B1]);
});
