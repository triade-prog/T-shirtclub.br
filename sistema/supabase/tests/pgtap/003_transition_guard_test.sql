begin;
select plan(13);

-- Uma cliente e um jeito curto de inserir a reserva (as demais colunas não importam aqui).
insert into customers (id, phone_e164) values ('00000000-0000-4000-8000-0000000000c1', '+5577998128809');
create function pg_temp.inserir_reserva(p_number int, p_status reservation_status) returns void language sql as $f$
  insert into reservations (id, number, access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent,
                            subtotal_cents, total_cents, expires_at)
  values (case when p_number = 1001 then '00000000-0000-4000-8000-000000000001'::uuid else gen_random_uuid() end,
          p_number, encode(extensions.digest(p_number::text, 'sha256'), 'hex'), '00000000-0000-4000-8000-0000000000c1',
          '+5577998128809', 'Marina', p_status, 'RETIRADA', 4999, 4999, app_now() + interval '15 minutes')
$f$;

select ok(reservation_transition_allowed('RESERVADO', 'PAGAMENTO_CONFIRMADO'), 'T2 permitida');
select ok(reservation_transition_allowed('RESERVADO', 'EXPIRADO'), 'T3/T4 permitida');
select ok(reservation_transition_allowed('PAGAMENTO_CONFIRMADO', 'ENTREGUE'), 'T5 permitida');

select throws_ok($$ select pg_temp.inserir_reserva(1001, 'RESERVADO') $$, 'TS024', null, 'sem contexto não cria');
select set_transition_context('T1', 'CLIENTE');
select throws_ok($$ select pg_temp.inserir_reserva(1001, 'PAGAMENTO_CONFIRMADO') $$, 'TS021', null, 'reserva nasce em RESERVADO');
select pg_temp.inserir_reserva(1001, 'RESERVADO');
select is((select count(*)::int from reservation_transitions where event = 'T1' and from_status = 'SELECIONADO'), 1, 'T1 registrada na linha do tempo');

select set_transition_context('T2', 'PROVEDOR');
update reservations set status = 'PAGAMENTO_CONFIRMADO' where number = 1001;
select is((select to_status from reservation_transitions where event = 'T2'), 'PAGAMENTO_CONFIRMADO'::reservation_status, 'T2 registrada');

select throws_ok($$ update reservations set status = 'EXPIRADO' where number = 1001 $$, 'TS023', null, 'PAGAMENTO_CONFIRMADO → EXPIRADO proibida');
select throws_ok($$ update reservations set status = 'RESERVADO' where number = 1001 $$, 'TS023', null, 'PAGAMENTO_CONFIRMADO → RESERVADO proibida');
select throws_ok($$ update reservations set number = 2002 where number = 1001 $$, 'TS022', null, 'número não muda');

select set_transition_context('T5', 'ADMIN', '00000000-0000-4000-8000-0000000000aa', 'retirada na loja');
update reservations set status = 'ENTREGUE' where number = 1001;
select throws_ok($$ update reservations set status = 'EXPIRADO' where number = 1001 $$, 'TS023', null, 'nada sai de ENTREGUE');
select is(
  (select array_agg(event order by id) from reservation_transitions),
  array['T1', 'T2', 'T5'], 'linha do tempo completa, na ordem');

select throws_ok($$ select set_transition_context('drop table x;', 'SISTEMA') $$, 'TS020', null, 'evento com formato inválido é recusado');

select * from finish();
rollback;
