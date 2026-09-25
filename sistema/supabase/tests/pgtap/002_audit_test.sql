begin;
select plan(9);

select isnt(
  log_audit('SISTEMA', null, 'reserva.criada', 'reservation', 'r1', null, '{"itens": 3, "total_cents": 11999}'),
  null, 'registro de auditoria gravado');
select is((select count(*)::int from audit_log where action = 'reserva.criada'), 1, 'uma linha gravada');
select is((select occurred_at from audit_log where action = 'reserva.criada'), app_now(), 'hora vem do app_now()');

select throws_ok($$ update audit_log set action = 'x' $$, 'TS010', null, 'UPDATE bloqueado');
select throws_ok($$ delete from audit_log $$, 'TS010', null, 'DELETE bloqueado');
select throws_ok($$ truncate audit_log $$, 'TS010', null, 'TRUNCATE bloqueado');

select throws_ok(
  $$ select log_audit('CLIENTE', null, 'otp.pedido', 'otp_session', 's1', null, '{"telefone": "+5577998128809"}') $$,
  'TS011', null, 'telefone não entra na auditoria');
select throws_ok(
  $$ select log_audit('ADMIN', null, 'entrega.atualizada', 'fulfillment', 'f1', null, '{"antes": {"address": {"rua": "x"}}}') $$,
  'TS011', null, 'endereço aninhado também é recusado');
select throws_ok(
  $$ select log_audit('SISTEMA', null, 'Ação Inválida', 'reservation', 'r1') $$,
  '23514', null, 'nome de ação fora do padrão é recusado');

select * from finish();
rollback;
