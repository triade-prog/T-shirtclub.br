// Motor de preço (seção 05b, regra 28 da especificação). TypeScript puro, sem I/O: a loja
// usa para a prévia da sacola e a Edge Function para o valor que vale. Regra P6: vale só a
// promoção mais vantajosa para a cliente, sem somar descontos.
//
// Todos os valores em centavos. O arredondamento é meio para cima, por peça; quando um
// desconto é repartido entre peças, a repartição é proporcional ao preço e a última peça
// absorve o centavo que sobrar. A soma dos descontos das linhas é sempre o desconto total.

import { formatarReais } from "./dinheiro.ts";

export interface ProdutoPreco {
  id: string;
  precoCentavos: number;
}

export interface LinhaEntrada {
  produto: ProdutoPreco;
  qtd: number;
}

export interface Periodo {
  inicio: Date;
  fim: Date;
  /** Encerrada antes do fim pelo painel. */
  encerradaEm?: Date | null;
}

export interface Orcamento {
  totalCentavos: number;
  usadoCentavos: number;
}

interface PromocaoBase extends Periodo {
  id: string;
  nome: string;
}

export interface DescontoProduto extends PromocaoBase {
  tipo: "DESCONTO_PRODUTO";
  produtos: Record<string, { modo: "PERCENTUAL" | "PRECO_FIXO"; valor: number }>;
}

interface CompreMaisBase extends PromocaoBase {
  tipo: "COMPRE_MAIS";
  escopo: "TODOS" | "ESPECIFICOS";
  produtos: readonly string[];
  umaPorCliente: boolean;
  orcamento?: Orcamento | null;
}

export interface CompreMaisNiveis extends CompreMaisBase {
  modo: "NIVEIS";
  /** Até 3 níveis, com quantidade e porcentagem crescentes. */
  niveis: readonly { qtdMin: number; pct: number }[];
}

export interface CompreMaisGrupo extends CompreMaisBase {
  modo: "PRECO_POR_GRUPO";
  grupo: { qtd: number; precoCentavos: number };
}

export interface Cupom extends PromocaoBase {
  tipo: "CUPOM";
  escopo: "TODOS" | "ESPECIFICOS";
  produtos: readonly string[];
  codigo: string;
  modo: "VALOR" | "PERCENTUAL";
  valor: number;
  descontoMaximoCentavos?: number | null;
  gastoMinimoCentavos?: number | null;
  quantidadeTotal: number;
  quantidadeUsada: number;
  limitePorCliente: number;
  validadeDias: number;
}

export type Promocao = DescontoProduto | CompreMaisNiveis | CompreMaisGrupo | Cupom;

export type SituacaoPromocao = "AGENDADA" | "ATIVA" | "ENCERRADA";

/** Mesma regra de promotion_state() no banco. */
export function situacaoPromocao(p: Periodo, agora: Date): SituacaoPromocao {
  const fim = Math.min(p.fim.getTime(), (p.encerradaEm ?? p.fim).getTime());
  if (agora.getTime() >= fim) return "ENCERRADA";
  if (agora.getTime() < p.inicio.getTime()) return "AGENDADA";
  return "ATIVA";
}

/** O que se sabe da cliente. Na prévia da sacola ainda não há telefone: nada é conferido. */
export interface Cliente {
  /** Usos PRESO + USADO deste cupom pelo telefone. */
  usosDoCupom?: number;
  /** Primeiro uso do cupom pelo telefone (a validade em dias conta a partir dele). */
  primeiroUsoDoCupom?: Date | null;
  /** Promoções "uma por cliente" que o telefone já usou. */
  promocoesUsadas?: ReadonlySet<string>;
}

export interface EntradaPreco {
  itens: readonly LinhaEntrada[];
  promocoes: readonly Promocao[];
  agora: Date;
  codigoCupom?: string | null;
  cliente?: Cliente;
}

export type MotivoCupom =
  | "NAO_ENCONTRADO"
  | "AGENDADO"
  | "ENCERRADO"
  | "ESGOTADO"
  | "GASTO_MINIMO"
  | "SEM_PRODUTOS"
  | "LIMITE_CLIENTE"
  | "VENCIDO";

export type SituacaoCupom =
  | { codigo: string; situacao: "APLICADO" }
  | { codigo: string; situacao: "NAO_E_O_MELHOR" }
  | { codigo: string; situacao: "INVALIDO"; motivo: MotivoCupom; inicio?: Date; gastoMinimoCentavos?: number };

