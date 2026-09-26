import { assertEquals, assertMatch } from "@std/assert";
import { ErroBanco } from "../_shared/banco.ts";
import { ADMIN, erro, logado, montar } from "./teste_util.ts";

const COLECAO = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const PRODUTO = "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
const FOTO = "8b3c4d5e-6f7a-4b2c-8d3e-4f5a6b7c8d9e";

const produto = {
  colecaoId: COLECAO, codigo: "lim-01", slug: "limone-amalfi", nome: "Limone Amalfi", precoCentavos: 4999, medidas: { busto: 104 },
};

Deno.test("catálogo do painel exige a sessão de dois fatores", async () => {
  const { pedir } = montar();
  assertEquals((await pedir("/v1/admin/products")).status, 401);
  assertEquals((await pedir("/v1/admin/promotions", { tipo: "CUPOM" })).status, 401);
});

Deno.test("produto: valida, grava com o administrador da sessão e devolve 201", async () => {
  const { pedir, rpcs } = await logado({ rpcExtra: (f) => (f === "admin_save_product" ? PRODUTO : undefined) });
  const r = await pedir("/v1/admin/products", produto);
  assertEquals(r.status, 201);
  assertEquals(await r.json(), { id: PRODUTO });
  const gravado = rpcs.find((c) => c.funcao === "admin_save_product")!;
  assertEquals(gravado.args.p_admin, ADMIN);
  assertEquals((gravado.args.p as { codigo: string }).codigo, "LIM-01");
  assertEquals((await pedir("/v1/admin/products", { ...produto, precoCentavos: 49.99 })).status, 400);
});

Deno.test("erros do banco viram códigos da API", async () => {
  const casos: [ErroBanco, number, string][] = [
    [new ErroBanco("23505", "duplicate key"), 409, "ALREADY_EXISTS"],
    [new ErroBanco("TS101", "precisa de foto"), 409, "PRODUCT_NEEDS_IMAGE"],
    [new ErroBanco("TS130", "não encontrado"), 404, "NOT_FOUND"],
    [new ErroBanco("TS122", "inativo"), 403, "FORBIDDEN"],
  ];
  for (const [e, status, codigo] of casos) {
    const { pedir } = await logado({ rpcExtra: (f) => (f === "admin_save_product" ? e : undefined) });
    const r = await pedir(`/v1/admin/products/${PRODUTO}`, produto, "PUT");
    assertEquals([r.status, (await erro(r)).codigo], [status, codigo]);
  }
});

