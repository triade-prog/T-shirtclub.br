// "Pronta para publicar?" do cadastro da peça (V5.1): o que falta e o que se recomenda antes de
// a peça ir para a loja. Só a capa bloqueia no servidor (TS: sem foto não publica); o resto
// avisa, sem impedir.
import type { Foto } from "./tiposCatalogo";

export type SituacaoItem = "OK" | "FALTA" | "SUGESTAO";
export interface ItemPublicacao { chave: string; situacao: SituacaoItem; texto: string }

export interface EstadoPeca {
  /** A peça ainda não foi criada: as fotos e o estoque vêm depois do primeiro salvamento. */
  nova: boolean;
  dadosValidos: boolean;
  ativa: boolean;
  fotos: Pick<Foto, "tipo">[];
  descricao: string;
  /** Os tamanhos ativos (0370), com as medidas preenchidas ou não. */
  tamanhos: { nome: string; comMedidas: boolean }[];
  disponivel: number;
  colecaoAtiva: boolean;
  /** Oferta do Club, quando a peça participa ("3 por R$ 119,99"); null fora dele; undefined sem promoção do Club. */
  club: string | null | undefined;
}

const TIPOS_SUGERIDOS: readonly (readonly [string, string])[] = [["FRENTE", "frente"], ["COSTAS", "costas"], ["DETALHE", "detalhe"], ["VESTIDA", "vestida"]];

export function itensPublicacao(e: EstadoPeca): ItemPublicacao[] {
  const itens: ItemPublicacao[] = [];
  itens.push(e.dadosValidos
    ? { chave: "dados", situacao: "OK", texto: "Nome, código, endereço e preço preenchidos." }
    : { chave: "dados", situacao: "FALTA", texto: "Preencha nome, código, endereço e preço." });
  if (!e.ativa) itens.push({ chave: "ativa", situacao: "FALTA", texto: "A peça está inativa: marque “Peça ativa” para ela aparecer." });
  itens.push(e.tamanhos.length > 0
    ? { chave: "tamanhos", situacao: "OK", texto: `À venda em ${juntar(e.tamanhos.map((t) => t.nome))}.` }
    : { chave: "tamanhos", situacao: "FALTA", texto: "Ative pelo menos um tamanho." });

  if (e.nova) {
    itens.push({ chave: "capa", situacao: "FALTA", texto: "Salve o rascunho para acrescentar as fotos." });
  } else if (e.fotos.length === 0) {
    itens.push({ chave: "capa", situacao: "FALTA", texto: "Acrescente pelo menos a foto de capa." });
  } else {
    itens.push({ chave: "capa", situacao: "OK", texto: e.fotos.length === 1 ? "Foto de capa." : `Capa e mais ${e.fotos.length - 1} ${e.fotos.length === 2 ? "foto" : "fotos"}.` });
    const faltam = TIPOS_SUGERIDOS.filter(([t]) => !e.fotos.some((f) => f.tipo === t)).map(([, rotulo]) => rotulo);
    if (faltam.length > 0) itens.push({ chave: "angulos", situacao: "SUGESTAO", texto: `Vale acrescentar: ${juntar(faltam)}.` });
  }

  if (!e.descricao.trim()) itens.push({ chave: "descricao", situacao: "SUGESTAO", texto: "Escreva a descrição da peça." });
  const semMedidas = e.tamanhos.filter((t) => !t.comMedidas).map((t) => t.nome);
  if (semMedidas.length > 0) itens.push({ chave: "medidas", situacao: "SUGESTAO", texto: `Confirme as medidas do ${juntar(semMedidas)} antes de publicar.` });
  if (!e.nova) {
    itens.push(e.disponivel > 0
      ? { chave: "estoque", situacao: "OK", texto: `${e.disponivel} ${e.disponivel === 1 ? "peça disponível" : "peças disponíveis"}.` }
      : { chave: "estoque", situacao: "SUGESTAO", texto: "Sem estoque: a peça aparece como esgotada. Ajuste no quadro Estoque." });
  }
  if (!e.colecaoAtiva) itens.push({ chave: "colecao", situacao: "SUGESTAO", texto: "A coleção está inativa: a peça só aparece quando a coleção for ativada." });
  if (e.club) itens.push({ chave: "club", situacao: "OK", texto: `Participa do Club: ${e.club}.` });
  else if (e.club === null) itens.push({ chave: "club", situacao: "SUGESTAO", texto: "Fora do Club." });
  return itens;
}

export const podePublicar = (itens: ItemPublicacao[]) => itens.every((i) => i.situacao !== "FALTA");

function juntar(partes: string[]): string {
  return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}