export interface LinhaResultado {
  produtoId: string;
  qtd: number;
  precoTabelaCentavos: number;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
}

export interface Aplicada {
  promocaoId: string;
  tipo: Promocao["tipo"];
  rotulo: string;
  descontoCentavos: number;
}

export interface ResultadoPreco {
  linhas: LinhaResultado[];
  pecas: number;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  /** null quando nenhuma promoção dá desconto. */
  aplicada: Aplicada | null;
  cupom: SituacaoCupom | null;
  /** Para a sacola: "Falta 1 peça para o seu Club sair por R$ 119,99". */
  proximoGrupo: { faltam: number; qtd: number; precoCentavos: number; promocaoId: string } | null;
}

// Uma peça por posição, na ordem das linhas, para repartir descontos por peça.
interface Peca {
  linha: number;
  preco: number;
}

interface Candidata {
  promocao: Promocao;
  rotulo: string;
  /** Desconto de cada peça, na mesma ordem de `pecas`. */
  porPeca: number[];
}

function pct(valor: number, porcentagem: number): number {
  return Math.round((valor * porcentagem) / 100);
}

/** Reparte `total` entre as peças, proporcional ao preço; a última absorve o centavo. */
function repartir(total: number, precos: readonly number[]): number[] {
  const soma = precos.reduce((a, v) => a + v, 0);
  if (soma === 0 || total === 0) return precos.map(() => 0);
  let usado = 0;
  return precos.map((p, i) => {
    if (i === precos.length - 1) return total - usado;
    const parte = Math.floor((total * p) / soma);
    usado += parte;
    return parte;
  });
}

function soma(v: readonly number[]): number {
  return v.reduce((a, x) => a + x, 0);
}

function cobre(p: { escopo: "TODOS" | "ESPECIFICOS"; produtos: readonly string[] }, produtoId: string): boolean {
  return p.escopo === "TODOS" || p.produtos.includes(produtoId);
}

// Todos os descontos do produto ativos formam uma candidata só ("preço promocional"): o
// banco garante que um produto não está em dois ao mesmo tempo, e a vitrine mostra esse
// preço em cada produto.
function candidataPrecoPromocional(promos: readonly DescontoProduto[], pecas: readonly Peca[], ids: readonly string[]): Candidata | null {
  if (promos.length === 0) return null;
  const porPeca = pecas.map((peca) => {
    const produtoId = ids[peca.linha]!;
    const d = promos.find((p) => p.produtos[produtoId])?.produtos[produtoId];
    if (!d) return 0;
    const desconto = d.modo === "PERCENTUAL" ? pct(peca.preco, d.valor) : peca.preco - d.valor;
    return Math.min(Math.max(desconto, 0), peca.preco);
  });
  if (soma(porPeca) === 0) return null;
  const usadas = promos.filter((p) => ids.some((id) => p.produtos[id]));
  return { promocao: usadas[0]!, rotulo: usadas.length === 1 ? usadas[0]!.nome : "Preço promocional", porPeca };
}

function candidataCompreMais(p: CompreMaisNiveis | CompreMaisGrupo, pecas: readonly Peca[], ids: readonly string[], cliente?: Cliente): Candidata | null {
  if (p.umaPorCliente && cliente?.promocoesUsadas?.has(p.id)) return null;
  const participa = pecas.map((peca) => cobre(p, ids[peca.linha]!));
  const n = participa.filter(Boolean).length;
  const porPeca = pecas.map(() => 0);
  let rotulo: string;

  if (p.modo === "NIVEIS") {
    const nivel = [...p.niveis].sort((a, b) => b.qtdMin - a.qtdMin).find((x) => n >= x.qtdMin);
    if (!nivel) return null;
    pecas.forEach((peca, i) => {
      if (participa[i]) porPeca[i] = pct(peca.preco, nivel.pct);
    });
    rotulo = `${p.nome} (${n} peças, ${nivel.pct}%)`;
  } else {
    // Peças participantes da mais cara para a mais barata; cada grupo completo custa o preço do grupo.
    const ordem = pecas.map((_, i) => i).filter((i) => participa[i]).sort((a, b) => pecas[b]!.preco - pecas[a]!.preco || a - b);
    const grupos = Math.floor(ordem.length / p.grupo.qtd);
    let gruposQueEconomizam = 0;
    for (let g = 0; g < grupos; g++) {
      const idx = ordem.slice(g * p.grupo.qtd, (g + 1) * p.grupo.qtd);
      const precos = idx.map((i) => pecas[i]!.preco);
      const desconto = soma(precos) - p.grupo.precoCentavos;
      if (desconto <= 0) continue; // grupo que não economiza não conta
      gruposQueEconomizam++;
      repartir(desconto, precos).forEach((d, k) => (porPeca[idx[k]!] = d));
    }
    if (gruposQueEconomizam === 0) return null;
    rotulo = `${p.nome} (${gruposQueEconomizam > 1 ? `${gruposQueEconomizam}× ` : ""}${p.grupo.qtd} por ${formatarReais(p.grupo.precoCentavos)})`;
  }

  if (p.orcamento && p.orcamento.usadoCentavos + soma(porPeca) > p.orcamento.totalCentavos) return null; // orçamento esgotado
  return soma(porPeca) > 0 ? { promocao: p, rotulo, porPeca } : null;
}

