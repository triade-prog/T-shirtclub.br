begin;
select plan(13);

-- Tabelas mínimas só para o teste (as de verdade chegam na migration 0030, F4).
create table reservations (
  id uuid primary key default gen_random_uuid(),
  number integer not null,
  status reservation_status not null
);
create table reservation_transitions (
  id bigserial primary key,
  reservation_id uuid not null,
  from_status reservation_status not null,
  to_status reservation_status not null,
  event text not null,
  actor_type actor_type not null,
  actor_id uuid,
  reason text,
  created_at timestamptz not null
);
create trigger trg_reservation_transition_guard before insert or update on reservations
  for each row execute function trg_reservation_transition_guard();

select ok(reservation_transition_allowed('RESERVADO', 'PAGAMENTO_CONFIRMADO'), 'T2 permitida');
select ok(reservation_transition_allowed('RESERVADO', 'EXPIRADO'), 'T3/T4 permitida');
select ok(reservation_transition_allowed('PAGAMENTO_CONFIRMADO', 'ENTREGUE'), 'T5 permitida');

select throws_ok($$ insert into reservations (number, status) values (1001, 'RESERVADO') $$, 'TS024', null, 'sem contexto não cria');
select set_transition_context('T1', 'CLIENTE');
select throws_ok($$ insert into reservations (number, status) values (1001, 'PAGAMENTO_CONFIRMADO') $$, 'TS021', null, 'reserva nasce em RESERVADO');
insert into reservations (id, number, status) values ('00000000-0000-4000-8000-000000000001', 1001, 'RESERVADO');
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
