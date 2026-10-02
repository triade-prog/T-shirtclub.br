-- Contador de mensagens do WhatsApp (02/10): "enviadas hoje" contava só a fila. As respostas na
-- própria conversa (código, minha reserva, ofertas, trocas, boas-vindas e os avisos de número
-- diferente, referência inválida e bloqueio) saem direto pelo webhook-whatsapp, sem passar pela
-- fila, e ficavam de fora: no teste da Wafly, o painel mostrava 1 com 2 mensagens enviadas.
-- Agora o total soma as duas, respostasHoje mostra a parte da conversa e o código que não
-- saiu (FALHA_ENVIO) entra nas falhas. Cada resposta conta uma vez por mensagem recebida.

create or replace function whatsapp_queue_stats() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with respostas as (
    select count(*) filter (where handled_as in ('CODIGO_ENVIADO', 'MINHA_RESERVA', 'OFERTAS', 'TROCAS', 'BOAS_VINDAS',
                                                  'NUMERO_DIFERENTE', 'REFERENCIA_INVALIDA', 'BLOQUEADO')) as enviadas,
           count(*) filter (where handled_as = 'FALHA_ENVIO') as falhas
      from whatsapp_inbound
     where received_at >= inicio_do_dia()
  )
  select jsonb_build_object(
    'pendentes', (select count(*) from outbox_messages where status in ('PENDENTE', 'ENVIANDO')),
    'enviadasHoje', (select count(*) from outbox_messages where sent_at >= inicio_do_dia()) + (select enviadas from respostas),
    'respostasHoje', (select enviadas from respostas),
    'falhasHoje', (select count(*) from outbox_messages where status = 'FALHOU' and created_at >= inicio_do_dia()) + (select falhas from respostas),
    'descartadasHoje', (select count(*) from outbox_messages where status = 'DESCARTADA' and created_at >= inicio_do_dia()),
    'maisAntigaPendente', (select min(created_at) from outbox_messages where status = 'PENDENTE'))
$$;

call lock_down_public();
