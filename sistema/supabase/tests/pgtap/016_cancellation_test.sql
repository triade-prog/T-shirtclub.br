begin;
select plan(20);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Loja');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999, 20);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-00000000a001', 'produtos/lim-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.reservar(p_phone text) returns uuid language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina', p_phone, 'RETIRADA', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999, s,
          'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return (create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1, "precoTabelaCentavos": 4999, "descontoCentavos": 0, "totalCentavos": 4999}]'::jsonb,
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'totalCentavos', 4999, 'aplicada', null,
    'chaveHash', pg_temp.h(v_token || 'k'), 'link', 'https://tshirtclub.pt/r#x')) -> 'reserva' ->> 'id')::uuid;
end $$;
create function pg_temp.pedido(p_reserva uuid) returns uuid language sql as $$
  select id from cancellation_requests where reservation_id = p_reserva order by status = 'PENDENTE' desc, requested_at desc limit 1
$$;
create temp table t (nome text primary key, id uuid);

-- Pedido da cliente
insert into t values ('r1', pg_temp.reservar('+5577998128809'));
select is(request_cancellation((select id from t where nome = 'r1'), '+5577998128809', 'Escolhi o tamanho errado') -> 'cancelamento' ->> 'status',
  'PENDENTE', 'a cliente pede o cancelamento');
select is(request_cancellation((select id from t where nome = 'r1'), '+5577998128809') ->> 'erro', 'ALREADY_REQUESTED', 'um pedido pendente por vez');
select is(request_cancellation((select id from t where nome = 'r1'), '+5571999999999') ->> 'erro', 'NOT_FOUND', 'de outro telefone, a reserva não existe (404)');
select is(reservation_for_customer((select id from t where nome = 'r1'), '+5577998128809') -> 'cancelamento' ->> 'status', 'PENDENTE',
  'a tela da reserva mostra que aguarda a loja');
select is((select status from reservations where id = (select id from t where nome = 'r1')), 'RESERVADO'::reservation_status, 'o relógio não para');

-- Recusa: a reserva segue no prazo original
select throws_ok(format($$ select reject_cancellation(%L, '00000000-0000-4000-8000-0000000000d1', '') $$, pg_temp.pedido((select id from t where nome = 'r1'))),
  'TS121', null, 'decisão sem motivo é recusada');
select is(reject_cancellation(pg_temp.pedido((select id from t where nome = 'r1')), '00000000-0000-4000-8000-0000000000d1', 'Troca é feita na loja depois de pago') ->> 'status',
  'RECUSADA', 'a loja recusa com motivo');
select is((select status from reservations where id = (select id from t where nome = 'r1')), 'RESERVADO'::reservation_status, 'e a reserva continua valendo');
select throws_ok(format($$ select approve_cancellation(%L, '00000000-0000-4000-8000-0000000000d1', 'Mudou de ideia') $$, pg_temp.pedido((select id from t where nome = 'r1'))),
  'TS161', null, 'pedido já decidido não se decide de novo');

-- Aprovação (T4): expira com motivo próprio e devolve o estoque
select is(request_cancellation((select id from t where nome = 'r1'), '+5577998128809') -> 'cancelamento' ->> 'status', 'PENDENTE', 'depois da recusa, pode pedir de novo');
select is(approve_cancellation(pg_temp.pedido((select id from t where nome = 'r1')), '00000000-0000-4000-8000-0000000000d1', 'Cliente pediu pelo WhatsApp') ->> 'status',
  'APROVADA', 'a loja aprova com motivo');
select is((select (status, closure_reason)::text from reservations where id = (select id from t where nome = 'r1')), '(EXPIRADO,CANCELAMENTO_APROVADO)',
  'termina em EXPIRADO com motivo "cancelamento aprovado" (R1)');
select is((select array_agg(event order by id) from reservation_transitions where reservation_id = (select id from t where nome = 'r1')), array['T1', 'T4'], 'linha do tempo T1 → T4');
select is((select qty_reserved from products), 0, 'o estoque volta');
select is((select count(*)::int from outbox_messages where template = 'reserva_expirada'), 0, 'sem a mensagem de reserva expirada por prazo');

-- Cancelamento aprovado não conta para o bloqueio (D7)
do $$
declare v uuid;
begin
  for i in 1 .. 3 loop
    v := pg_temp.reservar('+5575993334444');
    perform request_cancellation(v, '+5575993334444');
    perform approve_cancellation(pg_temp.pedido(v), '00000000-0000-4000-8000-0000000000d1', 'Pedido da cliente');
  end loop;
end $$;
select is((select count(*)::int from phone_blocks), 0, '3 cancelamentos aprovados não bloqueiam');

-- Prejudicado: pago antes da decisão
insert into t values ('r2', pg_temp.reservar('+5579997778888'));
select request_cancellation((select id from t where nome = 'r2'), '+5579997778888');
insert into t values ('p2', (register_payment_attempt((select id from t where nome = 'r2'), '+5579997778888', 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid);
select apply_payment_result((select id from t where nome = 'p2'), jsonb_build_object('status', 'APROVADO', 'aprovadoEm', app_now(), 'valorCentavos', 4999,
  'moeda', 'BRL', 'referencia', (select id from t where nome = 'p2')::text, 'statusProvedor', 'approved'));
select is((select status from cancellation_requests where reservation_id = (select id from t where nome = 'r2')), 'PREJUDICADA'::cancel_status,
  'pago antes da decisão: o pedido fica prejudicado (R4)');
select throws_ok(format($$ select approve_cancellation(%L, '00000000-0000-4000-8000-0000000000d1', 'Tarde') $$, pg_temp.pedido((select id from t where nome = 'r2'))),
  'TS161', null, 'e não se aprova mais');
select is(request_cancellation((select id from t where nome = 'r2'), '+5579997778888') ->> 'erro', 'RESERVATION_NOT_ACTIVE', 'depois de pago é pós-venda, não cancelamento');
select is(jsonb_array_length(admin_list_cancellation_requests(null)), 6, 'o painel vê todos os pedidos');

select * from finish();
rollback;
