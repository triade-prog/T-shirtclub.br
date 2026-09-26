// Sacola montada no servidor: lê o cookie, busca cada peça no catálogo, tira o que esgotou
// ou saiu da loja e cota o resto na api-public. Usada pela sacola e pelo "Seus dados".
import { cookies, headers } from "next/headers";
import type { ItemCarrinho, ResultadoPreco } from "@tshirtclub/domain";
import { buscarCatalogo, buscarOfertaClub, cotarSacola, type OfertaClub, type ProdutoDetalhe } from "./catalogo";
import { COOKIE_SACOLA, lerSacola } from "./sacola";

export interface SacolaMontada {
  /** Como está no cookie (slug e quantidade). */
  itens: ItemCarrinho[];
  /** Produto de cada item do cookie, na mesma ordem; null se saiu da loja. */
  produtos: (ProdutoDetalhe | null)[];
  /** O que entra na conta, com a quantidade ajustada ao estoque. */
  validos: { produto: ProdutoDetalhe; qtd: number }[];
  /** Pedido para a api-public (id do produto e quantidade). */
  pedido: ItemCarrinho[];
  cotacao: ResultadoPreco | null;
  club: OfertaClub | null;
  avisos: string[];
}

export async function montarSacola(): Promise<SacolaMontada> {
  const itens = lerSacola((await cookies()).get(COOKIE_SACOLA)?.value);
  const [produtos, club] = await Promise.all([
    Promise.all(itens.map((i) => buscarCatalogo<ProdutoDetalhe>(`v1/catalog/products/${i.produtoId}`))),
    buscarOfertaClub(),
  ]);

  // Peça que saiu da vitrine ou esgotou sai da conta; com menos estoque, a quantidade baixa.
  const avisos: string[] = [];
  const validos: SacolaMontada["validos"] = [];
  itens.forEach((item, i) => {
    const p = produtos[i];
    if (!p) return void avisos.push("Uma peça da sua sacola não está mais na loja e foi deixada de fora.");
    const qtd = Math.min(item.qtd, p.disponivel);
    if (qtd < item.qtd) avisos.push(qtd === 0 ? `${p.nome} esgotou e ficou fora da conta.` : `Só resta ${qtd} de ${p.nome}.`);
    if (qtd > 0) validos.push({ produto: p, qtd });
  });

  const pedido = validos.map((v) => ({ produtoId: v.produto.id, qtd: v.qtd }));
  const resultado = pedido.length > 0 ? await cotarSacola(pedido, await headers()) : null;
  const cotacao = resultado?.ok ? resultado.cotacao : null;
  if (pedido.length > 0 && !cotacao) avisos.push("Não conseguimos calcular o total agora. Tente de novo em instantes.");

  return { itens, produtos, validos, pedido, cotacao, club, avisos };
}
