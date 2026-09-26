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

export type FinalidadeCodigo = "RESERVA" | "CONSULTA" | "ENTREGA";

const TEXTO_PEDIDO: Record<FinalidadeCodigo, string> = {
  RESERVA: "Quero meu código da reserva",
  CONSULTA: "Quero consultar minhas reservas",
  // Pelo link da reserva, antes de confirmar ou mudar a entrega (D13)
  ENTREGA: "Quero confirmar a entrega do pedido",
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
  const finalidade: FinalidadeCodigo = t.includes("consultar") ? "CONSULTA" : t.includes("entrega") ? "ENTREGA" : "RESERVA";
  return { ref: m[1]!.toUpperCase(), finalidade };
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
  // O telefone guardado é sempre o celular com o nono dígito (normalizarTelefone): o WhatsApp
  // às vezes manda sem ele. Um fixo pode coincidir com o celular de outra pessoa; por isso
  // o que o remetente pede sai sempre para o número guardado, nunca para o remetente.
  if (d.startsWith("55") && d.length === 12) return [`+${d.slice(0, 4)}9${d.slice(4)}`];
  return [`+${d}`];
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
  pagamento_confirmado: { nome: string; numero: number; totalCentavos: number; forma: "PIX" | "CARTAO" };
  pagamento_em_analise: { numero: number; frete?: boolean };
  telefone_bloqueado: Record<string, never>;
  telefone_liberado: Record<string, never>;
  bloqueio_mantido: Record<string, never>;
  cancelamento_recebido: { numero: number; expiraEm: Date };
  cancelamento_aprovado: { numero: number };
  cancelamento_recusado: { numero: number; expiraEm: Date };
  entrega_confirmada: { numero: number; modalidade: "RETIRADA" | "MOTOBOY" | "ENVIO" };
  frete_calculado: { numero: number; valorCentavos: number; pagarAte: Date };
  frete_confirmado: { numero: number };
  pronto_retirada: { numero: number; codigo: string; endereco?: string; horario?: string };
  saiu_entrega: { numero: number };
  pedido_enviado: { numero: number; rastreio?: string };
  pedido_entregue: { numero: number };
  minhas_reservas: { reservas: ResumoReserva[] };
  mensagem_teste: Record<string, never>;
}

/** Uma linha da resposta a "Minha reserva" (whatsapp_my_reservations, 0155). */
export interface ResumoReserva {
  numero: number;
  status: "RESERVADO" | "PAGAMENTO_CONFIRMADO" | "ENTREGUE" | "EXPIRADO";
  motivoEncerramento?: "PRAZO_ESGOTADO" | "CANCELAMENTO_APROVADO";
  pecas?: number;
  totalCentavos: number;
  expiraEm?: Date;
  substatus?: string;
  cancelamentoPendente?: boolean;
}

const SUBSTATUS_CLIENTE: Record<string, string> = {
  AGUARDANDO_MODALIDADE: "falta escolher a entrega no site",
  AGUARDANDO_CALCULO_FRETE: "a loja está calculando o frete",
  AGUARDANDO_PAGAMENTO_FRETE: "frete para pagar no site",
  FRETE_VENCIDO: "o prazo do frete venceu; a loja vai falar com você",
  EM_PREPARACAO: "em preparação",
  PRONTO_PARA_RETIRADA: "pronta para retirada",
  SAIU_PARA_ENTREGA: "saiu para entrega",
  ENVIADO: "enviada",
};

