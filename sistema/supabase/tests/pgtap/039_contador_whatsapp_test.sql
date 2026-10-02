begin;
select plan(5);

-- Contador do dia (0490): fila + respostas na conversa; código que não saiu é falha
select enqueue_message('teste:1', '+5577998128809', 'mensagem_teste', '{}', 1::smallint);
update outbox_messages set status = 'ENVIADA', sent_at = app_now() where dedupe_key = 'teste:1';
insert into whatsapp_inbound (wa_message_id, from_wa_id, text, handled_as) values
  ('r1', '557798128809', 'Minha reserva', 'MINHA_RESERVA'),
  ('r2', '557798128809', 'Quero meu código (ref. K7Q2)', 'CODIGO_ENVIADO'),
  ('r3', '557798128809', 'oi', 'CONVERSA'),
  ('r4', '557798128809', 'oi de novo', 'BOAS_VINDAS'),
  ('r5', '557798128809', 'Quero meu código (ref. K7Q3)', 'FALHA_ENVIO');
insert into whatsapp_inbound (wa_message_id, from_wa_id, text, handled_as, received_at) values
  ('ontem', '557798128809', 'Minha reserva', 'MINHA_RESERVA', inicio_do_dia() - interval '1 minute');

select is((whatsapp_queue_stats() ->> 'enviadasHoje')::int, 4, 'total do dia: 1 pela fila + 3 respostas na conversa');
select is((whatsapp_queue_stats() ->> 'respostasHoje')::int, 3, 'respostas: código, minha reserva e boas-vindas (conversa sem resposta não conta)');
select is((whatsapp_queue_stats() ->> 'falhasHoje')::int, 1, 'código que não saiu conta como falha');
select is((whatsapp_queue_stats() ->> 'pendentes')::int, 0, 'nada na fila');
select ok(whatsapp_queue_stats() ? 'maisAntigaPendente', 'os campos de antes continuam');

select * from finish();
rollback;
