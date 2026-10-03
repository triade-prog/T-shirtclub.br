// Mensagens do WhatsApp (seção 10) e leitura do que a cliente escreve. Textos da loja de
// 27/09: uma versão oficial por evento, a informação importante primeiro e a marca depois;
// 💖 e ✦ só nos momentos bons, e código, erro e bloqueio ficam neutros.
// Só o primeiro nome; o link é sempre do domínio da loja. *negrito* é a marcação do WhatsApp.
// O nome é "T-shirt Club", sem o .br: o WhatsApp transforma "Club.br" em link para club.br,
// que não é da loja (27/09).
// Na conversa (boas-vindas, menu, respostas rápidas, minha reserva, ofertas e trocas) quem fala
// é a Clubinha, a assistente virtual da loja (03/10): primeira pessoa, próxima e animada, com 💖
// e ✦. Ela diz que é assistente virtual ao se apresentar. Os avisos de reserva, pagamento e
// entrega seguem no tom da loja, e código, erro e bloqueio ficam neutros.
// A Clubinha vende (0550): chama pelo nome quando sabe, mostra a coleção mais nova, termina cada
// resposta com o próximo passo e acompanha (reserva não paga com as peças que ainda estão à
// venda, equipe que demorou a responder e pós-entrega). O que precisa de gente vira um chamado
// numerado, que a equipe assume e finaliza; ao finalizar, a Clubinha pede uma nota de 1 a 5.

import { formatarReais } from "./dinheiro.ts";
import type { Promocao } from "./preco.ts";
import { formatarTelefone } from "./telefone.ts";

const FUSO = "America/Bahia";
/** Endereço da loja nas mensagens sem link de reserva (27/09: o da Vercel, até existir o domínio próprio). */
const SITE = "tshirtclub.vercel.app";
export const SITE_LOJA = SITE;
/**
 * Política de trocas (29/09, pedido da loja): dias para pedir, contados de quando a cliente
 * recebe ou retira a peça, que precisa estar sem uso e com a etiqueta. A página /trocas, a
 * sacola, a página da peça e o WhatsApp leem daqui.
 */
export const DIAS_TROCA = 7;

/** Formas de pagamento (0470): PIX e cartão pelo site; as outras, venda manual já paga no painel. */
export type FormaPagamento = "PIX" | "CARTAO" | "DINHEIRO" | "PIX_DIRETO" | "MAQUININHA";
export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  PIX: "PIX", CARTAO: "Cartão", DINHEIRO: "Dinheiro", PIX_DIRETO: "PIX na conta da loja", MAQUININHA: "Maquininha",
};
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

/** "oferta", "ofertas", "promoção" ou "promoções", sozinhas na mensagem (27/09). */
export function ehPedidoOfertas(texto: string): boolean {
  return /^(ofertas?|promocao|promocoes)[.!?]*$/.test(normalizarTexto(texto));
}

/**
 * Fala em troca ou devolução (29/09): "quero trocar", "como faço a devolução?". Ao contrário
 * de "ofertas", vale no meio da frase; "troco" (do dinheiro) fica de fora.
 */
export function ehPedidoTroca(texto: string): boolean {
  return /\b(trocas?|trocar|devolucao|devolucoes|devolver)\b/.test(normalizarTexto(texto));
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
  /** grupo: o "compre mais" por grupo ativo quando falta 1 peça para ele (ex.: 3 por R$ 119,99). */
  reserva_criada: {
    nome: string;
    pecas: number;
    numero: number;
    totalCentavos: number;
    expiraEm: Date;
    link: string;
    grupo?: { qtd: number; precoCentavos: number };
  };
  /** nome e pecas: o banco completa a partir da reserva (0330). */
  reserva_lembrete_5min: { numero: number; expiraEm: Date; nome?: string; pecas?: number };
  /**
   * disponiveis: as peças da reserva que seguem à venda (0550), com o link de cada uma; sem a
   * lista, o texto de antes. pausada: o número foi bloqueado, então sem convite para reservar.
   */
  reserva_expirada: { numero: number; expiradaEm: Date; nome?: string; disponiveis?: PecaLink[]; pausada?: boolean };
  /** retirada: venda manual já paga com retirada combinada (0470): não pede para escolher a entrega. */
  pagamento_confirmado: { nome: string; numero: number; totalCentavos: number; forma: FormaPagamento; pecas?: number; retirada?: boolean };
  pagamento_em_analise: { numero: number; frete?: boolean; valorDivergente?: boolean };
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
  pedido_entregue: { numero: number; nome?: string };
  /** menu: com o menu das respostas rápidas ligado, termina com o caminho de volta para ele (03/10). */
  minhas_reservas: { reservas: ResumoReserva[]; menu?: boolean };
  /** As vigentes, na ordem de whatsapp_offers() (0340). */
  ofertas: { promocoes: readonly Promocao[]; menu?: boolean };
  trocas: { menu?: boolean };
  /** opcoes: o menu das respostas rápidas (0540); sem ele, só o site. nome e novidade: 0550. */
  boas_vindas: { opcoes?: readonly OpcaoMenu[]; nome?: string | null; novidade?: PecaLink | null };
  menu: { opcoes: readonly OpcaoMenu[] };
  /** O texto do painel, já com {site}, {endereco} e {horario} preenchidos. */
  resposta_rapida: { texto: string };
  /** A cliente pediu a equipe e ninguém respondeu (0550). */
  atendimento_lembrete: { nome?: string };
  /** A dúvida que a Clubinha não soube responder virou chamado (0550). */
  chamado_aberto: Record<string, never>;
  /** A equipe finalizou o chamado: a Clubinha agradece e pede a nota (0550). */
  atendimento_encerrado: { nome?: string };
  /** A cliente deu a nota; menu: com o menu ligado, a volta para ele. */
  avaliacao_recebida: { nota: number; menu?: boolean };
  /** Resposta à equipe no WhatsApp, depois de "assumi 12" ou "resolvido 12" (0550). */
  chamado_equipe: { resultado: ResultadoComando; numero: number; nome?: string | null; notaPedida?: boolean };
  /** Dias depois da entrega ou retirada (0550). */
  pos_venda: { nome?: string; pecas?: number };
  mensagem_teste: Record<string, never>;
  /** Aviso para a equipe (0510), no WhatsApp pessoal gravado no painel. */
  aviso_loja: AvisoLoja;
}

