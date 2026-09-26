// Catálogo pelo painel (seção 11): coleções, produtos, fotos, looks, página inicial e
// promoções. Cada rota valida a entrada com o schema do packages/domain e chama a função
// SQL do 0185, que grava e audita. As fotos vão direto ao Storage pela URL assinada.

import type { Context, Hono } from "hono";
import {
  ErroDominio,
  blocosInicioSchema,
  colecaoEntradaSchema,
  envioArquivoSchema,
  fotoEdicaoSchema,
  fotoEntradaSchema,
  idSchema,
  lookEntradaSchema,
  ordemFotosSchema,
  produtoEntradaSchema,
  promocaoEntradaSchema,
} from "@tshirtclub/domain";
import type { Armazenamento } from "../_shared/armazenamento.ts";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export interface DepsCatalogo {
  banco: Banco;
  armazenamento: Armazenamento;
}

/** Id da rota; id malformado responde 404, como um que não existe. */
function id(c: Context, nome = "id"): string {
  const r = idSchema.safeParse(c.req.param(nome));
  if (!r.success) throw new ErroDominio("NOT_FOUND");
  return r.data;
}

function admin(c: Context<VarsAdmin>): string {
  return c.get("admin").userId;
}

/** Apagar o arquivo é melhor esforço: o registro já saiu do banco. */
async function apagarArquivo(armazenamento: Armazenamento, caminho: string | null): Promise<void> {
  if (!caminho) return;
  try {
    await armazenamento.apagar([caminho]);
  } catch (e) {
    console.error(JSON.stringify({ funcao: "api-admin", aviso: "arquivo não apagado do Storage", caminho, erro: String(e) }));
  }
}

export function rotasCatalogoAdmin(app: Hono<VarsAdmin>, { banco, armazenamento }: DepsCatalogo): void {
  // Coleções
  app.get("/v1/admin/collections", async (c) => c.json(await chamar(banco, "admin_list_collections")));
  app.post("/v1/admin/collections", async (c) => {
    const dados = await lerCorpo(c, colecaoEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_collection", { p_admin: admin(c), p_id: null, p: dados }) }, 201);
  });
  app.put("/v1/admin/collections/:id", async (c) => {
    const dados = await lerCorpo(c, colecaoEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_collection", { p_admin: admin(c), p_id: id(c), p: dados }) });
  });

  // Produtos
  app.get("/v1/admin/products", async (c) => {
    const colecao = c.req.query("colecao");
    const pagina = Number(c.req.query("pagina") ?? "1");
    if (colecao !== undefined && !idSchema.safeParse(colecao).success) throw new ErroDominio("VALIDATION_ERROR");
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10_000) throw new ErroDominio("VALIDATION_ERROR");
    return c.json(await chamar(banco, "admin_list_products", {
      p_q: (c.req.query("q") ?? "").slice(0, 80) || null,
      p_collection: colecao ?? null,
      p_page: pagina,
    }));
  });
  app.get("/v1/admin/products/:id", async (c) => {
    const produto = await chamar(banco, "admin_get_product", { p_id: id(c) });
    if (!produto) throw new ErroDominio("NOT_FOUND");
    return c.json(produto);
  });
  app.post("/v1/admin/products", async (c) => {
    const dados = await lerCorpo(c, produtoEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_product", { p_admin: admin(c), p_id: null, p: dados }) }, 201);
  });
  app.put("/v1/admin/products/:id", async (c) => {
    const dados = await lerCorpo(c, produtoEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_product", { p_admin: admin(c), p_id: id(c), p: dados }) });
  });

  // Fotos do produto: grava o registro e devolve a URL assinada para o envio do arquivo.
  app.post("/v1/admin/products/:id/images", async (c) => {
    const dados = await lerCorpo(c, fotoEntradaSchema);
    const foto = await chamar<{ caminho: string }>(banco, "admin_add_product_image", { p_admin: admin(c), p_product: id(c), p: dados });
    return c.json({ foto, envio: await armazenamento.urlDeEnvio(foto.caminho) }, 201);
  });
  app.patch("/v1/admin/products/:id/images/order", async (c) => {
    const { ids } = await lerCorpo(c, ordemFotosSchema);
    return c.json(await chamar(banco, "admin_reorder_product_images", { p_admin: admin(c), p_product: id(c), p_ids: ids }));
  });
  app.patch("/v1/admin/products/:id/images/:imageId", async (c) => {
    id(c);
    const dados = await lerCorpo(c, fotoEdicaoSchema);
    return c.json(await chamar(banco, "admin_update_product_image", { p_admin: admin(c), p_image: id(c, "imageId"), p: dados }));
  });
  app.delete("/v1/admin/products/:id/images/:imageId", async (c) => {
    id(c);
    const caminho = await chamar<string>(banco, "admin_delete_product_image", { p_admin: admin(c), p_image: id(c, "imageId") });
    await apagarArquivo(armazenamento, caminho);
    return c.json({ ok: true });
  });

  // Capa de coleção e foto de look: o caminho é gerado aqui, nunca vem da tela.
  app.post("/v1/admin/uploads", async (c) => {
    const { destino } = await lerCorpo(c, envioArquivoSchema);
    const caminho = `${destino === "colecao" ? "colecoes" : "looks"}/${crypto.randomUUID()}.webp`;
    return c.json({ caminho, envio: await armazenamento.urlDeEnvio(caminho) }, 201);
  });

  // Looks
  app.get("/v1/admin/looks", async (c) => c.json(await chamar(banco, "admin_list_looks")));
  app.post("/v1/admin/looks", async (c) => {
    const dados = await lerCorpo(c, lookEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_look", { p_admin: admin(c), p_id: null, p: dados }) }, 201);
  });
  app.put("/v1/admin/looks/:id", async (c) => {
    const dados = await lerCorpo(c, lookEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_look", { p_admin: admin(c), p_id: id(c), p: dados }) });
  });
  app.delete("/v1/admin/looks/:id", async (c) => {
    await apagarArquivo(armazenamento, await chamar<string>(banco, "admin_delete_look", { p_admin: admin(c), p_id: id(c) }));
    return c.json({ ok: true });
  });

  // Página inicial
  app.get("/v1/admin/home-blocks", async (c) => c.json(await chamar(banco, "admin_list_home_blocks")));
  app.put("/v1/admin/home-blocks", async (c) => {
    const { blocos } = await lerCorpo(c, blocosInicioSchema);
    return c.json(await chamar(banco, "admin_set_home_blocks", { p_admin: admin(c), p: blocos }));
  });

  // Promoções (desconto do produto, compre e economize mais, cupom)
  app.get("/v1/admin/promotions", async (c) => c.json(await chamar(banco, "admin_list_promotions")));
  app.post("/v1/admin/promotions", async (c) => {
    const dados = await lerCorpo(c, promocaoEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_promotion", { p_admin: admin(c), p_id: null, p: dados }) }, 201);
  });
  app.put("/v1/admin/promotions/:id", async (c) => {
    const dados = await lerCorpo(c, promocaoEntradaSchema);
    return c.json({ id: await chamar(banco, "admin_save_promotion", { p_admin: admin(c), p_id: id(c), p: dados }) });
  });
  app.post("/v1/admin/promotions/:id/end", async (c) => {
    return c.json({ encerradaEm: await chamar(banco, "end_promotion", { p_id: id(c), p_admin_id: admin(c) }) });
  });
}
