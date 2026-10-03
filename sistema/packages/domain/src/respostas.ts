// Atendimento automático no WhatsApp (0540): respostas rápidas que a loja escreve no painel,
// disparadas por palavras no meio da frase ou pelo número do menu. Aqui fica a leitura do que a
// cliente escreveu e as regras das palavras; o banco decide a pausa e a repetição.

import { z } from "zod";
import { normalizarTexto } from "./mensagens.ts";

/** TEXTO: o texto do painel. As outras são ações do robô; EQUIPE também tem texto. */
export const ACOES_RESPOSTA = ["TEXTO", "MINHA_RESERVA", "OFERTAS", "TROCAS", "EQUIPE"] as const;
export type AcaoResposta = (typeof ACOES_RESPOSTA)[number];

/** Uma opção ativa, como o webhook recebe do banco (inbound_context). */
export interface RespostaRapida {
  id: string;
  numero: number;
  acao: AcaoResposta;
  titulo: string;
  palavras: string[];
  texto: string | null;
}

/** O menu vai de 1 a 9; a lista, até 20 (desligadas inclusive). */
export const MAX_RESPOSTAS_ATIVAS = 9;
export const MAX_RESPOSTAS = 20;

/** Palavra como o banco guarda: minúsculas, sem acento e sem pontuação. */
export function normalizarPalavra(palavra: string): string {
  return normalizarTexto(palavra).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** 2 a 40 letras ou números, em até 4 palavras (quick_reply_keywords_ok). */
export const PALAVRA_VALIDA = /^(?=.{2,40}$)[a-z0-9]+( [a-z0-9]+){0,3}$/;

/** "menu", "opções", "início" ou "voltar", sozinhas: o menu de novo, a qualquer hora. */
export function ehPedidoMenu(texto: string): boolean {
  return /^(menu|opcoes|inicio|voltar)[.!?]*$/.test(normalizarTexto(texto));
}

/** O número do menu: "3", "3.", "opção 3", "3️⃣". Só o número, sozinho na mensagem. */
export function lerOpcaoDoMenu(texto: string): number | null {
  const t = normalizarTexto(texto.replace(/️?⃣/g, ""));
  const m = /^(?:opcao|op|numero|n)?\s*([1-9])\s*[.)!]?$/.exec(t);
  return m ? Number(m[1]) : null;
}

/**
 * A primeira resposta, na ordem do menu, com uma palavra que aparece inteira na mensagem
 * ("frete" acha "qual o frete?" mas não "fretes"; "onde fica" acha "onde fica a loja?").
 * Trocas tem as palavras fixas (ehPedidoTroca) e fica de fora.
 */
export function respostaPorPalavra(texto: string, respostas: readonly RespostaRapida[]): RespostaRapida | null {
  const t = ` ${normalizarPalavra(texto)} `;
  if (t.trim() === "") return null;
  return respostas.find((r) => r.acao !== "TROCAS" && r.palavras.some((p) => p && t.includes(` ${p} `))) ?? null;
}

/** Na resposta: {site}, {endereco} e {horario} viram o site e o endereço e o horário da retirada. */
export function preencherResposta(texto: string, loja: { site: string; endereco?: string | null; horario?: string | null }): string {
  return texto
    .replaceAll("{site}", loja.site)
    .replaceAll("{endereco}", loja.endereco || "Pergunte aqui o endereço da loja.")
    .replaceAll("{horario}", loja.horario || "Pergunte aqui o horário.");
}

const palavrasSchema = z
  .array(z.string().max(60))
  .max(30)
  .transform((ps) => [...new Set(ps.map(normalizarPalavra).filter(Boolean))])
  .refine((ps) => ps.length <= 15 && ps.every((p) => PALAVRA_VALIDA.test(p)), "VALIDATION_ERROR");

/** POST e PUT /v1/admin/whatsapp/respostas: o texto só vale para TEXTO e EQUIPE (o banco confere). */
export const respostaRapidaSchema = z.object({
  titulo: z.string().trim().min(2).max(40),
  palavras: palavrasSchema,
  texto: z.string().trim().min(2).max(1000).optional(),
  ativa: z.boolean().optional(),
});

/** PUT /v1/admin/whatsapp/respostas/ordem */
export const ordemRespostasSchema = z.object({ ids: z.array(z.uuid()).min(1).max(MAX_RESPOSTAS) });

/** PUT /v1/admin/whatsapp/respostas/pausa */
export const pausaRespostasSchema = z.object({ pausaHoras: z.number().int().min(1).max(48) });