export type ResultadoComando = "ASSUMIDO" | "RESOLVIDO" | "JA_ASSUMIDO" | "JA_RESOLVIDO" | "NAO_ENCONTRADO";
export type MotivoChamado = "EQUIPE" | "TROCA" | "DUVIDA";

/** Nome e endereço (slug) de uma peça ou coleção, para o link no site. */
export interface PecaLink {
  nome: string;
  slug: string;
}

/** Uma linha do menu do WhatsApp (0540). */
export interface OpcaoMenu {
  numero: number;
  titulo: string;
}

// ─── Avisos para a equipe (0510) ────────────────────────────────────────────────────

/** Os avisos que o painel liga e desliga; o banco confere a mesma lista (store_alert_types). */
export const AVISOS_LOJA = [
  { id: "nova_reserva", nome: "Nova reserva", quando: "Quando uma cliente reserva pelo site, com número, peças e valor" },
  { id: "pagamento_aprovado", nome: "Pagamento aprovado", quando: "Quando o PIX ou o cartão de uma reserva (ou do frete) é aprovado" },
  { id: "lista_vip", nome: "Entrou na lista VIP", quando: "Quando alguém se inscreve na lista VIP, com o total de inscritos" },
  { id: "frete_calcular", nome: "Frete para calcular", quando: "Quando a cliente escolhe motoboy ou envio e manda o endereço" },
  { id: "cancelamento", nome: "Pedido de cancelamento", quando: "Quando a cliente pede para cancelar uma reserva" },
  { id: "pagamento_analise", nome: "Pagamento em análise", quando: "Quando um pagamento chega fora do prazo ou com valor diferente" },
  { id: "contestacao", nome: "Contestação de pagamento", quando: "Quando a cliente contesta ou estorna um pagamento no banco ou no cartão" },
  { id: "troca", nome: "Cliente falou em troca", quando: "Quando alguém fala em troca ou devolução no WhatsApp da loja" },
  { id: "atendimento", nome: "Chamado no WhatsApp", quando: "Quando alguém escolhe “Falar com a equipe” ou manda uma dúvida que a Clubinha não sabe responder, com o número do chamado" },
  { id: "avaliacao", nome: "Nota do atendimento", quando: "Quando a cliente dá a nota de 1 a 5 depois que vocês finalizam o chamado" },
  { id: "sistema", nome: "Alerta do sistema", quando: "Quando algo para de funcionar (pagamentos, fila, rotinas automáticas)" },
] as const;

export type TipoAvisoLoja = (typeof AVISOS_LOJA)[number]["id"];

export type AvisoLoja =
  | { tipo: "nova_reserva"; numero: number; nome: string; pecas: number; totalCentavos: number; retirada: boolean; expiraEm: Date }
  | { tipo: "pagamento_aprovado"; numero: number; nome: string; valorCentavos: number; forma: "PIX" | "CARTAO"; frete: boolean }
  | { tipo: "lista_vip"; nome: string | null; origem: "POPUP" | "RODAPE"; total: number }
  | { tipo: "frete_calcular"; numero: number; modalidade: "MOTOBOY" | "ENVIO" }
  | { tipo: "cancelamento"; numero: number }
  | { tipo: "pagamento_analise"; numero: number; motivo: "APROVADO_APOS_TOLERANCIA" | "RESERVA_ENCERRADA" | "VALOR_DIVERGENTE" | "FRETE_ENCERRADO" }
  | { tipo: "contestacao"; numero: number; motivo: "ESTORNO" | "CONTESTACAO" | "CANCELAMENTO" }
  | ({ tipo: "troca"; chamado?: number; motivo?: MotivoChamado } & ClienteAviso)
  | ({ tipo: "atendimento"; chamado?: number; motivo?: MotivoChamado; lembrete?: boolean; desde?: Date } & ClienteAviso)
  | { tipo: "avaliacao"; chamado: number; nome?: string | null; nota: number }
  | { tipo: "sistema"; mensagem: string }
  | { tipo: "teste" };

/**
 * Quem é a cliente, nos avisos de troca e de falar com a equipe (0550): o primeiro nome da última
 * reserva, o telefone (sai da fila depois de enviado), o último pedido e o que ela escreveu.
 */
export interface ClienteAviso {
  nome?: string | null;
  telefone?: string | null;
  final?: string;
  pedido?: { numero: number; status: ResumoReserva["status"]; substatus?: string | null } | null;
  mensagens?: string[];
}

const PAINEL = "admin-tshirtclub.vercel.app";

