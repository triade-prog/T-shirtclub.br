// Sacola montada no servidor: lê o cookie, busca cada peça no catálogo, tira o que esgotou
// ou saiu da loja e cota o resto na api-public. Usada pela sacola e pelo "Seus dados".
import { cookies, headers } from "next/headers";
import type { ItemCarrinho, ResultadoPreco } from "@tshirtclub/domain";
import { buscarCatalogo, buscarOfertaClub, cotarSacola, type OfertaClub, type ProdutoDetalhe, type TamanhoLoja } from "./catalogo";
import { COOKIE_SACOLA, lerSacola, type ItemSacola } from "./sacola";

export interface SacolaMontada {
  /** Como está no cookie (slug, tamanho e quantidade). */
  itens: ItemSacola[];
  /** Produto de cada item do cookie, na mesma ordem; null se saiu da loja. */
  produtos: (ProdutoDetalhe | null)[];
  /** O que entra na conta: a peça, o tamanho e a quantidade ajustada ao estoque dele. */
  validos: { produto: ProdutoDetalhe; tamanho: TamanhoLoja; qtd: number }[];
  /** Pedido para a api-public (peça, variante e quantidade). */
  pedido: ItemCarrinho[];
  cotacao: ResultadoPreco | null;
  club: OfertaClub | null;
  avisos: string[];
}

export async function montarSacola(): Promise<SacolaMontada> {
  const itens = lerSacola((await cookies()).get(COOKIE_SACOLA)?.value);
  // Uma busca por peça, mesmo com os dois tamanhos na sacola
  const slugs = [...new Set(itens.map((i) => i.slug))];
  const [buscados, club] = await Promise.all([
    Promise.all(slugs.map((slug) => buscarCatalogo<ProdutoDetalhe>(`v1/catalog/products/${slug}`))),
    buscarOfertaClub(),
  ]);
  const porSlug = new Map(slugs.map((slug, i) => [slug, buscados[i] ?? null]));
  const produtos = itens.map((i) => porSlug.get(i.slug) ?? null);

  // Peça que saiu da vitrine, tamanho que saiu da venda ou esgotou sai da conta; com menos
  // estoque, a quantidade baixa.
  const avisos: string[] = [];
  const validos: SacolaMontada["validos"] = [];
  itens.forEach((item, i) => {
    const p = produtos[i];
    if (!p) return void avisos.push("Uma peça da sua sacola não está mais na loja e foi deixada de fora.");
    const t = p.tamanhos.find((x) => x.tamanho === item.tamanho);
    if (!t) return void avisos.push(`${p.nome} não está mais à venda nesse tamanho e ficou fora da conta.`);
    const nome = `${p.nome} (${t.rotulo})`;
    const qtd = Math.min(item.qtd, t.disponivel);
    if (qtd < item.qtd) avisos.push(qtd === 0 ? `${nome} esgotou e ficou fora da conta.` : `Só resta ${qtd} de ${nome}.`);
    if (qtd > 0) validos.push({ produto: p, tamanho: t, qtd });
  });

  const pedido = validos.map((v) => ({ produtoId: v.produto.id, varianteId: v.tamanho.id, qtd: v.qtd }));
  const resultado = pedido.length > 0 ? await cotarSacola(pedido, await headers()) : null;
  const cotacao = resultado?.ok ? resultado.cotacao : null;
  if (pedido.length > 0 && !cotacao) avisos.push("Não conseguimos calcular o total agora. Tente de novo em instantes.");

  return { itens, produtos, validos, pedido, cotacao, club, avisos };
}
