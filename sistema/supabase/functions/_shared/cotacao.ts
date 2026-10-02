// Cotação da sacola com o motor de preço (packages/domain), dividida entre a api-public (sacola e
// reserva do site) e a api-admin (reserva manual, 0470): limites de app_settings, disponibilidade
// aproximada (a verdade é decidida no banco, com as variantes travadas) e as promoções vigentes.

import {
  ErroDominio,
  calcularPreco,
  promocaoDoBancoSchema,
  validarCarrinho,
  type Cliente,
  type ItemCarrinho,
  type Promocao,
  type ResultadoPreco,
} from "@tshirtclub/domain";
import type { Banco } from "./banco.ts";
import { chamar } from "./erros-banco.ts";

export async function promocoesVigentes(banco: Banco, cupom?: string): Promise<Promocao[]> {
  const linhas = await chamar<unknown[]>(banco, "pricing_promotions", { p_coupon: cupom ?? null });
  return linhas.map((l) => promocaoDoBancoSchema.parse(l));
}

/** Um tamanho pedido na sacola (cart_products, 0370): a peça, o preço dela e o disponível do tamanho. */
interface VarianteSacola {
  id: string;
  produtoId: string;
  nome: string;
  rotulo: string;
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
  const dados = await chamar<{ variantes: VarianteSacola[]; limites: { maxPecas: number; maxPorProduto: number } }>(
    banco, "cart_products", { p_variant_ids: itens.map((i) => i.varianteId) });

  const erro = validarCarrinho(itens, dados.limites)[0];
  if (erro) throw new ErroDominio(erro, erro === "MAX_ITEMS" ? { maxPecas: dados.limites.maxPecas } : { maxPorProduto: dados.limites.maxPorProduto });

  // Tamanho de outra peça, inativo ou de peça fora da loja não vem do banco: conta como indisponível.
  const porId = new Map(dados.variantes.map((v) => [v.id, v]));
  const doItem = (i: ItemCarrinho) => {
    const v = porId.get(i.varianteId);
    return v && v.produtoId === i.produtoId ? v : undefined;
  };
  const faltando = opcoes.conferirEstoque === false ? [] : itens.filter((i) => (doItem(i)?.disponivel ?? 0) < i.qtd);
  if (faltando.length > 0) {
    throw new ErroDominio("INSUFFICIENT_STOCK", {
      produtos: faltando.map((i) => doItem(i)).filter((v) => v !== undefined).map((v) => `${v.nome} · ${v.rotulo}`),
      itens: faltando.map((i) => ({ produtoId: i.produtoId, varianteId: i.varianteId, disponivel: doItem(i)?.disponivel ?? 0 })),
    });
  }

  return calcularPreco({
    // Tamanho que saiu da vitrine entra com preço 0: a reserva recusa com STOCK_UNAVAILABLE.
    itens: itens.map((i) => ({ produto: { id: i.produtoId, precoCentavos: doItem(i)?.precoCentavos ?? 0 }, varianteId: i.varianteId, qtd: i.qtd })),
    promocoes: await promocoesVigentes(banco, cupom),
    agora,
    codigoCupom: cupom,
    cliente: opcoes.cliente,
  });
}