const STATUS_EQUIPE: Record<ResumoReserva["status"], string> = {
  RESERVADO: "reservada, aguardando o pagamento",
  PAGAMENTO_CONFIRMADO: "paga",
  ENTREGUE: "entregue",
  EXPIRADO: "encerrada sem pagamento",
};

const aCliente = (nome?: string | null) => (nome ? `à ${nome}` : "à cliente");
/** Como a equipe avisa a Clubinha, respondendo o aviso. */
const comandos = (n: number) => `Aqui, mande *assumi ${n}* ao começar e *resolvido ${n}* ao terminar.`;

/** O telefone, o último pedido e o que a cliente escreveu, para a equipe atender sem procurar. */
function sobreACliente(a: ClienteAviso): (string | false)[] {
  const pedido = a.pedido
    ? `🧾 Último pedido: #${a.pedido.numero} · ${STATUS_EQUIPE[a.pedido.status] ?? a.pedido.status}` +
      (a.pedido.status === "PAGAMENTO_CONFIRMADO" ? ` · ${SUBSTATUS_CLIENTE[a.pedido.substatus ?? ""] ?? "em preparação"}` : "")
    : "🧾 Ainda sem pedido neste número";
  const telefone = a.telefone ? `📱 ${/^\+55\d{11}$/.test(a.telefone) ? formatarTelefone(a.telefone) : a.telefone}` : a.final ? `📱 Número com final ${a.final}` : "📱 O WhatsApp não mostrou o número";
  return [
    `${telefone}\n${pedido}`,
    !!a.mensagens?.length && `💭 O que a cliente escreveu:\n${a.mensagens.map((m) => `“${m}”`).join("\n")}`,
  ];
}

const MOTIVO_ANALISE: Record<string, string> = {
  APROVADO_APOS_TOLERANCIA: "pago depois do prazo",
  RESERVA_ENCERRADA: "pago com a reserva já encerrada",
  VALOR_DIVERGENTE: "valor diferente do total",
  FRETE_ENCERRADO: "frete pago depois que a entrega mudou",
};
const MOTIVO_CONTESTACAO: Record<string, string> = { ESTORNO: "estorno", CONTESTACAO: "contestação", CANCELAMENTO: "cancelamento no banco" };

/** Texto do aviso: curto, o que aconteceu primeiro e onde resolver no fim. */
function textoAviso(a: AvisoLoja): string {
  switch (a.tipo) {
    case "nova_reserva":
      return blocos(
        `🛍️ *Nova reserva #${a.numero}*`,
        `${a.nome} · ${a.pecas} ${a.pecas === 1 ? "peça" : "peças"} · ${formatarReais(a.totalCentavos)}\n${a.retirada ? "Retirada na loja" : "Quer receber em casa"} · vale até ${formatarHora(a.expiraEm)}`,
        PAINEL,
      );
    case "pagamento_aprovado":
      return blocos(
        a.frete ? `✅ *Frete pago* · pedido #${a.numero}` : `✅ *Pagamento aprovado* · reserva #${a.numero}`,
        `${a.nome} · ${formatarReais(a.valorCentavos)} · ${ROTULO_FORMA[a.forma] ?? a.forma}`,
        a.frete ? "Pode preparar o envio." : "Agora é com a gente: separar as peças.",
      );
    case "lista_vip":
      return blocos(`⭐ *Nova inscrição na lista VIP*${a.nome ? `: ${a.nome}` : ""}`, `Pelo ${a.origem === "RODAPE" ? "rodapé" : "pop-up"} do site · ${a.total} na lista`);
    case "frete_calcular":
      return blocos(`📦 *Frete para calcular* · pedido #${a.numero}`, a.modalidade === "MOTOBOY" ? "Entrega por motoboy." : "Envio pelos Correios ou transportadora.", PAINEL);
    case "cancelamento":
      return blocos(`↩️ *Pedido de cancelamento* · reserva #${a.numero}`, "A reserva continua valendo até a equipe decidir.", PAINEL);
    case "pagamento_analise":
      return blocos(`🔎 *Pagamento em análise* · reserva #${a.numero}`, `Motivo: ${MOTIVO_ANALISE[a.motivo] ?? a.motivo}.`, PAINEL);
    case "contestacao":
      return blocos(`⚠️ *Contestação de pagamento* · pedido #${a.numero}`, `Tipo: ${MOTIVO_CONTESTACAO[a.motivo] ?? a.motivo}. Confira antes de entregar.`, PAINEL);
    case "troca": {
      const titulo = `${a.nome ?? "Uma cliente"} falou em troca ou devolução`;
      return blocos(
        a.chamado ? `🎫 *Chamado #${a.chamado}* · ${titulo}` : `🔁 *${titulo}*`,
        ...sobreACliente(a),
        `A cliente já recebeu a política de trocas. Responda ${aCliente(a.nome)} pelo WhatsApp da loja.${a.chamado ? ` ${comandos(a.chamado)}` : ""}`,
      );
    }
    case "atendimento": {
      const quem = a.nome ?? "Uma cliente";
      if (a.lembrete) {
        return blocos(
          a.chamado ? `⏰ *Chamado #${a.chamado}* · ${quem} ainda espera a equipe` : `⏰ *${quem} ainda espera a equipe*`,
          ...sobreACliente(a),
          `O chamado abriu${a.desde ? ` às ${formatarHora(a.desde)}` : ""} e ninguém assumiu ainda. A Clubinha avisou a cliente que vocês já respondem.` +
            (a.chamado ? ` Mande *assumi ${a.chamado}* ao começar.` : ""),
        );
      }
      const titulo = a.motivo === "DUVIDA" ? `${quem} mandou uma dúvida que a Clubinha não soube responder` : `${quem} quer falar com a equipe`;
      return blocos(
        a.chamado ? `🎫 *Chamado #${a.chamado}* · ${titulo}` : `💬 *${titulo}*`,
        ...sobreACliente(a),
        a.chamado
          ? `Responda ${aCliente(a.nome)} pelo WhatsApp da loja. ${comandos(a.chamado)}`
          : "Responda pelo WhatsApp da loja. O robô fica quieto nessa conversa enquanto vocês atendem.",
      );
    }
    case "avaliacao":
      return blocos(
        `⭐ *Nota ${a.nota} de 5* · chamado #${a.chamado}`,
        `${a.nome ?? "A cliente"} avaliou o atendimento.${a.nota <= 3 ? " Vale falar com ela para entender o que faltou." : ""}`,
      );
    case "sistema":
      return blocos("⚠️ *Alerta do sistema*", a.mensagem, PAINEL);
    case "teste":
      return blocos("✦ *Teste dos avisos da loja*", "Está funcionando: os avisos da T-shirt Club chegam neste número.");
  }
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
  const pecas = r.pecas === undefined ? "" : `${r.pecas} ${r.pecas === 1 ? "peça" : "peças"} · `;
  switch (r.status) {
    case "RESERVADO":
      return `• #${r.numero} · reservada até *${r.expiraEm ? formatarHora(r.expiraEm) : "--:--"}* · ${pecas}${formatarReais(r.totalCentavos)}` +
        (r.cancelamentoPendente ? " · cancelamento pedido" : "");
    case "PAGAMENTO_CONFIRMADO":
      return `• #${r.numero} · paga · ${SUBSTATUS_CLIENTE[r.substatus ?? ""] ?? "em preparação"}`;
    case "ENTREGUE":
      return `• #${r.numero} · entregue`;
    default:
      return `• #${r.numero} · encerrada${r.motivoEncerramento === "CANCELAMENTO_APROVADO" ? " (cancelamento aprovado)" : " sem pagamento"}`;
  }
}

