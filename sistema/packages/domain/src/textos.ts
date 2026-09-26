// Textos da interface (D4). Todos em português do Brasil e num lugar só.
// Tom da marca: carinhosa e direta; prazo sempre com horário; nunca culpa nem susto.

import type { CodigoErro } from "./erros.ts";
import { formatarReais } from "./dinheiro.ts";
import type { MotivoCupom } from "./preco.ts";

export interface ContextoErro {
  produtos?: string[];
  totalCentavos?: number;
  tentativasRestantes?: number;
  horario?: string;
  numeroReserva?: number;
  maxPecas?: number;
  maxPorProduto?: number;
  whatsappLoja?: string;
  motivoCupom?: MotivoCupom;
  gastoMinimoCentavos?: number;
  comprometido?: number;
}

export interface TextoErro {
  mensagem: string;
  acao?: string;
}

function lista(nomes: string[] = []): string {
  if (nomes.length <= 1) return nomes[0] ?? "Uma peça";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

export function textoErro(codigo: CodigoErro, c: ContextoErro = {}): TextoErro {
  switch (codigo) {
    case "STOCK_UNAVAILABLE":
    case "INSUFFICIENT_STOCK": {
      const n = c.produtos?.length ?? 1;
      return {
        mensagem: `${lista(c.produtos)} ${n > 1 ? "acabaram" : "acabou"} agora. Tire da sacola para continuar; o resto segue separado para você.`,
        acao: "Ajustar a sacola",
      };
    }
    case "PRICE_CHANGED":
      return {
        mensagem: c.totalCentavos === undefined
          ? "O preço mudou desde que você escolheu."
          : `O preço mudou desde que você escolheu: agora o total é ${formatarReais(c.totalCentavos)}.`,
        acao: "Ver o novo total e confirmar",
      };
    case "COUPON_NOT_BEST":
      return { mensagem: "Você já tem um desconto maior. O cupom fica guardado para outra compra." };
    case "COUPON_INVALID":
      return { mensagem: textoCupom(c.motivoCupom, c), acao: "Continuar sem cupom" };
    case "OTP_INVALID": {
      const r = c.tentativasRestantes ?? 0;
      return {
        mensagem: r > 0 ? `Código errado. ${r === 1 ? "Resta 1 tentativa" : `Restam ${r} tentativas`} com este código.` : "Código errado.",
        acao: "Digitar de novo",
      };
    }
    case "OTP_EXPIRED":
      return { mensagem: "Este código venceu. Peça outro pelo WhatsApp.", acao: "Pedir outro código" };
    case "OTP_LOCKED":
      return {
        mensagem: c.horario ? `Muitas tentativas. Você pode pedir um código de novo às ${c.horario}.` : "Muitas tentativas. Espere um pouco para pedir um código de novo.",
        acao: "Voltar para a loja",
      };
    case "PHONE_BLOCKED":
      return {
        mensagem: `Este número está com as reservas pausadas. Fale com a gente pelo WhatsApp${c.whatsappLoja ? ` ${c.whatsappLoja}` : ""}.`,
        acao: "Abrir conversa",
      };
    case "ACTIVE_RESERVATION_EXISTS":
      return {
        mensagem: c.numeroReserva && c.horario
          ? `Você já tem a reserva #${c.numeroReserva} aberta até ${c.horario}. Conclua ou espere ela terminar para fazer outra.`
          : "Você já tem uma reserva aberta. Conclua ou espere ela terminar para fazer outra.",
        acao: c.numeroReserva ? `Ir para a reserva #${c.numeroReserva}` : "Ir para a reserva",
      };
    case "WHATSAPP_OFFLINE":
      return { mensagem: "A confirmação pelo WhatsApp está fora do ar agora. Tente de novo em alguns minutos.", acao: "Tentar de novo" };
    case "RATE_LIMITED":
      return { mensagem: "Muitas tentativas seguidas. Espere um minutinho e tente de novo." };
    case "MAX_ITEMS":
      return { mensagem: `Cabem até ${c.maxPecas ?? 9} peças por reserva.` };
    case "MAX_PER_MODEL":
      return { mensagem: `Até ${c.maxPorProduto ?? 2} peças do mesmo modelo por reserva.` };
    case "DEADLINE_PASSED":
      return { mensagem: "O prazo desta reserva acabou; não dá para começar um pagamento novo.", acao: "Ver a reserva" };
    case "METHOD_LOCKED":
      return { mensagem: "Esta reserva já começou por uma forma de pagamento; continue por ela.", acao: "Voltar ao pagamento" };
    case "PAYMENT_IN_PROGRESS":
      return { mensagem: "Já tem um pagamento em andamento. Espere a resposta do banco antes de tentar outro." };
    case "PHONE_VERIFICATION_REQUIRED":
      return { mensagem: "Para mexer na entrega, confirme que é você com um código pelo WhatsApp.", acao: "Receber código" };
    case "NOT_PAID":
      return { mensagem: "A entrega é combinada depois do pagamento confirmado.", acao: "Ir para o pagamento" };
    case "SHIPPING_ALREADY_PAID":
      return { mensagem: "O frete já foi pago, então a entrega não muda mais por aqui. Fale com a gente pelo WhatsApp." };
    case "DELIVERY_LOCKED":
      return { mensagem: "Esta etapa da entrega não está disponível agora. Atualize a página para ver o andamento." };
    case "NOT_READY":
      return { mensagem: "Para marcar como entregue, o pedido precisa estar pronto para retirada, ter saído para entrega ou ter sido enviado." };
    case "DISPUTE_OPEN":
      return { mensagem: "Há um estorno ou contestação aberto neste pagamento. Resolva a disputa antes de marcar como entregue.", acao: "Ver disputas" };
    case "QUOTE_EXPIRED":
      return { mensagem: "O prazo para pagar o frete venceu. A gente fala com você pelo WhatsApp.", acao: "Prefiro retirar na loja" };
    case "NOT_FOUND":
      return { mensagem: "Não achamos esta reserva. Confira o link ou consulte pelo seu WhatsApp.", acao: "Consultar reservas" };
    case "PHONE_INVALID":
      return { mensagem: "Confira o número: use DDD + celular com 9 dígitos." };
    case "NO_WHATSAPP":
      return { mensagem: "Este número não tem WhatsApp. Use um número com WhatsApp para receber o código." };
    case "UPSTREAM_UNAVAILABLE":
      return { mensagem: "Sem conexão com a loja agora. Sua reserva continua valendo; tente de novo em instantes.", acao: "Tentar de novo" };
    case "INVALID_CREDENTIALS":
      return { mensagem: "E-mail ou senha não conferem." };
    case "MFA_REQUIRED":
      return { mensagem: "Falta o código do aplicativo autenticador para entrar no painel.", acao: "Digitar o código" };
    case "MFA_INVALID":
      return { mensagem: "Código do autenticador errado ou vencido. Use o código que está aparecendo agora no aplicativo." };
    case "LOGIN_BLOCKED":
      return {
        mensagem: c.horario ? `Muitas senhas erradas desta rede. Tente de novo às ${c.horario}.` : "Muitas senhas erradas desta rede. Tente de novo em 15 minutos.",
      };
    case "TURNSTILE_REQUIRED":
    case "TURNSTILE_INVALID":
      return { mensagem: "Confirme que você não é um robô para continuar.", acao: "Confirmar" };
    case "STOCK_BELOW_COMMITTED":
      return {
        mensagem: c.comprometido === undefined
          ? "O estoque não pode ficar abaixo das peças já reservadas ou vendidas."
          : `O estoque não pode ficar abaixo de ${c.comprometido}, que são as peças já reservadas ou vendidas.`,
      };
    case "ALREADY_EXISTS":
      return { mensagem: "Já existe um cadastro com este endereço ou código. Escolha outro." };
    case "PRODUCT_NEEDS_IMAGE":
      return { mensagem: "Para publicar, o produto precisa de pelo menos 1 foto. Um produto publicado não fica sem foto." };
    case "IMAGE_LIMIT":
      return { mensagem: "Cada produto tem no máximo 10 fotos. Apague uma para enviar outra." };
    case "PROMOTION_OVERLAP":
      return { mensagem: "Um destes produtos já está em outro desconto no mesmo período. Mude as datas ou tire o produto." };
    case "PROMOTION_ENDED":
      return { mensagem: "Esta promoção já terminou. Para repetir, crie uma nova." };
    default:
      return { mensagem: "Algo não saiu como esperado. Tente de novo em instantes.", acao: "Tentar de novo" };
  }
}

/** Por que o cupom digitado não vale (regra 28). */
export function textoCupom(motivo: MotivoCupom | undefined, c: ContextoErro = {}): string {
  switch (motivo) {
    case "NAO_ENCONTRADO":
      return "Não achamos este cupom. Confira o código.";
    case "AGENDADO":
      return c.horario ? `Este cupom começa a valer em ${c.horario}.` : "Este cupom ainda não começou a valer.";
    case "ENCERRADO":
    case "VENCIDO":
      return "Este cupom não está mais valendo.";
    case "ESGOTADO":
      return "Este cupom esgotou.";
    case "GASTO_MINIMO":
      return c.gastoMinimoCentavos
        ? `Este cupom vale para compras a partir de ${formatarReais(c.gastoMinimoCentavos)}.`
        : "Esta compra ainda não chegou ao valor mínimo do cupom.";
    case "SEM_PRODUTOS":
      return "Este cupom não vale para as peças da sacola.";
    case "LIMITE_CLIENTE":
      return "Você já usou este cupom o máximo de vezes.";
    default:
      return "Este cupom não pode ser usado agora.";
  }
}

/** Mensagem da tela quando o aparelho fica sem internet. */
export const TEXTO_SEM_CONEXAO: TextoErro = {
  mensagem: "Sem conexão. Sua reserva continua valendo; a tela atualiza quando a internet voltar.",
  acao: "Tentar de novo",
};
