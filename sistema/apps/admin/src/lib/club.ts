// A peça no Club (cadastro V5.1): a promoção "compre e economize" com preço por grupo
// ("3 por R$ 119,99", D19). Sem tabela nova: a caixa "Participa do Club" regrava a lista de peças
// da promoção pela mesma rota da tela de Promoções (PUT /v1/admin/promotions/:id).
import { formatarReais } from "@tshirtclub/domain";
import type { Promocao } from "./tiposCatalogo";

/** A promoção do Club que vale agora; sem ela, a próxima agendada. */
export function promocaoDoClub(promocoes: Promocao[]): Promocao | null {
  const club = promocoes.filter((p) => p.tipo === "COMPRE_MAIS" && p.modo === "PRECO_POR_GRUPO" && p.grupo && p.situacao !== "ENCERRADA");
  return club.find((p) => p.situacao === "ATIVA")
    ?? club.filter((p) => p.situacao === "AGENDADA").sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))[0]
    ?? null;
}

export function pecasDoClub(p: Promocao): string[] {
  return Array.isArray(p.produtos) ? p.produtos : Object.keys(p.produtos);
}

export function participaDoClub(p: Promocao, produtoId: string): boolean {
  return p.escopo !== "ESPECIFICOS" || pecasDoClub(p).includes(produtoId);
}

/** "3 por R$ 119,99" */
export function textoOfertaClub(p: Promocao): string {
  return p.grupo ? `${p.grupo.qtd} por ${formatarReais(p.grupo.precoCentavos)}` : p.nome;
}

/**
 * Corpo do PUT que põe ou tira a peça da promoção do Club (só com "peças escolhidas"), igual ao
 * que a tela de Promoções manda. null: tirar a última peça deixaria a promoção sem nenhuma.
 */
export function corpoClubComPeca(p: Promocao, produtoId: string, participa: boolean): Record<string, unknown> | null {
  const atuais = pecasDoClub(p).filter((id) => id !== produtoId);
  const ids = participa ? [...atuais, produtoId] : atuais;
  if (ids.length === 0) return null;
  return {
    tipo: "COMPRE_MAIS", nome: p.nome, inicio: p.inicio, fim: p.fim,
    escopo: "ESPECIFICOS", produtos: ids.map((id) => ({ produtoId: id })),
    modo: "PRECO_POR_GRUPO", grupo: p.grupo, niveis: [],
    umaPorCliente: p.umaPorCliente ?? false, orcamentoCentavos: p.orcamento?.totalCentavos ?? null,
  };
}