/** Uma linha da resposta a "ofertas": o que a promoção dá, sem as regras miúdas. */
function linhaOferta(p: Promocao): string {
  const selecionadas = p.tipo !== "DESCONTO_PRODUTO" && p.escopo === "ESPECIFICOS" ? " em peças selecionadas" : "";
  switch (p.tipo) {
    case "COMPRE_MAIS":
      return p.modo === "PRECO_POR_GRUPO"
        ? `• *${p.nome}*: ${p.grupo.qtd} peças por ${formatarReais(p.grupo.precoCentavos)}${selecionadas}`
        : `• *${p.nome}*: ${p.niveis.map((n) => `${n.qtdMin} peças com ${n.pct}% de desconto`).join(" · ")}${selecionadas}`;
    case "DESCONTO_PRODUTO": {
      const pcts = Object.values(p.produtos).filter((d) => d.modo === "PERCENTUAL").map((d) => d.valor);
      const todasPct = pcts.length === Object.keys(p.produtos).length && pcts.length > 0;
      return `• *${p.nome}*: ${todasPct ? `até ${Math.max(...pcts)}% de desconto` : "preço especial"} em peças selecionadas`;
    }
    case "CUPOM": {
      const valor = p.modo === "VALOR" ? formatarReais(p.valor) : `${p.valor}%`;
      const teto = p.modo === "PERCENTUAL" && p.descontoMaximoCentavos ? ` (até ${formatarReais(p.descontoMaximoCentavos)})` : "";
      const minimo = p.gastoMinimoCentavos ? ` em compras a partir de ${formatarReais(p.gastoMinimoCentavos)}` : "";
      return `• Cupom *${p.codigo}*: ${valor} de desconto${teto}${minimo}${selecionadas}`;
    }
  }
}

export type Modelo = keyof ParametrosMensagem;

type Versoes<M extends Modelo> = ((p: ParametrosMensagem[M]) => string)[];

/** Blocos separados por uma linha em branco; os vazios saem. */
const blocos = (...partes: (string | false | undefined)[]) => partes.filter(Boolean).join("\n\n");
const nomeOuNada = (nome?: string) => (nome ? primeiroNome(nome) : "");
const linhasMenu = (opcoes: readonly OpcaoMenu[]) =>
  `Me conta, como posso te ajudar? É só responder com o número:\n${opcoes.map((o) => `*${o.numero}* · ${o.titulo}`).join("\n")}`;
/** Fim das respostas da conversa com o menu ligado: o caminho de volta para as opções (03/10). */
const VOLTA_MENU = "Posso te ajudar em mais alguma coisa? Manda *menu* que eu te mostro as opções ✦";
/** A Clubinha se apresenta nas boas-vindas (03/10), pelo nome quando sabe (0550). */
const clubinha = (nome?: string | null) => `Oi${nome ? `, ${nomeOuNada(nome)}` : ""}! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖`;
/** A coleção mais nova, com o link; sem ela, o site (0550). */
const vitrine = (novidade?: PecaLink | null) =>
  novidade ? `Nossa coleção mais nova é a *${novidade.nome}* ✦ Dá uma espiada:\n${SITE}/colecao/${novidade.slug}` : `Para ver as peças e reservar:\n${SITE}`;
