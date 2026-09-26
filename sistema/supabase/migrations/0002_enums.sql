-- 0002 · Enums (seção 04 do desenho técnico)

-- SELECIONADO existe só para a tentativa e a auditoria; nenhuma linha de reservations o usa.
create type reservation_status as enum ('SELECIONADO', 'RESERVADO', 'PAGAMENTO_CONFIRMADO', 'ENTREGUE', 'EXPIRADO');
create type closure_reason as enum ('PRAZO_ESGOTADO', 'CANCELAMENTO_APROVADO');
create type delivery_mode as enum ('RETIRADA', 'MOTOBOY', 'ENVIO');
create type fulfillment_substatus as enum (
  'AGUARDANDO_MODALIDADE', 'AGUARDANDO_CALCULO_FRETE', 'AGUARDANDO_PAGAMENTO_FRETE',
  'FRETE_VENCIDO', 'EM_PREPARACAO', 'PRONTO_PARA_RETIRADA', 'SAIU_PARA_ENTREGA', 'ENVIADO'
);
create type payment_purpose as enum ('PRODUTOS', 'FRETE');
create type payment_method as enum ('PIX', 'CARTAO');
create type payment_status as enum ('CRIADO', 'PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO', 'FALHOU', 'EM_ANALISE', 'ESTORNADO');
create type review_reason as enum ('APROVADO_APOS_TOLERANCIA', 'RESERVA_ENCERRADA', 'VALOR_DIVERGENTE');
create type cancel_status as enum ('PENDENTE', 'APROVADA', 'RECUSADA', 'PREJUDICADA');
create type otp_purpose as enum ('RESERVA', 'CONSULTA');
create type stock_movement_kind as enum ('ENTRADA', 'AJUSTE', 'RESERVA', 'LIBERACAO', 'VENDA');
create type actor_type as enum ('CLIENTE', 'ADMIN', 'SISTEMA', 'PROVEDOR');

-- Catálogo (D20): a cor da coleção vem de uma lista já validada quanto a contraste.
create type collection_color as enum ('TOMATE', 'LIMAO', 'MEDITERRANEO', 'LAVANDA', 'MENTA');
create type product_image_kind as enum ('FRENTE', 'COSTAS', 'DETALHE', 'VESTIDA', 'CAMPANHA');
create type home_block_kind as enum ('CAMPANHA', 'NOVIDADES', 'COLECOES', 'LOOKS', 'MONTE_SEU_CLUB', 'PRODUTOS');

-- Promoções (seção 05b, D19).
create type promotion_type as enum ('DESCONTO_PRODUTO', 'COMPRE_MAIS', 'CUPOM');
create type buy_more_mode as enum ('NIVEIS', 'PRECO_POR_GRUPO');
create type promotion_scope as enum ('TODOS', 'ESPECIFICOS');
create type product_discount_kind as enum ('PERCENTUAL', 'PRECO_FIXO');
create type coupon_kind as enum ('VALOR', 'PERCENTUAL');
create type coupon_use_status as enum ('PRESO', 'USADO', 'DEVOLVIDO');

-- Clientes, código do WhatsApp e tentativas (seção 04, F3).
create type otp_session_status as enum ('ABERTA', 'VERIFICADA', 'BLOQUEADA', 'ENCERRADA');
create type otp_code_status as enum ('ATIVO', 'USADO', 'ESGOTADO', 'VENCIDO', 'SUBSTITUIDO');
create type attempt_status as enum ('AGUARDANDO_VALIDACAO', 'VERIFICADA', 'CONVERTIDA', 'FALHOU_ESTOQUE', 'ABANDONADA');

-- Bloqueio de telefone por abuso (seção 09) e fila de mensagens (seção 10).
create type phone_block_status as enum ('ATIVO', 'LIBERADO');
create type phone_block_decision as enum ('LIBERAR', 'MANTER');
create type outbox_status as enum ('PENDENTE', 'ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU', 'DESCARTADA');