Deno.test("foto: registro no banco e URL assinada para enviar direto ao Storage", async () => {
  const { pedir } = await logado({
    rpcExtra: (f) => (f === "admin_add_product_image" ? { id: FOTO, caminho: `produtos/${PRODUTO}/abc.webp`, posicao: 1 } : undefined),
  });
  const r = await pedir(`/v1/admin/products/${PRODUTO}/images`, { tipo: "FRENTE", alt: "Camiseta de frente", largura: 1440, altura: 1800 });
  assertEquals(r.status, 201);
  const corpo = await r.json();
  assertEquals(corpo.foto.posicao, 1);
  assertMatch(corpo.envio.url, /^https:\/\/p\.supabase\.co\/storage\/v1\/object\/upload\/sign\/catalogo\/produtos\//);
  const semAlt = await pedir(`/v1/admin/products/${PRODUTO}/images`, { tipo: "FRENTE", alt: " ", largura: 1440, altura: 1800 });
  assertEquals(semAlt.status, 400);
});

Deno.test("foto: limite de 10, ordem e exclusão apagando o arquivo", async () => {
  const cheio = await logado({ rpcExtra: (f) => (f === "admin_add_product_image" ? new ErroBanco("TS102", "máximo 10") : undefined) });
  const r = await cheio.pedir(`/v1/admin/products/${PRODUTO}/images`, { tipo: "FRENTE", alt: "Frente", largura: 10, altura: 10 });
  assertEquals((await erro(r)).codigo, "IMAGE_LIMIT");

  const m = await logado({
    rpcExtra: (f) => ({ admin_reorder_product_images: [], admin_delete_product_image: "produtos/p/1.webp" } as Record<string, unknown>)[f],
  });
  assertEquals((await m.pedir(`/v1/admin/products/${PRODUTO}/images/order`, { ids: [FOTO] }, "PATCH")).status, 200);
  assertEquals((await m.pedir(`/v1/admin/products/${PRODUTO}/images/order`, { ids: [FOTO, FOTO] }, "PATCH")).status, 400);
  assertEquals((await m.pedir(`/v1/admin/products/${PRODUTO}/images/${FOTO}`, undefined, "DELETE")).status, 200);
  assertEquals(m.arquivosApagados, ["produtos/p/1.webp"]);
});

Deno.test("capa de coleção e foto de look: caminho gerado no servidor", async () => {
  const { pedir } = await logado();
  const r = await pedir("/v1/admin/uploads", { destino: "look" });
  assertEquals(r.status, 201);
  assertMatch((await r.json()).caminho, /^looks\/[0-9a-f-]{36}\.webp$/);
  assertEquals((await pedir("/v1/admin/uploads", { destino: "../outro" })).status, 400);
});

Deno.test("promoções: cria o Monte seu Club, recusa formato errado e encerra", async () => {
  const { pedir, rpcs } = await logado({
    rpcExtra: (f) => ({ admin_save_promotion: "b1", end_promotion: "2026-10-10T12:00:00Z" } as Record<string, unknown>)[f],
  });
  const club = {
    tipo: "COMPRE_MAIS", modo: "PRECO_POR_GRUPO", nome: "Monte seu Club", grupo: { qtd: 3, precoCentavos: 11999 },
    inicio: "2026-10-01T00:00:00-03:00", fim: "2026-12-31T23:59:00-03:00",
  };
  assertEquals((await pedir("/v1/admin/promotions", club)).status, 201);
  assertEquals((rpcs.find((c) => c.funcao === "admin_save_promotion")!.args.p as { grupo: unknown }).grupo, { qtd: 3, precoCentavos: 11999 });
  assertEquals((await pedir("/v1/admin/promotions", { ...club, grupo: null })).status, 400);
  const fim = await pedir(`/v1/admin/promotions/${PRODUTO}/end`, {});
  assertEquals(await fim.json(), { encerradaEm: "2026-10-10T12:00:00Z" });
});

Deno.test("promoção: produto já em outro desconto no período", async () => {
  const { pedir } = await logado({ rpcExtra: (f) => (f === "admin_save_promotion" ? new ErroBanco("23P01", "exclusion") : undefined) });
  const r = await pedir("/v1/admin/promotions", {
    tipo: "DESCONTO_PRODUTO", nome: "Semana", inicio: "2026-10-01T00:00:00Z", fim: "2026-10-08T00:00:00Z",
    produtos: [{ produtoId: PRODUTO, modo: "PERCENTUAL", valor: 20 }],
  });
  assertEquals((await erro(r)).codigo, "PROMOTION_OVERLAP");
});

Deno.test("looks e página inicial", async () => {
  const m = await logado({
    rpcExtra: (f) => ({ admin_save_look: "l1", admin_set_home_blocks: [{ tipo: "NOVIDADES" }], admin_delete_look: "looks/v.webp" } as Record<string, unknown>)[f],
  });
  const look = { titulo: "Verão", foto: { caminho: "looks/v.webp", alt: "Modelo com a Limone" }, produtos: [{ produtoId: PRODUTO, x: 0.4, y: 0.5 }] };
  assertEquals((await m.pedir("/v1/admin/looks", look)).status, 201);
  assertEquals((await m.pedir("/v1/admin/home-blocks", { blocos: [{ tipo: "NOVIDADES" }] }, "PUT")).status, 200);
  assertEquals((await m.pedir(`/v1/admin/looks/${PRODUTO}`, undefined, "DELETE")).status, 200);
  assertEquals(m.arquivosApagados, ["looks/v.webp"]);
});

Deno.test("bloqueios: listar, liberar e manter sempre com motivo", async () => {
  const { pedir, rpcs } = await logado({
    rpcExtra: (f) => ({ admin_list_phone_blocks: [{ id: "b1", status: "ATIVO" }], release_phone_block: null, keep_phone_block: new ErroBanco("TS161", "já liberado") } as Record<string, unknown>)[f],
  });
  assertEquals((await (await pedir("/v1/admin/phone-blocks")).json())[0].id, "b1");
  assertEquals(rpcs.find((r) => r.funcao === "admin_list_phone_blocks")!.args, { p_status: "ATIVO" });
  assertEquals((await pedir("/v1/admin/phone-blocks?status=OUTRO")).status, 400);
  assertEquals((await pedir(`/v1/admin/phone-blocks/${PRODUTO}/release`, { motivo: "" })).status, 400);
  assertEquals((await pedir(`/v1/admin/phone-blocks/${PRODUTO}/release`, { motivo: "Cliente antiga" })).status, 200);
  assertEquals(rpcs.find((r) => r.funcao === "release_phone_block")!.args, { p_block_id: PRODUTO, p_admin: ADMIN, p_reason: "Cliente antiga" });
  assertEquals((await erro(await pedir(`/v1/admin/phone-blocks/${PRODUTO}/keep`, { motivo: "Sem resposta" }))).codigo, "ALREADY_APPLIED");
});