function linhaReserva(r: ResumoReserva): string {
  const pecas = r.pecas === undefined ? "" : `${r.pecas} ${r.pecas === 1 ? "peça" : "peças"}, `;
  switch (r.status) {
    case "RESERVADO":
      return `• #${r.numero}: reservada até *${r.expiraEm ? formatarHora(r.expiraEm) : "--:--"}* · ${pecas}${formatarReais(r.totalCentavos)}` +
        (r.cancelamentoPendente ? " · cancelamento pedido" : "");
    case "PAGAMENTO_CONFIRMADO":
      return `• #${r.numero}: paga · ${SUBSTATUS_CLIENTE[r.substatus ?? ""] ?? "em preparação"}`;
    case "ENTREGUE":
      return `• #${r.numero}: entregue`;
    default:
      return `• #${r.numero}: encerrada${r.motivoEncerramento === "CANCELAMENTO_APROVADO" ? " (cancelamento aprovado)" : " sem pagamento"}`;
  }
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
  // A mensagem não leva o link com a chave: o banco guarda só o hash dela (G6). A cliente
  // vê o pedido no site, com a sessão do celular em que pagou ou pela consulta com código.
  pagamento_confirmado: [
    (p) =>
      `Pagamento confirmado! Pedido #${p.numero}, ${formatarReais(p.totalCentavos)} ${p.forma === "PIX" ? "no PIX" : "no cartão"}. Agora escolha como quer receber, no site: ${SITE} ✨`,
    (p) => `Recebemos seu pagamento, ${primeiroNome(p.nome)}! Pedido #${p.numero} garantido. Falta só escolher a entrega, no site: ${SITE}`,
  ],
  pagamento_em_analise: [
    (p) =>
      p.frete
        ? `O pagamento do frete do pedido #${p.numero} chegou depois que a entrega mudou. A loja vai conferir e falar com você por aqui.`
        : `Seu pagamento chegou depois do prazo da reserva #${p.numero}. A loja vai conferir e falar com você por aqui.`,
  ],
  telefone_bloqueado: [
    () => "Suas reservas estão pausadas porque 3 terminaram sem pagamento em 30 dias. Se quiser, fale com a gente por aqui.",
  ],
  telefone_liberado: [() => "Tudo certo: você já pode fazer reservas de novo na T-shirt Club.br."],
  bloqueio_mantido: [
    () => "Analisamos seu caso e as reservas seguem pausadas por enquanto. Fale com a gente por aqui se precisar.",
  ],
  // O pedido não pausa o relógio (regra 12): as mensagens lembram até quando a reserva vale.
  cancelamento_recebido: [
    (p) => `Recebemos seu pedido de cancelamento da reserva #${p.numero}. A loja responde em breve; o prazo continua correndo até *${formatarHora(p.expiraEm)}*.`,
  ],
  cancelamento_aprovado: [(p) => `Cancelamento aprovado: a reserva #${p.numero} foi encerrada e nada foi cobrado.`],
  cancelamento_recusado: [(p) => `A loja manteve a reserva #${p.numero}. Ela segue valendo até *${formatarHora(p.expiraEm)}*.`],
  // Pós-pagamento (regras 17 e 18): sem endereço nem telefone no texto (seção 10).
  entrega_confirmada: [
    (p) =>
      p.modalidade === "RETIRADA"
        ? `Retirada confirmada para o pedido #${p.numero}. Avisamos por aqui quando ele estiver pronto.`
        : `Recebemos o endereço do pedido #${p.numero}. A loja calcula o frete e manda o valor por aqui.`,
  ],
  frete_calculado: [
    (p) => `Frete do pedido #${p.numero}: ${formatarReais(p.valorCentavos)}. Pague até *${formatarHora(p.pagarAte)}* pelo site: ${SITE}`,
  ],
  frete_confirmado: [(p) => `Frete pago! O pedido #${p.numero} já está em preparação.`],
  pronto_retirada: [
    (p) =>
      [
        `O pedido #${p.numero} está pronto para retirada! Código: *${p.codigo}*. Leve também seu nome e este WhatsApp.`,
        p.endereco ? `Endereço: ${p.endereco}.` : "",
        p.horario ? `Horário: ${p.horario}.` : "",
      ].filter(Boolean).join(" "),
  ],
  saiu_entrega: [(p) => `O pedido #${p.numero} saiu para entrega. Tenha alguém para receber.`],
  pedido_enviado: [
    (p) => `O pedido #${p.numero} foi enviado.${p.rastreio ? ` Código de rastreio: *${p.rastreio}*.` : ""}`,
  ],
  pedido_entregue: [(p) => `Pedido #${p.numero} entregue. Obrigada pela compra! Trocas e devoluções são combinadas por aqui. 💖`],
  // Resposta a "Minha reserva" (regra 22): sem código e sem link; detalhes no site.
  minhas_reservas: [
    (p) =>
      p.reservas.length === 0
        ? `Não achamos reservas recentes neste número. Para reservar ou consultar: ${SITE}`
        : [p.reservas.length === 1 ? "Sua reserva:" : "Suas reservas:", ...p.reservas.map(linhaReserva), `Detalhes e pagamento no site: ${SITE}`].join("\n"),
  ],
  mensagem_teste: [() => "Mensagem de teste da T-shirt Club.br: o envio pelo sistema está funcionando."],
};

