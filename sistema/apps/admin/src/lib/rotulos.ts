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

// Auditoria (tela 21): quem, assunto e o que aconteceu em texto; ação nova sem rótulo aparece pelo código.
export const AUTOR: Record<string, string> = { SISTEMA: "Sistema", ADMIN: "Loja", CLIENTE: "Cliente", PROVEDOR: "Provedor" };
export const ASSUNTO: Record<string, string> = {
  RESERVA: "Reserva", PAGAMENTO: "Pagamento", ESTOQUE: "Estoque", CATALOGO: "Catálogo", PROMOCAO: "Promoção",
  BLOQUEIO: "Bloqueio", WHATSAPP: "WhatsApp", ACESSO: "Acesso", OUTRO: "Outro",
};
const ACAO: Record<string, string> = {
  "tentativa.criada": "Pediu o código para reservar", "otp.enviado": "Código enviado pelo WhatsApp", "otp.verificado": "Código confirmado",
  "otp.bloqueado": "Código bloqueado por tentativas erradas", "reserva.criada": "Reserva criada", "reserva.expirada": "Reserva expirada",
  "reserva.entregue": "Pedido entregue", "tolerancia.iniciada": "Tolerância de pagamento iniciada",
  "cancelamento.solicitado": "Cancelamento pedido", "cancelamento.aprovado": "Cancelamento aprovado", "cancelamento.recusado": "Cancelamento recusado",
  "consulta.criada": "Pediu o código para consultar", "consulta.verificada": "Consulta confirmada",
  "entrega.confirmada": "Entrega escolhida", "entrega.substatus": "Andamento da entrega",
  "pagamento.tentativa": "Cobrança criada", "pagamento.confirmado": "Pagamento confirmado", "pagamento.em_analise": "Pagamento em análise",
  "pagamento.estornado": "Pagamento estornado", "pagamento.convertido": "Pagamento convertido em novo pedido", "pagamento.descartado": "Aviso de pagamento descartado",
  "pagamento.disputa": "Contestação aberta", "pagamento.disputa_resolvida": "Contestação resolvida",
  "frete.calculado": "Frete calculado", "frete.tentativa": "Cobrança do frete criada", "frete.pago": "Frete pago", "frete.vencido": "Prazo do frete vencido",
  "estoque.ajustado": "Estoque ajustado", "produto.criado": "Peça criada", "produto.editado": "Peça editada",
  "produto.foto.adicionada": "Foto adicionada", "produto.foto.editada": "Foto editada", "produto.foto.apagada": "Foto apagada", "produto.fotos.reordenadas": "Fotos reordenadas",
  "colecao.criada": "Coleção criada", "colecao.editada": "Coleção editada", "look.criado": "Look criado", "look.editado": "Look editado", "look.apagado": "Look apagado",
  "inicio.reordenado": "Página inicial reordenada", "promocao.criada": "Promoção criada", "promocao.editada": "Promoção editada", "promocao.encerrada": "Promoção encerrada",
  "telefone.bloqueado": "Telefone bloqueado", "telefone.liberado": "Telefone liberado", "telefone.bloqueio_mantido": "Bloqueio mantido",
  "whatsapp.configuracao": "Configuração do WhatsApp alterada", "metas.alteradas": "Metas de vendas alteradas", "whatsapp.teste": "Mensagem de teste enviada",
  "admin.login": "Entrou no painel", "admin.login.senha_errada": "Senha errada no login", "admin.login.bloqueado": "Login bloqueado por 15 minutos",
  "admin.senha.trocada": "Senha trocada", "admin.senha.atual_errada": "Senha atual errada ao trocar", "admin.aparelhos.encerrados": "Saiu dos outros aparelhos",
  "admin.autenticador.cadastrado": "Autenticador cadastrado", "admin.autenticador.removido": "Autenticador removido", "auth.sair": "Saiu do painel",
  "alerta.resolvido": "Alerta resolvido", "dados.purga": "Dados apagados pelo prazo de guarda",
};
export function textoAcao(acao: string): string {
  return ACAO[acao] ?? acao;
}
