begin;
select plan(29);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Loja');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Teddy', 'teddy', 'TOMATE');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'TED-01', 'teddy-1', 'Teddy Rosa', 4999, 1),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c001', 'TED-02', 'teddy-2', 'Teddy Azul', 4999, 10);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', name, 10, 10, 1 from products;
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
-- Reserva criada pelo caminho normal (tentativa verificada + create_reservation), agora no relógio atual
create function pg_temp.reservar(p_phone text, p_produto text, p_desconto int default 0, p_aplicada jsonb default null) returns jsonb language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina', p_phone, 'RETIRADA', jsonb_build_array(jsonb_build_object('produtoId', p_produto, 'qtd', 1)),
          4999 - p_desconto, s, 'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', jsonb_build_array(jsonb_build_object('produtoId', p_produto, 'qtd', 1, 'precoTabelaCentavos', 4999,
                                                   'descontoCentavos', p_desconto, 'totalCentavos', 4999 - p_desconto)),
    'subtotalCentavos', 4999, 'descontoCentavos', p_desconto, 'totalCentavos', 4999 - p_desconto, 'aplicada', p_aplicada,
    'chaveHash', pg_temp.h(v_token || 'chave'), 'link', 'https://tshirtclub.pt/r#x'));
end $$;
create function pg_temp.id(p jsonb) returns uuid language sql as $$ select (p -> 'reserva' ->> 'id')::uuid $$;
create temp table t (nome text primary key, v jsonb);

-- Cupom com orçamento, para ver tudo voltar na expiração
insert into promotions (id, type, name, starts_at, ends_at, budget_cents)
values ('00000000-0000-4000-8000-0000000000b1', 'CUPOM', 'Boas-vindas', app_now() - interval '1 day', app_now() + interval '30 days', 5000);
insert into coupons (promotion_id, code, kind, value, total_quantity, validity_days) values ('00000000-0000-4000-8000-0000000000b1', 'BEMVINDA10', 'VALOR', 1000, 10, 3);

insert into t values ('r1', pg_temp.reservar('+5577998128809', '00000000-0000-4000-8000-00000000a001', 1000,
  '{"promocaoId": "00000000-0000-4000-8000-0000000000b1", "tipo": "CUPOM", "rotulo": "Cupom BEMVINDA10"}'));
insert into cancellation_requests (reservation_id) select pg_temp.id(v) from t where nome = 'r1';

-- Lembrete de 5 minutos
select set_app_clock(interval '9 minutes');
select is((sweep_reservations() ->> 'lembretes')::int, 0, 'antes dos 10 minutos, nenhum lembrete');
select set_app_clock(interval '10 minutes 30 seconds');
select is((sweep_reservations() ->> 'lembretes')::int, 1, 'aos 10 min, o lembrete entra na fila');
select is((select valid_until from outbox_messages where template = 'reserva_lembrete_5min'),
  (select (v -> 'reserva' ->> 'expiraEm')::timestamptz - interval '1 minute' from t where nome = 'r1'), 'com validade até 1 min antes do fim (G5)');
select is((sweep_reservations() ->> 'lembretes')::int, 0, 'e não entra duas vezes');

-- Expiração (T3) aos 15 minutos
select set_app_clock(interval '15 minutes');
select is((sweep_reservations() ->> 'expiradas')::int, 1, 'aos 15 min a reserva expira');
select is((select (status, closure_reason)::text from reservations where id = (select pg_temp.id(v) from t where nome = 'r1')), '(EXPIRADO,PRAZO_ESGOTADO)', 'prazo esgotado');
select is((select qty_reserved from products where code = 'TED-01'), 0, 'o estoque volta na hora');
select is((select count(*)::int from stock_movements where kind = 'LIBERACAO'), 1, 'movimento de liberação');
select is((select array_agg(event order by id) from reservation_transitions where reservation_id = (select pg_temp.id(v) from t where nome = 'r1')), array['T1', 'T3'], 'linha do tempo T1 → T3');
select is((select (used_quantity, (select status::text from coupon_uses)) from coupons)::text, '(0,DEVOLVIDO)', 'o uso do cupom volta');
select is((select budget_used_cents from promotions where id = '00000000-0000-4000-8000-0000000000b1'), 0, 'o orçamento volta');
select is((select status from cancellation_requests), 'PREJUDICADA'::cancel_status, 'pedido de cancelamento pendente fica prejudicado (R4)');
select is((select params from outbox_messages where template = 'reserva_expirada'),
  jsonb_build_object('numero', (select (v -> 'reserva' ->> 'numero')::int from t where nome = 'r1'), 'expiradaEm', (select v -> 'reserva' -> 'expiraEm' from t where nome = 'r1')),
  'mensagem "reserva expirada" na fila');