// ─── Notificações no painel (tela 18, G5) ────────────────────────────────────────────
// As essenciais ficam sempre ligadas; as outras a loja liga e desliga. Cada linha da tela
// pode cobrir mais de um modelo (ex.: aprovado e recusado).

export interface Notificacao {
  id: string;
  nome: string;
  quando: string;
  essencial: boolean;
  modelos: Modelo[];
}

export const NOTIFICACOES: Notificacao[] = [
  { id: "codigo", nome: "Código de verificação", quando: "Quando a cliente pede o código pelo WhatsApp", essencial: true, modelos: ["codigo_verificacao"] },
  { id: "reserva_criada", nome: "Reserva criada", quando: "Ao criar a reserva, com itens, total, horário de expiração e link", essencial: true, modelos: ["reserva_criada"] },
  { id: "lembrete", nome: "Lembrete de 5 minutos", quando: "Quando faltam 5 minutos para expirar", essencial: true, modelos: ["reserva_lembrete_5min"] },
  { id: "pagamento_confirmado", nome: "Pagamento confirmado", quando: "Quando o provedor confirma o pagamento", essencial: true, modelos: ["pagamento_confirmado"] },
  { id: "reserva_expirada", nome: "Reserva expirada", quando: "Quando o prazo termina sem pagamento", essencial: true, modelos: ["reserva_expirada"] },
  { id: "cancelamento_recebido", nome: "Cancelamento recebido", quando: "Quando a cliente pede cancelamento", essencial: false, modelos: ["cancelamento_recebido"] },
  { id: "cancelamento_decisao", nome: "Decisão do cancelamento", quando: "Quando a loja aprova ou recusa", essencial: false, modelos: ["cancelamento_aprovado", "cancelamento_recusado"] },
  { id: "pagamento_em_analise", nome: "Pagamento em análise", quando: "Quando o pagamento chega fora do prazo ou com valor diferente", essencial: false, modelos: ["pagamento_em_analise"] },
  { id: "entrega_confirmada", nome: "Modalidade de entrega confirmada", quando: "Depois que a cliente confirma retirada, motoboy ou envio", essencial: false, modelos: ["entrega_confirmada"] },
  { id: "frete_calculado", nome: "Frete calculado", quando: "Com o valor e o prazo de 2 horas para pagar", essencial: false, modelos: ["frete_calculado"] },
  { id: "frete_confirmado", nome: "Frete pago", quando: "Quando o pagamento do frete é confirmado", essencial: false, modelos: ["frete_confirmado"] },
  { id: "pronto_retirada", nome: "Pronto para retirada", quando: "Quando a loja marca o pedido como pronto, com o código de retirada", essencial: false, modelos: ["pronto_retirada"] },
  { id: "saida", nome: "Saiu para entrega / enviado", quando: "Quando a loja marca a saída", essencial: false, modelos: ["saiu_entrega", "pedido_enviado"] },
  { id: "pedido_entregue", nome: "Pedido entregue", quando: "Quando a loja confirma a entrega", essencial: false, modelos: ["pedido_entregue"] },
  { id: "bloqueio", nome: "Bloqueio e desbloqueio do telefone", quando: "Quando o telefone é bloqueado, liberado ou mantido bloqueado", essencial: false, modelos: ["telefone_bloqueado", "telefone_liberado", "bloqueio_mantido"] },
];

/** Texto da mensagem; `sorteio` escolhe a versão (0 a 1). */
export function mensagemWhatsApp<M extends Modelo>(modelo: M, parametros: ParametrosMensagem[M], sorteio: number = Math.random()): string {
  const versoes = MODELOS[modelo] as Versoes<M>;
  const i = Math.min(versoes.length - 1, Math.floor(Math.max(0, sorteio) * versoes.length));
  return versoes[i]!(parametros);
}
