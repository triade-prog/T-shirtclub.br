import { NOTIFICACOES } from "@tshirtclub/domain";

// Rótulos do painel de WhatsApp (0570): nomes das mensagens, etapas, situações e tempos.

export type StatusChamado = "ABERTO" | "EM_ATENDIMENTO" | "RESOLVIDO";
export type MotivoChamado = "EQUIPE" | "TROCA" | "DUVIDA";
export interface Chamado {
  numero: number; status: StatusChamado; motivo: MotivoChamado; abertoEm: string;
  assumidoEm: string | null; assumidoVia: "PAINEL" | "WHATSAPP" | "CELULAR" | null; assumidoPor?: string | null;
  lembreteEm?: string | null;
  resolvidoEm: string | null; resolvidoVia: "PAINEL" | "WHATSAPP" | null; resolvidoPor?: string | null;
  notaPedida: boolean; nota: number | null;
}

export const MOTIVO: Record<MotivoChamado, string> = { EQUIPE: "Pediu a equipe", TROCA: "Falou em troca", DUVIDA: "Dúvida que a Clubinha não respondeu" };
export const VIA: Record<string, string> = { PAINEL: "pelo painel", WHATSAPP: "pelo WhatsApp da equipe", CELULAR: "respondendo pelo celular da loja" };
export const STATUS_CHAMADO: Record<StatusChamado, string> = { ABERTO: "Aberto", EM_ATENDIMENTO: "Em atendimento", RESOLVIDO: "Finalizado" };

/** Nome de cada mensagem automática pelo modelo (a linha das notificações que a cobre). */
export const NOME_DO_MODELO: Record<string, string> = {
  ...Object.fromEntries(NOTIFICACOES.flatMap((n) => n.modelos.map((m) => [m, n.nome]))),
  cancelamento_aprovado: "Cancelamento aprovado",
  cancelamento_recusado: "Cancelamento recusado",
  saiu_entrega: "Saiu para entrega",
  pedido_enviado: "Pedido enviado",
  menu: "Menu",
  resposta_rapida: "Resposta rápida",
  chamado_aberto: "Chamado aberto",
  atendimento_encerrado: "Chamado finalizado",
  avaliacao_recebida: "Nota recebida",
  mensagem_teste: "Mensagem de teste",
  aviso_loja: "Aviso para a equipe",
  chamado_equipe: "Resposta ao comando da equipe",
};
export const nomeDoModelo = (m: string) => NOME_DO_MODELO[m] ?? m;

/** As notificações para a cliente por etapa da compra (aba Mensagens automáticas). */
export const ETAPAS: { id: string; titulo: string; nota: string; ids: string[] }[] = [
  { id: "reserva", titulo: "Reserva", nota: "Do código de verificação ao fim do prazo para pagar.",
    ids: ["codigo", "reserva_criada", "lembrete", "reserva_expirada", "cancelamento_recebido", "cancelamento_decisao", "bloqueio"] },
  { id: "pagamento", titulo: "Pagamento", nota: "Quando o pagamento é aprovado ou precisa de análise.", ids: ["pagamento_confirmado", "pagamento_em_analise"] },
  { id: "entrega", titulo: "Entrega", nota: "Da escolha da entrega até o pedido chegar.",
    ids: ["entrega_confirmada", "frete_calculado", "frete_confirmado", "pronto_retirada", "saida", "pedido_entregue"] },
  { id: "atendimento", titulo: "Atendimento da Clubinha", nota: "As respostas na conversa e os chamados.",
    ids: ["boas_vindas", "respostas", "trocas", "chamados", "atendimento_lembrete"] },
  { id: "pos", titulo: "Pós-venda", nota: "Depois que a cliente recebe.", ids: ["pos_venda"] },
];

export type StatusEnvio = "PENDENTE" | "ENVIANDO" | "ENVIADA" | "ENTREGUE" | "LIDA" | "FALHOU" | "DESCARTADA";
export const STATUS_ENVIO: Record<StatusEnvio, string> = {
  PENDENTE: "Na fila", ENVIANDO: "Saindo", ENVIADA: "Enviada", ENTREGUE: "Entregue", LIDA: "Lida", FALHOU: "Falhou", DESCARTADA: "Não enviada",
};
export const tomDoEnvio = (s: string): "reserved" | "paid" | "issue" | "expired" =>
  s === "FALHOU" ? "issue" : s === "DESCARTADA" ? "expired" : s === "PENDENTE" || s === "ENVIANDO" ? "reserved" : "paid";

/** Por que a mensagem que falhou não volta para a fila (admin_outbox_list.naoReenvia). */
export const NAO_REENVIA: Record<string, string> = {
  SEM_LINK: "Tinha o link da reserva, que não fica guardado. A cliente vê a reserva pelo site ou mandando “minha reserva” no WhatsApp.",
  VENCIDA: "Passou da hora de valer.",
  MUDOU: "A reserva mudou de situação e a mensagem já não vale.",
};

/** Tempo desde `iso` em palavras curtas: "agora", "12 min", "1 h 20", "3 d". */
export function haQuanto(iso: string, agora = Date.now()): string {
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
  return `${Math.floor(min / (24 * 60))} d`;
}

/** Cor da espera de um chamado sem dono: até o lembrete, amarela depois, vermelha passando de 1 hora. */
export function tomDaEspera(iso: string, lembreteMin = 20, agora = Date.now()): "" | "atencao" | "urgente" {
  const min = (agora - new Date(iso).getTime()) / 60_000;
  return min >= 60 ? "urgente" : min >= lembreteMin ? "atencao" : "";
}

/** Link para abrir a conversa no WhatsApp (celular ou WhatsApp Web da loja). */
export const linkWhatsapp = (e164: string) => `https://wa.me/${e164.replace(/\D/g, "")}`;
