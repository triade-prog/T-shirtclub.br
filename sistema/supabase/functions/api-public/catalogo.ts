// Catálogo da loja (seção 11, rotas públicas): página inicial, coleções, produtos, página do
// produto, looks e a cotação da sacola. O banco devolve o catálogo; o preço promocional, a
// oferta "Monte seu Club" e o total da sacola saem do motor de preço (packages/domain).

import type { Hono } from "hono";
import {
  ErroDominio,
  calcularPreco,
  cotacaoSchema,
  precoPromocional,
  promocaoDoBancoSchema,
  validarCarrinho,
  type Cliente,
  type CompreMaisGrupo,
  type ItemCarrinho,
  type Promocao,
  type ResultadoPreco,
} from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { ipDaCliente } from "../_shared/repasse.ts";
import { lerCorpo } from "../_shared/validar.ts";

export interface DepsLoja {
  banco: Banco;
  agora?: () => Date;
}

async function promocoesVigentes(banco: Banco, cupom?: string): Promise<Promocao[]> {
  const linhas = await chamar<unknown[]>(banco, "pricing_promotions", { p_coupon: cupom ?? null });
  return linhas.map((l) => promocaoDoBancoSchema.parse(l));
}

function ofertaClub(promocoes: readonly Promocao[]): CompreMaisGrupo | undefined {
  return promocoes.find((p): p is CompreMaisGrupo => p.tipo === "COMPRE_MAIS" && p.modo === "PRECO_POR_GRUPO");
}

/** Acrescenta, em todo produto do JSON, o preço promocional vigente e se entra no Club. */
function comPrecos(valor: unknown, promocoes: readonly Promocao[], agora: Date): unknown {
  const club = ofertaClub(promocoes);
  const visitar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visitar);
    if (!v || typeof v !== "object") return v;
    const o: Record<string, unknown> = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visitar(x)]));
    if (typeof o.id === "string" && typeof o.slug === "string" && typeof o.precoCentavos === "number") {
      o.precoPromocionalCentavos = precoPromocional({ id: o.id, precoCentavos: o.precoCentavos }, promocoes, agora)?.precoCentavos ?? null;
      o.noClub = Boolean(club && (club.escopo === "TODOS" || club.produtos.includes(o.id)));
    }
    return o;
  };
  return visitar(valor);
}

interface ProdutoSacola {
  id: string;
  nome: string;
  precoCentavos: number;
  disponivel: number;
}

/**
 * Cotação da sacola: limites de app_settings, disponibilidade aproximada (a verdade é
 * decidida em create_reservation) e o motor de preço. Usada pela cotação e pela reserva.
 */
export async function cotar(
  banco: Banco,
  itens: ItemCarrinho[],
  cupomDigitado: string | undefined,
  agora: Date,
  opcoes: { cliente?: Cliente; conferirEstoque?: boolean } = {},
): Promise<ResultadoPreco> {
  const cupom = cupomDigitado?.trim().toUpperCase() || undefined;
  const dados = await chamar<{ produtos: ProdutoSacola[]; limites: { maxPecas: number; maxPorProduto: number } }>(
    banco, "cart_products", { p_ids: itens.map((i) => i.produtoId) });

  const erro = validarCarrinho(itens, dados.limites)[0];
  if (erro) throw new ErroDominio(erro, erro === "MAX_ITEMS" ? { maxPecas: dados.limites.maxPecas } : { maxPorProduto: dados.limites.maxPorProduto });

  const porId = new Map(dados.produtos.map((p) => [p.id, p]));
  const faltando = opcoes.conferirEstoque === false ? [] : itens.filter((i) => (porId.get(i.produtoId)?.disponivel ?? 0) < i.qtd);
  if (faltando.length > 0) {
    throw new ErroDominio("INSUFFICIENT_STOCK", {
      produtos: faltando.map((i) => porId.get(i.produtoId)?.nome).filter(Boolean),
      itens: faltando.map((i) => ({ produtoId: i.produtoId, disponivel: porId.get(i.produtoId)?.disponivel ?? 0 })),
    });
  }

  return calcularPreco({
    // Produto que saiu da vitrine entra com preço 0: a reserva recusa com STOCK_UNAVAILABLE.
    itens: itens.map((i) => ({ produto: { id: i.produtoId, precoCentavos: porId.get(i.produtoId)?.precoCentavos ?? 0 }, qtd: i.qtd })),
    promocoes: await promocoesVigentes(banco, cupom),
    agora,
    codigoCupom: cupom,
    cliente: opcoes.cliente,
  });
}

export function rotasCatalogo(app: Hono, deps: DepsLoja): void {
  const agora = () => deps.agora?.() ?? new Date();

  app.get("/v1/catalog/home", async (c) => {
    const [blocos, promocoes] = await Promise.all([
      chamar<{ tipo: string; titulo: string | null; conteudo: unknown }[]>(deps.banco, "catalog_home"),
      promocoesVigentes(deps.banco),
    ]);
    const club = ofertaClub(promocoes);
    const resposta = blocos
      .map((b) => b.tipo !== "MONTE_SEU_CLUB" ? b : club
        ? { ...b, conteudo: { nome: club.nome, qtd: club.grupo.qtd, precoCentavos: club.grupo.precoCentavos, fim: club.fim.toISOString() } }
        : null)
      .filter((b) => b !== null);
    return c.json(comPrecos(resposta, promocoes, agora()));
  });

  app.get("/v1/catalog/collections", async (c) => c.json(await chamar(deps.banco, "catalog_collections")));

  app.get("/v1/catalog/products", async (c) => {
    const colecao = c.req.query("collection");
    const disponibilidade = c.req.query("availability");
    if (colecao !== undefined && !/^[a-z0-9-]{1,80}$/.test(colecao)) throw new ErroDominio("VALIDATION_ERROR");
    if (disponibilidade !== undefined && disponibilidade !== "DISPONIVEL") throw new ErroDominio("VALIDATION_ERROR");
    const [produtos, promocoes] = await Promise.all([
      chamar(deps.banco, "catalog_products", { p_collection: colecao ?? null, p_availability: disponibilidade ?? null }),
      promocoesVigentes(deps.banco),
    ]);
    return c.json(comPrecos(produtos, promocoes, agora()));
  });

  app.get("/v1/catalog/products/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new ErroDominio("NOT_FOUND");
    const [produto, promocoes] = await Promise.all([chamar(deps.banco, "catalog_product", { p_slug: slug }), promocoesVigentes(deps.banco)]);
    if (!produto) throw new ErroDominio("NOT_FOUND");
    return c.json(comPrecos(produto, promocoes, agora()));
  });

  app.get("/v1/catalog/looks", async (c) => {
    const [looks, promocoes] = await Promise.all([chamar(deps.banco, "catalog_looks"), promocoesVigentes(deps.banco)]);
    return c.json(comPrecos(looks, promocoes, agora()));
  });

  // Cotação: confere as regras de 9 peças e 2 por produto, a disponibilidade mostrada na
  // vitrine e calcula promoções e cupom. Não reserva nada.
  app.post("/v1/cart/quote", async (c) => {
    const { itens, cupom } = await lerCorpo(c, cotacaoSchema);
    const ip = ipDaCliente(c.req.raw.headers) ?? "sem-ip";
    const dentro = await chamar<boolean>(deps.banco, "hit_rate_limit", {
      p_key: `cotacao:${await sha256Hex(ip)}`,
      p_window: "1 minute",
      p_max: 60,
    });
    if (!dentro) throw new ErroDominio("RATE_LIMITED");
    return c.json(await cotar(deps.banco, itens, cupom, agora()));
  });
}
