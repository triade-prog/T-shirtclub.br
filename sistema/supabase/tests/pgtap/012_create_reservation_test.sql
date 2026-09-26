begin;
select plan(27);

insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999, 5),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c001', 'LIM-02', 'limone-2', 'Limone Capri', 4999, 1);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', name, 10, 10, 1 from products;
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
-- Tentativa já verificada pelo código (o fluxo do código tem o próprio teste, 011)
create function pg_temp.verificada(p_phone text, p_token text, p_itens jsonb, p_total int, p_cupom text default null) returns uuid language plpgsql as $$
declare s uuid; a uuid;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, coupon_code, expected_total_cents,
                                    otp_session_id, status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina Souza', p_phone, 'RETIRADA', p_itens, p_cupom, p_total, s, 'VERIFICADA',
          app_now() + interval '10 minutes', pg_temp.h(p_token))
  returning id into a;
  return a;
end $$;
-- Linhas no formato do motor de preço, sem desconto
create function pg_temp.linhas(p_itens jsonb, p_preco int default 4999, p_aplicada jsonb default null, p_desconto int default 0) returns jsonb language sql as $$
  select jsonb_build_object(
    'linhas', (select jsonb_agg(jsonb_build_object('produtoId', x ->> 'produtoId', 'qtd', (x ->> 'qtd')::int, 'precoTabelaCentavos', p_preco,
                                                  'descontoCentavos', case when ord = 1 then p_desconto else 0 end,
                                                  'totalCentavos', p_preco * (x ->> 'qtd')::int - case when ord = 1 then p_desconto else 0 end))
                 from jsonb_array_elements(p_itens) with ordinality y(x, ord)),
    'subtotalCentavos', (select sum(p_preco * (x ->> 'qtd')::int) from jsonb_array_elements(p_itens) x),
    'descontoCentavos', p_desconto,
    'totalCentavos', (select sum(p_preco * (x ->> 'qtd')::int) from jsonb_array_elements(p_itens) x) - p_desconto,
    'aplicada', p_aplicada,
    'chaveHash', pg_temp.h(gen_random_uuid()::text),
    'link', 'https://tshirtclub.pt/r#chave')
$$;
create temp table t (nome text primary key, v jsonb);

