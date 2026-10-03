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

/**
 * PUT /v1/admin/whatsapp/respostas/pausa: a pausa do robô e (0570) o horário de atendimento e os
 * minutos até o lembrete. Ao menos um; o início vem antes do fim.
 */
export const pausaRespostasSchema = z
  .object({
    pausaHoras: z.number().int().min(1).max(48).optional(),
    inicioHora: z.number().int().min(0).max(23).optional(),
    fimHora: z.number().int().min(1).max(24).optional(),
    lembreteMinutos: z.number().int().min(5).max(240).optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: "Nada para salvar" })
  .refine((p) => p.inicioHora === undefined || p.fimHora === undefined || p.inicioHora < p.fimHora, { message: "O início vem antes do fim" });

// ─── Painel de WhatsApp (0570) ──────────────────────────────────────────────────────

/** POST /v1/admin/whatsapp/conversa: o número vai no corpo, fora do endereço e dos registros. */
export const conversaSchema = z.object({ chat: z.string().regex(/^[0-9A-Za-z@._:-]{3,60}$/) }).strict();

/** Filtros do histórico da fila (aba Envios). */
export const FILTROS_ENVIO = ["FILA", "ENVIADA", "FALHOU", "DESCARTADA"] as const;
export type FiltroEnvio = (typeof FILTROS_ENVIO)[number];

// ─── Chamados (0550) ────────────────────────────────────────────────────────────────

export type AcaoChamado = "ASSUMIR" | "RESOLVER";

/**
 * Comando da equipe no WhatsApp, respondendo ao aviso: "assumi 12", "atendendo #12",
 * "resolvido 12", "finalizado 12". O banco confere se veio do número dos avisos.
 */
export function lerComandoChamado(texto: string): { acao: AcaoChamado; numero: number } | null {
  const m = /^(assumi|assumir|assumido|atendendo|resolvido|resolvida|resolver|finalizado|finalizada|finalizar|fechado|fechar|encerrado|encerrar)[\s:]*(?:chamado\s*)?#?\s*(\d{1,9})[.!]*$/
    .exec(normalizarTexto(texto));
  if (!m) return null;
  return { acao: /^(assum|atend)/.test(m[1]!) ? "ASSUMIR" : "RESOLVER", numero: Number(m[2]) };
}

/** A nota do atendimento: "5", "nota 4", "3 estrelas", "⭐⭐⭐⭐⭐". */
export function lerNota(texto: string): number | null {
  const estrelas = [...texto.trim()].filter((c) => c === "⭐").length;
  if (estrelas >= 1 && estrelas <= 5 && texto.replace(/⭐|\s|️/g, "") === "") return estrelas;
  const m = /^(?:nota\s*)?([1-5])(?:\s*(?:estrelas?|de 5|\/5))?[.!]*$/.exec(normalizarTexto(texto));
  return m ? Number(m[1]) : null;
}

/** Palavras de cumprimento, agradecimento e confirmação: sozinhas, não são uma dúvida. */
const SEM_DUVIDA = new Set([
  "oi", "ola", "oie", "opa", "eai", "e", "ai", "bom", "boa", "dia", "tarde", "noite", "tudo", "bem", "td", "bom", "blz", "beleza",
  "ok", "okay", "certo", "ta", "sim", "nao", "obrigada", "obrigado", "obg", "brigada", "valeu", "vlw", "show", "top", "otimo", "otima",
  "perfeito", "perfeita", "entendi", "combinado", "tchau", "ate", "mais", "logo", "amei", "lindo", "linda", "kkk", "kkkk", "rs", "haha",
  "voce", "vc", "voces", "vcs", "e", "como", "vai",
]);

/**
 * Mensagem que a Clubinha não sabe responder e que parece pedir uma pessoa: tem pergunta, ou
 * duas palavras ou mais que não são só cumprimento ou agradecimento. "Obrigada!", "ok" e
 * "bom dia" não abrem chamado.
 */
export function precisaDeAtendimento(texto: string): boolean {
  const palavras = normalizarTexto(texto).replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);
  if (palavras.length === 0 || palavras.every((p) => SEM_DUVIDA.has(p))) return false;
  return texto.includes("?") || palavras.length >= 2;
}
