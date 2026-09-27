begin;
select plan(6);

-- Uma mensagem que já falhou (espera 15 min) e uma nova (ainda sem tentativa)
select enqueue_message('teste:falhou', '+5577998128809', 'mensagem_teste', '{}', 2::smallint);
select enqueue_message('teste:nova', '+5577998128809', 'mensagem_teste', '{}', 2::smallint, p_valid_until => app_now() + interval '1 hour');
update outbox_messages set attempts = 3, next_attempt_at = app_now() + interval '15 minutes' where dedupe_key = 'teste:falhou';
update outbox_messages set next_attempt_at = app_now() + interval '10 minutes' where dedupe_key = 'teste:nova';

select is(whatsapp_connection_seen(true), 0, 'primeira conexão vista: nada a liberar');
select is(whatsapp_connection_seen(false), 0, 'caiu: só registra');
select is(whatsapp_connection_seen(false), 0, 'continua caída: nada muda');
select is(whatsapp_connection_seen(true), 1, 'voltou: libera a que falhou');
select ok((select next_attempt_at <= app_now() from outbox_messages where dedupe_key = 'teste:falhou'), 'a que falhou fica pronta na hora');
select ok((select next_attempt_at > app_now() from outbox_messages where dedupe_key = 'teste:nova'), 'a que nunca tentou segue no horário dela');

select * from finish();
rollback;
