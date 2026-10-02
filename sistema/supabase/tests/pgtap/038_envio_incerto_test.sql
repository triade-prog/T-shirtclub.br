begin;
select plan(8);

-- Envio incerto (0480): sem nova tentativa automática, para não duplicar a mensagem
create function pg_temp.enviando(p_chave text) returns uuid language sql as $$
  select enqueue_message(p_chave, '+5577998128809', 'reserva_criada', '{"nome": "Marina", "link": "https://x/r#k"}', 1::smallint);
  update outbox_messages set status = 'ENVIANDO', attempts = 1, claimed_at = app_now() where dedupe_key = p_chave;
  select id from outbox_messages where dedupe_key = p_chave
$$;

select is((select count(*)::int from pg_proc where proname = 'outbox_result'), 1, 'uma só outbox_result (sem sobrecarga ambígua no PostgREST)');

select outbox_result(pg_temp.enviando('incerto:1'), false, p_error => 'wafly.com.br sem resposta (TimeoutError)', p_retry => false);
select is((select status::text from outbox_messages where dedupe_key = 'incerto:1'), 'FALHOU', 'incerta vai direto para FALHOU, sem nova tentativa');
select is((select last_error from outbox_messages where dedupe_key = 'incerto:1'), 'wafly.com.br sem resposta (TimeoutError)', 'com o motivo para a equipe');
select is((select params from outbox_messages where dedupe_key = 'incerto:1'), '{"nome": "Marina"}'::jsonb, 'e sem o link com a chave');

select outbox_result(pg_temp.enviando('recusada:1'), false, p_error => 'wafly.com.br respondeu 401');
select is((select status::text from outbox_messages where dedupe_key = 'recusada:1'), 'PENDENTE', 'recusa clara volta para a fila (como antes)');
select ok((select next_attempt_at > app_now() from outbox_messages where dedupe_key = 'recusada:1'), 'com espera antes da nova tentativa');

select outbox_result(pg_temp.enviando('ok:1'), true, 'w1');
select is((select status::text || ':' || provider_message_id from outbox_messages where dedupe_key = 'ok:1'), 'ENVIADA:w1', 'enviada guarda o id da ferramenta');

select outbox_result((select id from outbox_messages where dedupe_key = 'ok:1'), false, p_retry => false);
select is((select status::text from outbox_messages where dedupe_key = 'ok:1'), 'ENVIADA', 'resultado de mensagem que não está saindo não muda nada');

select * from finish();
rollback;
