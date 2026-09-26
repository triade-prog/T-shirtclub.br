// Mensagens do WhatsApp (seção 10, textos aprovados na D4) e leitura do que a cliente
// escreve. As essenciais têm 2 versões, sorteadas, para o texto não sair sempre igual (G5).
// Só o primeiro nome; o link é sempre do domínio da loja. *negrito* é a marcação do WhatsApp.

import { formatarReais } from "./dinheiro.ts";

const FUSO = "America/Bahia";
/** Endereço da loja nas mensagens sem link de reserva (E10 ainda decide .pt ou .com.br). */
const SITE = "tshirtclub.pt";
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** 14:32, no horário da loja. */
export function formatarHora(data: Date): string {
  return hora.format(data);
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/** Minúsculas, sem acento e sem espaço repetido. */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ─── O que a cliente escreve ─────────────────────────────────────────────────────────

export type FinalidadeCodigo = "RESERVA" | "CONSULTA";

const TEXTO_PEDIDO: Record<FinalidadeCodigo, string> = {
  RESERVA: "Quero meu código da reserva",
  CONSULTA: "Quero consultar minhas reservas",
};

/** Texto pronto que o site coloca no link do WhatsApp. */
export function textoPedidoCodigo(ref: string, finalidade: FinalidadeCodigo = "RESERVA"): string {
  return `${TEXTO_PEDIDO[finalidade]} (ref. ${ref})`;
}

/** https://wa.me/5577998155772?text=… */
export function linkWhatsApp(numeroLoja: string, texto: string): string {
  return `https://wa.me/${numeroLoja.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

/** Referência do pedido de código ("ref. K7Q2"), ou null. Aceita a cliente mexer no texto. */
export function lerPedidoDeCodigo(texto: string): { ref: string; finalidade: FinalidadeCodigo } | null {
  const t = normalizarTexto(texto);
  const m = /\bref\.?\s*:?\s*([2-9a-hj-np-z]{4})\b/.exec(t);
  if (!m) return null;
  return { ref: m[1]!.toUpperCase(), finalidade: t.includes("consultar") ? "CONSULTA" : "RESERVA" };
}

/** "minha reserva", "minhas reservas" ou "status" (seção 07). */
export function ehPedidoMinhaReserva(texto: string): boolean {
  return /^(minha reserva|minhas reservas|status)[.!?]*$/.test(normalizarTexto(texto));
}

/**
 * O remetente do WhatsApp (só dígitos) nas formas E.164 com e sem o nono dígito (R17).
 * Vazio quando não é um telefone (identificador LID, G4).
 */
export function candidatosDoRemetente(remetente: string | null | undefined): string[] {
  const d = (remetente ?? "").replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(d) || (remetente ?? "").includes("@")) return [];
  const formas = new Set([`+${d}`]);
  if (d.startsWith("55") && d.length === 12) formas.add(`+${d.slice(0, 4)}9${d.slice(4)}`);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") formas.add(`+${d.slice(0, 4)}${d.slice(5)}`);
  return [...formas];
}

// ─── O que a loja manda ──────────────────────────────────────────────────────────────

export interface ParametrosMensagem {
  codigo_verificacao: { codigo: string; minutos: number };
  numero_diferente: Record<string, never>;
  sem_numero: Record<string, never>;
  referencia_invalida: Record<string, never>;
  codigo_bloqueado: { ate: Date };
  reserva_criada: { nome: string; pecas: number; numero: number; totalCentavos: number; expiraEm: Date; link: string };
  reserva_lembrete_5min: { numero: number; expiraEm: Date };
  reserva_expirada: { numero: number; expiradaEm: Date };
  telefone_bloqueado: Record<string, never>;
  telefone_liberado: Record<string, never>;
  bloqueio_mantido: Record<string, never>;
}

export type Modelo = keyof ParametrosMensagem;

type Versoes<M extends Modelo> = ((p: ParametrosMensagem[M]) => string)[];

const MODELOS: { [M in Modelo]: Versoes<M> } = {
  codigo_verificacao: [
    (p) => `Seu código da T-shirt Club.br é *${p.codigo}*. Vale por ${p.minutos} minutos. Não passe para ninguém.`,
    (p) => `Código de confirmação: *${p.codigo}*. Digite no site para garantir suas peças. Ele vence em ${p.minutos} minutos.`,
  ],
  numero_diferente: [() => "Este número não é o da reserva. Envie a mensagem pelo WhatsApp que você informou no site."],
  sem_numero: [() => "Não conseguimos confirmar o seu número por aqui. Envie a mensagem pelo WhatsApp que você informou no site."],
  referencia_invalida: [
    () => "Não achamos esse pedido de código. Volte ao site e toque em \"Receber código no WhatsApp\" de novo.",
  ],
  codigo_bloqueado: [
    (p) => `Muitas tentativas com este número. Você pode pedir um código de novo às *${formatarHora(p.ate)}*.`,
  ],
  reserva_criada: [
    (p) =>
      `Oi, ${primeiroNome(p.nome)}! ${p.pecas === 1 ? "Sua peça está guardada" : `Suas ${p.pecas} peças estão guardadas`} até *${formatarHora(p.expiraEm)}* (reserva #${p.numero}, ${formatarReais(p.totalCentavos)}). Pague por aqui: ${p.link} 💖`,
    (p) =>
      `Reserva #${p.numero} feita, ${primeiroNome(p.nome)}! Guardamos ${p.pecas === 1 ? "sua peça" : "suas peças"} até *${formatarHora(p.expiraEm)}*. Total ${formatarReais(p.totalCentavos)}. Para pagar: ${p.link}`,
  ],
  reserva_lembrete_5min: [
    (p) => `Faltam 5 minutos: a reserva #${p.numero} fica guardada até *${formatarHora(p.expiraEm)}*. Se já pagou, pode ignorar.`,
    (p) => `Lembrete: suas peças da reserva #${p.numero} ficam separadas só até *${formatarHora(p.expiraEm)}*.`,
  ],
  reserva_expirada: [
    (p) =>
      `A reserva #${p.numero} terminou às ${formatarHora(p.expiradaEm)} sem pagamento, e as peças voltaram para a loja. Se ainda quiser, é só reservar de novo: ${SITE}`,
    (p) => `O prazo da reserva #${p.numero} acabou e nada foi cobrado. As peças voltaram para a loja: ${SITE}`,
  ],
  telefone_bloqueado: [
    () => "Suas reservas estão pausadas porque 3 terminaram sem pagamento em 30 dias. Se quiser, fale com a gente por aqui.",
  ],
  telefone_liberado: [() => "Tudo certo: você já pode fazer reservas de novo na T-shirt Club.br."],
  bloqueio_mantido: [
    () => "Analisamos seu caso e as reservas seguem pausadas por enquanto. Fale com a gente por aqui se precisar.",
  ],
};

/** Texto da mensagem; `sorteio` escolhe a versão (0 a 1). */
export function mensagemWhatsApp<M extends Modelo>(modelo: M, parametros: ParametrosMensagem[M], sorteio: number = Math.random()): string {
  const versoes = MODELOS[modelo] as Versoes<M>;
  const i = Math.min(versoes.length - 1, Math.floor(Math.max(0, sorteio) * versoes.length));
  return versoes[i]!(parametros);
}