type AvaliacaoCupom = { ok: true; candidata: Candidata | null } | { ok: false; situacao: SituacaoCupom };

function avaliarCupom(codigo: string, promos: readonly Promocao[], pecas: readonly Peca[], ids: readonly string[], subtotal: number, agora: Date, cliente?: Cliente): AvaliacaoCupom {
  const invalido = (motivo: MotivoCupom, extra: Partial<Extract<SituacaoCupom, { situacao: "INVALIDO" }>> = {}): AvaliacaoCupom =>
    ({ ok: false, situacao: { codigo, situacao: "INVALIDO", motivo, ...extra } });

  const c = promos.find((p): p is Cupom => p.tipo === "CUPOM" && p.codigo === codigo);
  if (!c) return invalido("NAO_ENCONTRADO");
  const situacao = situacaoPromocao(c, agora);
  if (situacao === "AGENDADA") return invalido("AGENDADO", { inicio: c.inicio });
  if (situacao === "ENCERRADA") return invalido("ENCERRADO");
  if (c.quantidadeUsada >= c.quantidadeTotal) return invalido("ESGOTADO");
  if (cliente?.usosDoCupom !== undefined && cliente.usosDoCupom >= c.limitePorCliente) return invalido("LIMITE_CLIENTE");
  if (cliente?.primeiroUsoDoCupom && agora.getTime() > cliente.primeiroUsoDoCupom.getTime() + c.validadeDias * 86_400_000) {
    return invalido("VENCIDO");
  }
  if (c.gastoMinimoCentavos && subtotal < c.gastoMinimoCentavos) return invalido("GASTO_MINIMO", { gastoMinimoCentavos: c.gastoMinimoCentavos });

  const participa = pecas.map((peca) => cobre(c, ids[peca.linha]!));
  const precos = pecas.map((peca, i) => (participa[i] ? peca.preco : 0));
  if (soma(precos) === 0) return invalido("SEM_PRODUTOS");

  let porPeca: number[];
  if (c.modo === "VALOR") {
    porPeca = repartir(Math.min(c.valor, soma(precos)), precos);
  } else {
    porPeca = precos.map((p) => pct(p, c.valor));
    if (c.descontoMaximoCentavos && soma(porPeca) > c.descontoMaximoCentavos) porPeca = repartir(c.descontoMaximoCentavos, precos);
  }
  return { ok: true, candidata: { promocao: c, rotulo: `Cupom ${c.codigo}`, porPeca } };
}

function proximoGrupo(promos: readonly Promocao[], itens: readonly LinhaEntrada[]): ResultadoPreco["proximoGrupo"] {
  const p = promos.find((x): x is CompreMaisGrupo => x.tipo === "COMPRE_MAIS" && x.modo === "PRECO_POR_GRUPO");
  if (!p) return null;
  const n = itens.filter((l) => cobre(p, l.produto.id)).reduce((a, l) => a + l.qtd, 0);
  const resto = n % p.grupo.qtd;
  return { faltam: p.grupo.qtd - resto, qtd: p.grupo.qtd, precoCentavos: p.grupo.precoCentavos, promocaoId: p.id };
}