-- Reserva criada
insert into t select 'itens1', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 2}]';
insert into t select 'a1', to_jsonb(pg_temp.verificada('+5577998128809', 'n1', (select v from t where nome = 'itens1'), 9998));
insert into t select 'r1', create_reservation((select v #>> '{}' from t where nome = 'a1')::uuid, pg_temp.h('n1'),
                                              pg_temp.linhas((select v from t where nome = 'itens1')));
select is((select v -> 'reserva' ->> 'numero' from t where nome = 'r1'), '1001', 'primeira reserva é a #1001');
select is((select v -> 'reserva' ->> 'status' from t where nome = 'r1'), 'RESERVADO', 'nasce em RESERVADO');
select is((select (v -> 'reserva' ->> 'expiraEm')::timestamptz from t where nome = 'r1'), app_now() + interval '15 minutes', 'prazo de 15 minutos pelo relógio do banco');
select is((select qty_reserved from products where code = 'LIM-01'), 2, 'estoque reservado');
select is((select sum(qty)::int from stock_movements where kind = 'RESERVA'), 2, 'movimento de reserva gravado');
select is((select event from reservation_transitions), 'T1', 'linha do tempo começa em T1');
select is((select params ->> 'link' from outbox_messages where template = 'reserva_criada'), 'https://tshirtclub.pt/r#chave', 'mensagem "reserva criada" na fila, com o link');
select is((select priority from outbox_messages where template = 'reserva_criada'), 1::smallint, 'com prioridade 1');
select is((select status from reservation_attempts where id = (select v #>> '{}' from t where nome = 'a1')::uuid), 'CONVERTIDA'::attempt_status, 'tentativa convertida');
select is((select count(*)::int from audit_log where action = 'reserva.criada'), 1, 'criação na auditoria');

-- Duplo clique: a mesma reserva, sem reservar de novo
select is(create_reservation((select v #>> '{}' from t where nome = 'a1')::uuid, pg_temp.h('n1'), pg_temp.linhas((select v from t where nome = 'itens1'))) ->> 'repetida',
  'true', 'confirmar de novo devolve a mesma reserva');
select is((select qty_reserved from products where code = 'LIM-01'), 2, 'e não reserva de novo');

-- Uma ativa por telefone
insert into t select 'a2', to_jsonb(pg_temp.verificada('+5577998128809', 'n2', '[{"produtoId": "00000000-0000-4000-8000-00000000a002", "qtd": 1}]', 4999));
select is(create_reservation((select v #>> '{}' from t where nome = 'a2')::uuid, pg_temp.h('n2'),
                             pg_temp.linhas('[{"produtoId": "00000000-0000-4000-8000-00000000a002", "qtd": 1}]')) -> 'detalhes' ->> 'numeroReserva',
  '1001', 'com uma reserva ativa, não cria outra');
select throws_ok($$ insert into reservations (access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent, subtotal_cents, total_cents, expires_at)
                    select repeat('a', 64), customer_id, phone_e164, 'X', 'RESERVADO', 'RETIRADA', 1, 1, app_now() + interval '1 minute' from reservations $$,
  '23505', null, 'o banco garante uma reserva ativa por telefone');

-- T2: 1 item sem estoque → nada reservado, erro lista o item
insert into t select 'itens3', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}, {"produtoId": "00000000-0000-4000-8000-00000000a002", "qtd": 2}]';
insert into t select 'a3', to_jsonb(pg_temp.verificada('+5571991112222', 'n3', (select v from t where nome = 'itens3'), 14997));
insert into t select 'r3', create_reservation((select v #>> '{}' from t where nome = 'a3')::uuid, pg_temp.h('n3'), pg_temp.linhas((select v from t where nome = 'itens3')));
select is((select v ->> 'erro' from t where nome = 'r3'), 'STOCK_UNAVAILABLE', 'item sem estoque: nenhuma reserva');
select is((select v -> 'detalhes' -> 'produtos' from t where nome = 'r3'), '["Limone Capri"]'::jsonb, 'o erro diz qual peça acabou');
select is((select qty_reserved from products where code = 'LIM-01'), 2, 'nenhum estoque alterado');
select is(attempt_update_items((select v #>> '{}' from t where nome = 'a3')::uuid, pg_temp.h('n3'),
                               '{"itens": [{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}], "totalEsperadoCentavos": 4999}') ->> 'ok',
  'true', 'ajusta a sacola sem pedir outro código (R8)');
select is(create_reservation((select v #>> '{}' from t where nome = 'a3')::uuid, pg_temp.h('n3'),
                             pg_temp.linhas('[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]')) -> 'reserva' ->> 'status',
  'RESERVADO', 'e confirma');

-- Preço mudou
insert into t select 'a4', to_jsonb(pg_temp.verificada('+5575993334444', 'n4', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999));
select is(create_reservation((select v #>> '{}' from t where nome = 'a4')::uuid, pg_temp.h('n4'),
                             pg_temp.linhas('[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 3999)) ->> 'erro',
  'PRICE_CHANGED', 'preço de tabela diferente do atual');
update products set price_cents = 5999 where code = 'LIM-01';
select is(create_reservation((select v #>> '{}' from t where nome = 'a4')::uuid, pg_temp.h('n4'),
                             pg_temp.linhas('[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 5999)) -> 'detalhes' ->> 'totalCentavos',
  '5999', 'total diferente do que a cliente viu: devolve o novo total');
update products set price_cents = 4999 where code = 'LIM-01';

-- Cupom: preso na reserva e limite por cliente
insert into promotions (id, type, name, starts_at, ends_at) values ('00000000-0000-4000-8000-0000000000b1', 'CUPOM', 'Boas-vindas', app_now() - interval '1 day', app_now() + interval '1 day');
insert into coupons (promotion_id, code, kind, value, total_quantity, validity_days) values ('00000000-0000-4000-8000-0000000000b1', 'BEMVINDA10', 'VALOR', 1000, 10, 3);
insert into t select 'a5', to_jsonb(pg_temp.verificada('+5573995556666', 'n5', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 3999, 'BEMVINDA10'));
select is(create_reservation((select v #>> '{}' from t where nome = 'a5')::uuid, pg_temp.h('n5'),
  pg_temp.linhas('[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999,
                 '{"promocaoId": "00000000-0000-4000-8000-0000000000b1", "tipo": "CUPOM", "rotulo": "Cupom BEMVINDA10"}', 1000)) -> 'reserva' ->> 'descontoCentavos',
  '1000', 'reserva com o cupom');
select is((select (used_quantity, (select status::text from coupon_uses)) from coupons)::text, '(1,PRESO)', 'uso do cupom fica preso na reserva');
select is(pricing_customer('+5573995556666', 'bemvinda10') ->> 'usosDoCupom', '1', 'o motor sabe que a cliente já usou o cupom');

-- Guardas: sem código, outro navegador, telefone bloqueado
insert into t select 'a6', to_jsonb(pg_temp.verificada('+5579997778888', 'n6', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999));
select is(create_reservation((select v #>> '{}' from t where nome = 'a6')::uuid, pg_temp.h('outro'), pg_temp.linhas('[]')) ->> 'erro',
  'NOT_FOUND', 'outro navegador não confirma a tentativa');
update reservation_attempts set verified_until = app_now() - interval '1 second' where id = (select v #>> '{}' from t where nome = 'a6')::uuid;
select is(create_reservation((select v #>> '{}' from t where nome = 'a6')::uuid, pg_temp.h('n6'),
                             pg_temp.linhas('[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]')) ->> 'erro',
  'ATTEMPT_NOT_VERIFIED', 'passados os 10 minutos, pede o código de novo');

-- A cliente vê só a própria reserva
select is(reservation_for_customer((select (v -> 'reserva' ->> 'id')::uuid from t where nome = 'r1'), '+5571991112222'), null,
  'reserva de outro telefone não aparece (404)');

select * from finish();
rollback;