select is((select count(*)::int from audit_log where action = 'reserva.expirada'), 1, 'expiração na auditoria');
select is(outbox_claim() ->> 'template', 'reserva_expirada', 'o lembrete da reserva que expirou é descartado, a expiração sai');
select is(expire_reservation((select pg_temp.id(v) from t where nome = 'r1'), 'PRAZO_ESGOTADO'), false, 'expirar de novo não faz nada');

-- Se a varredura só vê a reserva com menos de 1 min, o lembrete não sai (chegaria tarde)
insert into t values ('r2', pg_temp.reservar('+5571991112222', '00000000-0000-4000-8000-00000000a002'));
select set_app_clock(interval '15 minutes' + interval '14 minutes 30 seconds');
select is((sweep_reservations() ->> 'lembretes')::int, 0, 'faltando menos de 1 min, sem lembrete');

-- A peça presa numa reserva vencida (antes da varredura) fica livre para a próxima cliente
select set_app_clock(interval '1 hour');
insert into t values ('r3', pg_temp.reservar('+5575993334444', '00000000-0000-4000-8000-00000000a001'));
select set_app_clock(interval '1 hour 16 minutes');
insert into t values ('r4', pg_temp.reservar('+5579997778888', '00000000-0000-4000-8000-00000000a001'));
select is((select v -> 'reserva' ->> 'status' from t where nome = 'r4'), 'RESERVADO', 'reserva vencida é liberada na hora da próxima');
select is((select status from reservations where id = (select pg_temp.id(v) from t where nome = 'r3')), 'EXPIRADO'::reservation_status, 'e a vencida expira');
-- A própria cliente, com a reserva vencida, faz outra
select set_app_clock(interval '1 hour 32 minutes');
select is(pg_temp.reservar('+5579997778888', '00000000-0000-4000-8000-00000000a002') -> 'reserva' ->> 'status', 'RESERVADO',
  'a reserva vencida da própria cliente não conta como ativa');

-- Bloqueio: 3 expirações por prazo em 30 dias
create function pg_temp.expirar_uma(p_phone text, p_min int) returns void language plpgsql as $$
begin
  perform set_app_clock(make_interval(days => 1, mins => p_min));
  perform pg_temp.reservar(p_phone, '00000000-0000-4000-8000-00000000a002');
  perform set_app_clock(make_interval(days => 1, mins => p_min + 16));
  perform sweep_reservations();
end $$;
select pg_temp.expirar_uma('+5573995556666', 0);
select pg_temp.expirar_uma('+5573995556666', 20);
select is((select count(*)::int from phone_blocks), 0, '2 expirações ainda não bloqueiam');
select pg_temp.expirar_uma('+5573995556666', 40);
select is((select status from phone_blocks), 'ATIVO'::phone_block_status, 'a 3ª expiração em 30 dias bloqueia');
select is((select array_length(trigger_reservations, 1) from phone_blocks), 3, 'com as 3 reservas que levaram ao bloqueio');
select is(create_reservation_attempt(jsonb_build_object('nome', 'X', 'telefone', '+5573995556666', 'entrega', 'RETIRADA',
            'itens', '[{"produtoId": "00000000-0000-4000-8000-00000000a002", "qtd": 1}]'::jsonb, 'totalEsperadoCentavos', 4999,
            'tokenHash', pg_temp.h('b'))) ->> 'erro', 'PHONE_BLOCKED', 'telefone bloqueado não pede código');
select is((admin_list_phone_blocks() -> 0 ->> 'telefone'), '+5573995556666', 'o painel vê o bloqueio');

-- Manter e liberar, sempre com motivo; o contador recomeça (T14)
select throws_ok($$ select keep_phone_block((select id from phone_blocks), '00000000-0000-4000-8000-0000000000d1', '') $$, 'TS121', null, 'decisão sem motivo é recusada');
select keep_phone_block((select id from phone_blocks), '00000000-0000-4000-8000-0000000000d1', 'Conversamos e ela vai reservar só quando puder pagar');
select release_phone_block((select id from phone_blocks), '00000000-0000-4000-8000-0000000000d1', 'Cliente antiga, combinamos pelo WhatsApp');
select is((select array_agg(decision::text order by created_at) from phone_block_decisions), array['MANTER', 'LIBERAR'], 'as duas decisões ficam registradas');
select throws_ok($$ select release_phone_block((select id from phone_blocks), '00000000-0000-4000-8000-0000000000d1', 'De novo') $$,
  'TS161', null, 'não libera duas vezes');
select pg_temp.expirar_uma('+5573995556666', 60);
select is((select count(*)::int from phone_blocks where status = 'ATIVO'), 0, 'depois da liberação, a nova expiração conta como a 1ª (T14)');

select * from finish();
rollback;
