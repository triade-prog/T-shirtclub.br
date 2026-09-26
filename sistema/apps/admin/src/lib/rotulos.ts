// Rótulos do painel para os estados do banco (textos da seção D4).
export const STATUS_RESERVA: Record<string, string> = {
  SELECIONADO: "Selecionado",
  RESERVADO: "Reservado",
  PAGAMENTO_CONFIRMADO: "Pago",
  ENTREGUE: "Entregue",
  EXPIRADO: "Expirado",
};

export const SUBSTATUS: Record<string, string> = {
  AGUARDANDO_MODALIDADE: "Aguardando a escolha da entrega",
  AGUARDANDO_CALCULO_FRETE: "Calcular o frete",
  AGUARDANDO_PAGAMENTO_FRETE: "Frete aguardando pagamento",
  FRETE_VENCIDO: "Prazo do frete vencido",
  EM_PREPARACAO: "Em preparação",
  PRONTO_PARA_RETIRADA: "Pronto para retirada",
  SAIU_PARA_ENTREGA: "Saiu para entrega",
  ENVIADO: "Enviado",
};

export const MODALIDADE: Record<string, string> = { RETIRADA: "Retirada na loja", MOTOBOY: "Motoboy", ENVIO: "Envio" };

export const STATUS_PAGAMENTO: Record<string, string> = {
  CRIADO: "Criado", PENDENTE: "Pendente", APROVADO: "Aprovado", RECUSADO: "Recusado", CANCELADO: "Cancelado",
  FALHOU: "Falhou", EM_ANALISE: "Em análise", ESTORNADO: "Estornado",
};

export const MOTIVO_ENCERRAMENTO: Record<string, string> = { PRAZO_ESGOTADO: "prazo esgotado", CANCELAMENTO_APROVADO: "cancelamento aprovado" };