const oi = (nome?: string) => `Oi${nome ? `, ${nomeOuNada(nome)}` : ""}!`;

const MODELOS: { [M in Modelo]: Versoes<M> } = {
  // ─── Verificação: neutras ───
  codigo_verificacao: [
    (p) => blocos(`Seu código da T-shirt Club é *${p.codigo}*.`, `Ele vale por ${p.minutos} minutos. Não compartilhe este código com ninguém.`),
  ],
  numero_diferente: [
    () => blocos("Esse não é o número informado na reserva.", "Envie a mensagem pelo WhatsApp que você cadastrou no site para continuar."),
  ],
  sem_numero: [
    () => blocos("Não conseguimos confirmar seu número por aqui.", "Envie a mensagem pelo mesmo WhatsApp informado no site para continuar."),
  ],
  referencia_invalida: [
    () => blocos("Não encontramos esse pedido de código.", "Volte ao site e toque em *Receber código no WhatsApp* novamente."),
  ],
  codigo_bloqueado: [
    (p) => blocos("Foram feitas muitas tentativas com este número.", `Você poderá solicitar um novo código às *${formatarHora(p.ate)}*.`),
  ],

  // ─── Reserva: T-shirt Club leve ───
  // "Club" é o conjunto de 3; com 2 peças e o "compre mais" por grupo ativo, a oferta entra.
  reserva_criada: [
    (p) => {
      const ate = formatarHora(p.expiraEm);
      const resumo = `Reserva #${p.numero} · ${formatarReais(p.totalCentavos)}`;
      if (p.pecas === 1) {
        return blocos(`Oi, ${primeiroNome(p.nome)}! 💖 Sua T-shirt está reservada.`, `Ela fica guardada até *${ate}*.`, resumo,
          `Finalize o pagamento:\n${p.link}`);
      }
      if (p.pecas >= 3) {
        return blocos(`Oi, ${primeiroNome(p.nome)}! 💖 Seu Club está reservado.`, `As ${p.pecas} peças ficam guardadas até *${ate}*.`, resumo,
          `Finalize o pagamento:\n${p.link}`);
      }
      const falta = p.grupo ? p.grupo.qtd - p.pecas : 0;
      return blocos(
        `Oi, ${primeiroNome(p.nome)}! 💖 Suas ${p.pecas} T-shirts estão reservadas.`,
        `Elas ficam guardadas até *${ate}*.`,
        resumo,
        p.grupo && falta === 1 && `Com mais 1 peça você completa o Club: ${p.grupo.qtd} por ${formatarReais(p.grupo.precoCentavos)}.`,
        p.grupo && falta === 1 ? `Finalize por aqui:\n${p.link}` : `Finalize o pagamento:\n${p.link}`,
      );
    },
  ],
  reserva_lembrete_5min: [
    (p) =>
      blocos(
        `${p.nome ? `${nomeOuNada(p.nome)}, faltam` : "Faltam"} só *5 minutos* para a reserva #${p.numero} expirar.`,
        p.pecas === 1 ? `Sua peça fica separada até *${formatarHora(p.expiraEm)}*.` : `Suas peças ficam separadas até *${formatarHora(p.expiraEm)}*.`,
        "Se você já pagou, pode ignorar esta mensagem. 💖",
      ),
  ],
  // Com a lista das peças (0550), é a Clubinha recuperando a venda: o que ainda dá para levar,
  // com o link de cada peça. Número bloqueado: sem convite.
  reserva_expirada: [
    (p) => {
      const fim = `O prazo da reserva #${p.numero} terminou às *${formatarHora(p.expiradaEm)}* e nenhuma cobrança foi feita.`;
      if (p.pausada) return blocos(fim, "As peças voltaram a ficar disponíveis no Club.");
      if (!p.disponiveis) return blocos(fim, "As peças voltaram a ficar disponíveis no Club.", `Se ainda quiser, você pode reservar novamente:\n${SITE}`);
      if (p.disponiveis.length === 0) {
        return blocos(`${oi(p.nome)} Aqui é a Clubinha 💖`, fim, `As peças dessa reserva já não estão disponíveis, mas tem mais coisa linda te esperando:\n${SITE}`);
      }
      return blocos(
        `${oi(p.nome)} Aqui é a Clubinha 💖`,
        fim,
        `Boa notícia: ${p.disponiveis.length === 1 ? "essa peça ainda está aqui" : "essas peças ainda estão aqui"} pra você\n` +
          p.disponiveis.map((d) => `• *${d.nome}*\n${SITE}/produto/${d.slug}`).join("\n"),
        "Quer garantir? É só reservar de novo pelo link ✦",
        "Ficou alguma dúvida de tamanho, frete ou pagamento? Me chama aqui que eu te ajudo.",
      );
    },
  ],

  // ─── Pagamento: o momento mais emocional ───
  // A mensagem não leva o link com a chave: o banco guarda só o hash dela (G6). A cliente
  // vê o pedido no site, com a sessão do celular em que pagou ou pela consulta com código.
  pagamento_confirmado: [
    (p) =>
      blocos(
        "Pagamento confirmado! ✦",
        `${primeiroNome(p.nome)}, ${p.pecas === 1 ? "sua peça agora é sua" : "suas peças agora são suas"}. 💖`,
        `Pedido #${p.numero}\n${formatarReais(p.totalCentavos)} · ${ROTULO_FORMA[p.forma] ?? "PIX"}`,
        p.retirada ? "Você retira na loja. Avisamos por aqui assim que o pedido estiver pronto." : `Falta só escolher como você quer receber:\n${SITE}`,
      ),
  ],
  // "Não pague de novo" evita pagamento em dobro enquanto a loja confere.
  pagamento_em_analise: [
    (p) =>
      p.frete
        ? blocos(
          `Recebemos o pagamento do frete do pedido #${p.numero}, mas a condição de entrega já havia mudado.`,
          "Nossa equipe vai conferir e falar com você por aqui.",
          "Não faça outro pagamento até receber nosso retorno.",
        )
        : blocos(
          p.valorDivergente
            ? `Recebemos um pagamento da reserva #${p.numero} com valor diferente do total.`
            : `Recebemos um pagamento relacionado à reserva #${p.numero} depois do prazo.`,
          "Nossa equipe vai conferir o pagamento e falar com você por aqui.",
          "Não é necessário pagar novamente.",
        ),
  ],

  // ─── Bloqueio: neutras, sem tom de julgamento ───
  telefone_bloqueado: [
    () =>
      blocos(
        "As reservas deste número estão temporariamente pausadas porque 3 reservas expiraram sem pagamento nos últimos 30 dias.",
        "Se precisar de ajuda ou quiser solicitar uma análise, pode falar com a gente por aqui.",
      ),
  ],
  telefone_liberado: [
    () => blocos("Tudo certo! 💖", "As reservas deste número foram liberadas e você já pode reservar suas T-shirts novamente.", SITE),
  ],
  bloqueio_mantido: [
    () => blocos("Concluímos a análise e as reservas deste número continuam pausadas por enquanto.", "Se precisar de mais informações, pode responder esta mensagem."),
  ],

  // ─── Cancelamento: o pedido não pausa o relógio (regra 12) ───
  cancelamento_recebido: [
    (p) =>
      blocos(
        `Recebemos seu pedido de cancelamento da reserva #${p.numero}.`,
        "Nossa equipe vai analisar e responder por aqui.",
        `Enquanto o cancelamento não for aprovado, a reserva continua válida até *${formatarHora(p.expiraEm)}*.`,
      ),
  ],
  cancelamento_aprovado: [(p) => blocos("Cancelamento aprovado.", `A reserva #${p.numero} foi encerrada e nenhuma cobrança foi feita.`)],
  cancelamento_recusado: [
    (p) =>
      blocos(
        `O pedido de cancelamento da reserva #${p.numero} não foi aprovado.`,
        `A reserva continua válida até *${formatarHora(p.expiraEm)}*.`,
        "Se precisar entender o motivo, pode responder esta mensagem.",
      ),
  ],

  // ─── Entrega (regras 17 e 18): sem telefone no texto; o endereço só na retirada ───
  entrega_confirmada: [
    (p) =>
      p.modalidade === "RETIRADA"
        ? blocos("Combinado! 💖", `O pedido #${p.numero} será retirado na loja.`, "Avisamos por aqui assim que ele estiver pronto.")
        : blocos("Endereço recebido! 💖", `Agora vamos calcular o frete do pedido #${p.numero}.`, "Assim que o valor estiver pronto, enviamos por aqui."),
  ],
  frete_calculado: [
    (p) =>
      blocos(
        `O frete do pedido #${p.numero} ficou em *${formatarReais(p.valorCentavos)}*.`,
        `Para manter esta opção de entrega, pague até *${formatarHora(p.pagarAte)}*:`,
        SITE,
        "Depois da confirmação, começamos a preparar o envio. ✦",
      ),
  ],
  frete_confirmado: [
    (p) => blocos("Frete confirmado! ✦", `O pedido #${p.numero} já entrou em preparação.`, "Avisamos por aqui quando ele seguir para entrega. 💖"),
  ],
  // A cliente costuma abrir esta já chegando à loja: cada dado numa linha.
  pronto_retirada: [
    (p) =>
      blocos(
        "Seu pedido está pronto! 💖",
        `*Pedido:* #${p.numero}\n*Código de retirada:* *${p.codigo}*`,
        p.endereco && `*Endereço:*\n${p.endereco}`,
        p.horario && `*Horário:*\n${p.horario}`,
        "Na retirada, informe seu nome, este WhatsApp e o código acima.",
      ),
  ],
  saiu_entrega: [
    (p) => blocos(`Seu pedido #${p.numero} saiu para entrega! ✦`, "Se puder, deixe alguém disponível para receber.", "Avisamos por aqui assim que a entrega for concluída."),
  ],
  pedido_enviado: [
    (p) =>
      blocos(
        `Seu pedido #${p.numero} foi enviado! 💖`,
        p.rastreio && `*Código de rastreio:*\n*${p.rastreio}*`,
        p.rastreio && "Você já pode acompanhar a entrega pelo rastreamento da transportadora.",
      ),
  ],
  pedido_entregue: [
    (p) =>
      blocos(
        `Pedido #${p.numero} entregue. 💖`,
        `Obrigada por fazer parte do Club${p.nome ? `, ${nomeOuNada(p.nome)}` : ""}!`,
        `Troca em até ${DIAS_TROCA} dias, com a peça sem uso e com a etiqueta. Se precisar, é só responder esta mensagem.`,
      ),
  ],

  // ─── Conversa: a Clubinha ───
  // Resposta a "Minha reserva" (regra 22): sem código e sem link de pagamento; detalhes no site.
  // O próximo passo de cada uma (0550): pagar a guardada, escolher a entrega da paga.
  minhas_reservas: [
    (p) =>
      p.reservas.length === 0
        ? blocos("Procurei aqui e ainda não achei reservas neste número 🤔", `Que tal escolher as suas? As peças estão aqui:\n${SITE}`, p.menu && VOLTA_MENU)
        : blocos(
          p.reservas.length === 1 ? "Achei! Esta é sua reserva recente:" : "Achei! Estas são suas reservas recentes:",
          p.reservas.map(linhaReserva).join("\n"),
          p.reservas.some((r) => r.status === "RESERVADO")
            ? "Suas peças estão guardadas até o horário acima. Finalize o pagamento pelo link que chegou aqui quando você reservou, pra não perder ✦"
            : p.reservas.some((r) => r.substatus === "AGUARDANDO_MODALIDADE") && "Falta só escolher como você quer receber, e é rapidinho pelo site 💖",
          `Para ver todos os detalhes:\n${SITE}`,
          p.menu && VOLTA_MENU,
        ),
  ],
  // Resposta a "ofertas" (27/09): as promoções e cupons vigentes do painel.
  ofertas: [
    (p) =>
      p.promocoes.length === 0
        ? blocos("Hoje não tem promoção ativa, mas tem peça linda te esperando 💖", `Dá uma olhada:\n${SITE}`, p.menu && VOLTA_MENU)
        : blocos(
          "Separei as ofertas de hoje pra você ✦",
          p.promocoes.map(linhaOferta).join("\n"),
          p.promocoes.length > 1 && "Vale sempre a oferta mais vantajosa para você: os descontos não se somam.",
          `Bora aproveitar? Escolhe suas peças aqui:\n${SITE}`,
          p.menu && VOLTA_MENU,
        ),
  ],
  // Resposta a quem fala em troca ou devolução (29/09): a política e o link; no máximo 1 vez a
  // cada 24 h por número (0460). O pedido de troca a equipe atende pelo celular.
  trocas: [
    (p) =>
      blocos(
        "Sobre trocas, eu te explico! 💖",
        `Você tem até *${DIAS_TROCA} dias* depois de receber ou retirar o pedido, com a peça sem uso e com a etiqueta.`,
        `Comprou pelo site e desistiu? Nos mesmos ${DIAS_TROCA} dias você devolve e recebe o valor de volta.`,
        "Para pedir, responda aqui com o número da reserva e o que quer trocar. A equipe te responde assim que puder.",
        `A política completa:\n${SITE}/trocas`,
        p.menu && VOLTA_MENU,
      ),
  ],
  // Resposta automática a mensagem comum: no máximo 1 vez a cada 24 h por número (0310). Com
  // as respostas rápidas ligadas, leva o menu (0540).
  // Pelo nome (da última reserva do número) e com a coleção mais nova (0550).
  boas_vindas: [
    (p) =>
      p.opcoes?.length
        ? blocos(clubinha(p.nome), vitrine(p.novidade), linhasMenu(p.opcoes))
        : blocos(
          clubinha(p.nome),
          vitrine(p.novidade),
          "Precisa de ajuda com outra coisa? Pode escrever por aqui, que a equipe te responde assim que puder.",
        ),
  ],
  // "menu" a qualquer hora (0540)
  menu: [(p) => linhasMenu(p.opcoes)],
  // Resposta rápida do painel (0540), com o caminho de volta para o menu
  resposta_rapida: [(p) => blocos(p.texto, VOLTA_MENU)],
  // Acompanhamento (0550): a cliente pediu a equipe e ninguém respondeu ainda.
  atendimento_lembrete: [
    (p) =>
      blocos(
        `${p.nome ? `${nomeOuNada(p.nome)}, já` : "Já"} avisei a equipe de novo, e alguém te responde por aqui o quanto antes 💖`,
        "Se quiser adiantar, conta pra gente o que você precisa: a peça, o tamanho ou o número do pedido.",
      ),
  ],
  // Chamados (0550): a dúvida passa para a equipe; o encerramento pede a nota.
  chamado_aberto: [
    () => "Essa eu vou deixar com a equipe, tá? Já passei sua mensagem, e alguém te responde por aqui o quanto antes 💖",
  ],
  atendimento_encerrado: [
    (p) =>
      blocos(
        `Prontinho${p.nome ? `, ${nomeOuNada(p.nome)}` : ""}! A equipe finalizou seu atendimento 💖`,
        "De 1 a 5, quanto você dá para o nosso atendimento? É só responder com o número ✦",
      ),
  ],
  avaliacao_recebida: [
    (p) =>
      blocos(
        p.nota >= 4 ? `Obrigada pela nota *${p.nota}*! Fico muito feliz 💖` : "Obrigada pela sinceridade! Vou passar pra equipe, pra gente melhorar 💖",
        p.menu && VOLTA_MENU,
      ),
  ],
  // Para a equipe, no número dos avisos: neutra
  chamado_equipe: [
    (p) => {
      const quem = p.nome ? ` da ${p.nome}` : "";
      switch (p.resultado) {
        case "ASSUMIDO":
          return `👍 Chamado #${p.numero}${quem} é seu. Ao terminar, mande *resolvido ${p.numero}*.`;
        case "RESOLVIDO":
          return `✅ Chamado #${p.numero}${quem} finalizado.${p.notaPedida ? " A Clubinha agradeceu e pediu a nota do atendimento." : " A Clubinha voltou a responder na conversa."}`;
        case "JA_ASSUMIDO":
          return `O chamado #${p.numero} já está em atendimento. Ao terminar, mande *resolvido ${p.numero}*.`;
        case "JA_RESOLVIDO":
          return `O chamado #${p.numero} já foi finalizado.`;
        case "NAO_ENCONTRADO":
          return `Não achei o chamado #${p.numero}. Confira o número no aviso.`;
      }
    },
  ],
  // Acompanhamento (0550): dias depois da entrega ou retirada.
  pos_venda: [
    (p) =>
      blocos(
        `${oi(p.nome)} Aqui é a Clubinha, passando pra saber: gostou ${p.pecas !== undefined && p.pecas > 1 ? "das suas T-shirts" : "da sua T-shirt"}? 💖`,
        "Se postar uma foto usando, marca a T-shirt Club no Instagram: a gente ama ver ✦",
        `E pra saber das novidades antes de todo mundo, entra na lista VIP:\n${SITE}`,
      ),
  ],
  mensagem_teste: [
    () => blocos("✦ Teste T-shirt Club", "O envio de mensagens pelo sistema está funcionando corretamente.", "Esta é apenas uma mensagem de teste."),
  ],
  aviso_loja: [textoAviso],
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
  { id: "reserva_expirada", nome: "Reserva expirada", quando: "Quando o prazo termina sem pagamento, com as peças da reserva que ainda estão à venda e o link de cada uma", essencial: true, modelos: ["reserva_expirada"] },
  { id: "cancelamento_recebido", nome: "Cancelamento recebido", quando: "Quando a cliente pede cancelamento", essencial: false, modelos: ["cancelamento_recebido"] },
  { id: "cancelamento_decisao", nome: "Decisão do cancelamento", quando: "Quando a loja aprova ou recusa", essencial: false, modelos: ["cancelamento_aprovado", "cancelamento_recusado"] },
  { id: "pagamento_em_analise", nome: "Pagamento em análise", quando: "Quando o pagamento chega fora do prazo ou com valor diferente", essencial: false, modelos: ["pagamento_em_analise"] },
  { id: "entrega_confirmada", nome: "Modalidade de entrega confirmada", quando: "Depois que a cliente confirma retirada, motoboy ou envio", essencial: false, modelos: ["entrega_confirmada"] },
  { id: "frete_calculado", nome: "Frete calculado", quando: "Com o valor e o prazo de 2 horas para pagar", essencial: false, modelos: ["frete_calculado"] },
  { id: "frete_confirmado", nome: "Frete pago", quando: "Quando o pagamento do frete é confirmado", essencial: false, modelos: ["frete_confirmado"] },
  { id: "pronto_retirada", nome: "Pronto para retirada", quando: "Quando a loja marca o pedido como pronto, com o código de retirada", essencial: false, modelos: ["pronto_retirada"] },
  { id: "saida", nome: "Saiu para entrega / enviado", quando: "Quando a loja marca a saída", essencial: false, modelos: ["saiu_entrega", "pedido_enviado"] },
  { id: "pedido_entregue", nome: "Pedido entregue", quando: "Quando a loja confirma a entrega", essencial: false, modelos: ["pedido_entregue"] },
  { id: "boas_vindas", nome: "Resposta automática", quando: "Quando alguém manda uma mensagem comum, a Clubinha se apresenta com o site e o menu (no máximo 1 vez a cada 24 horas por número)", essencial: false, modelos: ["boas_vindas"] },
  { id: "respostas", nome: "Respostas rápidas e menu", quando: "Quando a cliente escolhe um número do menu ou escreve uma palavra das respostas rápidas (tamanho, frete, pix...)", essencial: false, modelos: ["resposta_rapida", "menu"] },
  { id: "trocas", nome: "Resposta sobre trocas", quando: "Quando alguém fala em troca ou devolução, com a política da loja (no máximo 1 vez a cada 24 horas por número)", essencial: false, modelos: ["trocas"] },
  { id: "chamados", nome: "Chamados", quando: "Quando a Clubinha passa uma dúvida para a equipe, e quando vocês finalizam o chamado (com o pedido de nota de 1 a 5)", essencial: false, modelos: ["chamado_aberto", "atendimento_encerrado", "avaliacao_recebida"] },
  { id: "atendimento_lembrete", nome: "Equipe demorou a responder", quando: "Quando um chamado fica 20 minutos sem ninguém assumir, a Clubinha avisa a cliente que vocês já respondem (das 8h às 20h, 1 vez por chamado)", essencial: false, modelos: ["atendimento_lembrete"] },
  { id: "pos_venda", nome: "Pós-entrega", quando: "2 dias depois da entrega ou retirada, a Clubinha pergunta se a cliente gostou e convida para a lista VIP (das 8h às 20h)", essencial: false, modelos: ["pos_venda"] },
  { id: "bloqueio", nome: "Bloqueio e desbloqueio do telefone", quando: "Quando o telefone é bloqueado, liberado ou mantido bloqueado", essencial: false, modelos: ["telefone_bloqueado", "telefone_liberado", "bloqueio_mantido"] },
];

/** Texto da mensagem; `sorteio` escolhe a versão (0 a 1). */
export function mensagemWhatsApp<M extends Modelo>(modelo: M, parametros: ParametrosMensagem[M], sorteio: number = Math.random()): string {
  const versoes = MODELOS[modelo] as Versoes<M>;
  const i = Math.min(versoes.length - 1, Math.floor(Math.max(0, sorteio) * versoes.length));
  return versoes[i]!(parametros);
}