export function calcularPreco(entrada: EntradaPreco): ResultadoPreco {
  const itens = entrada.itens.filter((l) => l.qtd > 0);
  for (const l of itens) {
    if (!Number.isInteger(l.qtd) || !Number.isInteger(l.produto.precoCentavos) || l.produto.precoCentavos < 0) {
      throw new Error("Quantidade e preço precisam ser inteiros");
    }
  }
  const ids = itens.map((l) => l.produto.id);
  const pecas: Peca[] = itens.flatMap((l, linha) => Array.from({ length: l.qtd }, () => ({ linha, preco: l.produto.precoCentavos })));
  const subtotal = soma(pecas.map((p) => p.preco));
  const ativas = entrada.promocoes.filter((p) => situacaoPromocao(p, entrada.agora) === "ATIVA");

  const candidatas: Candidata[] = [];
  const precoPromocional = candidataPrecoPromocional(ativas.filter((p): p is DescontoProduto => p.tipo === "DESCONTO_PRODUTO"), pecas, ids);
  if (precoPromocional) candidatas.push(precoPromocional);
  for (const p of ativas) {
    if (p.tipo !== "COMPRE_MAIS") continue;
    const c = candidataCompreMais(p, pecas, ids, entrada.cliente);
    if (c) candidatas.push(c);
  }

  let cupom: SituacaoCupom | null = null;
  const codigo = entrada.codigoCupom?.trim().toUpperCase() ?? "";
  if (codigo) {
    // O cupom é procurado entre todas as promoções, para dizer se está agendado ou encerrado.
    const r = avaliarCupom(codigo, entrada.promocoes, pecas, ids, subtotal, entrada.agora, entrada.cliente);
    if (!r.ok) cupom = r.situacao;
    else if (r.candidata) candidatas.push(r.candidata);
  }

  // Menor total vence; no empate, fica a que não gasta o cupom.
  let melhor: Candidata | null = null;
  for (const c of candidatas) {
    if (!melhor) {
      melhor = c;
      continue;
    }
    const d = soma(c.porPeca), dm = soma(melhor.porPeca);
    if (d > dm || (d === dm && melhor.promocao.tipo === "CUPOM" && c.promocao.tipo !== "CUPOM")) melhor = c;
  }

  if (codigo && !cupom) {
    cupom = melhor?.promocao.tipo === "CUPOM" ? { codigo, situacao: "APLICADO" } : { codigo, situacao: "NAO_E_O_MELHOR" };
  }

  const porPeca = melhor ? melhor.porPeca.map((d, i) => Math.min(Math.max(d, 0), pecas[i]!.preco)) : pecas.map(() => 0);
  const linhas: LinhaResultado[] = itens.map((l, linha) => {
    const descontoCentavos = soma(porPeca.filter((_, i) => pecas[i]!.linha === linha));
    const subtotalCentavos = l.produto.precoCentavos * l.qtd;
    return { produtoId: l.produto.id, qtd: l.qtd, precoTabelaCentavos: l.produto.precoCentavos, subtotalCentavos, descontoCentavos, totalCentavos: subtotalCentavos - descontoCentavos };
  });
  const desconto = soma(porPeca);

  return {
    linhas,
    pecas: pecas.length,
    subtotalCentavos: subtotal,
    descontoCentavos: desconto,
    totalCentavos: subtotal - desconto,
    aplicada: melhor && desconto > 0
      ? { promocaoId: melhor.promocao.id, tipo: melhor.promocao.tipo, rotulo: melhor.rotulo, descontoCentavos: desconto }
      : null,
    cupom,
    proximoGrupo: proximoGrupo(ativas, itens),
  };
}

/** Preço promocional de um produto na vitrine (desconto do produto ativo), ou null. */
export function precoPromocional(produto: ProdutoPreco, promocoes: readonly Promocao[], agora: Date): { precoCentavos: number; promocaoId: string } | null {
  const p = promocoes.find((x): x is DescontoProduto =>
    x.tipo === "DESCONTO_PRODUTO" && Boolean(x.produtos[produto.id]) && situacaoPromocao(x, agora) === "ATIVA");
  const d = p?.produtos[produto.id];
  if (!p || !d) return null;
  const preco = d.modo === "PERCENTUAL" ? produto.precoCentavos - pct(produto.precoCentavos, d.valor) : d.valor;
  return preco < produto.precoCentavos ? { precoCentavos: Math.max(preco, 0), promocaoId: p.id } : null;
}
