begin;
select plan(41);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c001', 'LIM-02', 'limone-2', 'Pomodoro', 4999);
update product_variants v set qty_total = case p.code when 'LIM-01' then 5 else 2 end from products p where p.id = v.product_id and v.size = 'UNICO';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', 'Frente', 10, 10, 1 from products;
update products set published_at = app_now();

create temp table t (nome text primary key, id uuid);
create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
-- Uma linha sem promoção: preço de tabela, desconto manual da linha e total
create function pg_temp.linha(p_produto text, p_qtd integer, p_manual integer default 0) returns jsonb language sql as $$
  select jsonb_build_object('produtoId', p_produto, 'varianteId', testes.unico(p_produto::uuid), 'qtd', p_qtd, 'precoTabelaCentavos', 4999,
                            'descontoPromoCentavos', 0, 'descontoManualCentavos', p_manual, 'descontoCentavos', p_manual,
                            'totalCentavos', 4999 * p_qtd - p_manual)
$$;
create function pg_temp.manual(p_telefone text, p_pagamento text, p_linhas jsonb, p_entrega text default 'RETIRADA',
                               p_manual integer default 0, p_motivo text default null, p_admin uuid default '00000000-0000-4000-8000-0000000000d1')
returns jsonb language sql as $$
  select admin_create_reservation(p_admin, jsonb_build_object(
    'nome', 'Ana Paula', 'telefone', p_telefone, 'entrega', p_entrega, 'pagamento', p_pagamento, 'linhas', p_linhas,
    'subtotalCentavos', (select sum((x ->> 'precoTabelaCentavos')::int * (x ->> 'qtd')::int) from jsonb_array_elements(p_linhas) x),
    'descontoCentavos', 0, 'descontoManualCentavos', p_manual, 'motivoDesconto', p_motivo,
    'totalCentavos', (select sum((x ->> 'totalCentavos')::int) from jsonb_array_elements(p_linhas) x),
    'aplicada', null, 'chaveHash', pg_temp.h(gen_random_uuid()::text), 'link', 'https://tshirtclub.vercel.app/r#abc'))
$$;
\set admin '''00000000-0000-4000-8000-0000000000d1'''

-- ── Pelo link: nasce RESERVADO, com o prazo da reserva manual e a mensagem com o link ──
insert into t select 'link', (pg_temp.manual('+5577998128809', 'LINK', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1))) -> 'reserva' ->> 'id')::uuid;
select is((select status::text from reservations where id = (select id from t where nome = 'link')), 'RESERVADO', 'pelo link: reserva aberta');
select is((select (channel, created_by)::text from reservations where id = (select id from t where nome = 'link')),
  '(PAINEL,00000000-0000-4000-8000-0000000000d1)', 'guarda o canal e quem cadastrou');
select ok((select expires_at - created_at between interval '59 minutes' and interval '61 minutes' from reservations where id = (select id from t where nome = 'link')),
  'prazo de 60 minutos (reserva_manual_minutos)');
select is((select payment_method from reservations where id = (select id from t where nome = 'link')), null, 'a forma de pagamento fica para a cliente');
select is((select (qty_reserved, qty_sold)::text from product_variants where id = testes.unico('00000000-0000-4000-8000-00000000a001')), '(1,0)',
  'segura a peça como a reserva do site');
select is((select (kind, actor_type, actor_id)::text from stock_movements where reservation_id = (select id from t where nome = 'link')),
  '(RESERVA,ADMIN,00000000-0000-4000-8000-0000000000d1)', 'o movimento de estoque é da loja');
select is((select params ->> 'link' from outbox_messages where reservation_id = (select id from t where nome = 'link') and template = 'reserva_criada'),
  'https://tshirtclub.vercel.app/r#abc', 'a cliente recebe a reserva criada com o link');
select is((select (event, actor_type)::text from reservation_transitions where reservation_id = (select id from t where nome = 'link')),
  '(T1,ADMIN)', 'transição T1 pela loja');
select is((select data ->> 'pagamento' from audit_log where action = 'reserva.manual' and reservation_id = (select id from t where nome = 'link')),
  'LINK', 'auditoria da reserva manual');
select is(reservation_json((select r from reservations r where id = (select id from t where nome = 'link'))) ->> 'canal', 'PAINEL', 'a reserva diz o canal');

-- Mesmas regras do site para o link
select is(pg_temp.manual('+5577998128809', 'LINK', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a002', 1))) ->> 'erro',
  'ACTIVE_RESERVATION_EXISTS', 'uma reserva aberta por telefone');
select is(pg_temp.manual('+5577991112222', 'LINK', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a002', 3))) ->> 'erro',
  'MAX_PER_MODEL', 'pelo link vale o limite por peça');
insert into customers (phone_e164) values ('+5577993334444');
insert into phone_blocks (customer_id) select id from customers where phone_e164 = '+5577993334444';
select is(pg_temp.manual('+5577993334444', 'LINK', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a002', 1))) ->> 'erro',
  'PHONE_BLOCKED', 'telefone bloqueado não recebe reserva pelo link');

-- ── Já paga: nasce paga, baixa o estoque e a retirada vai para a preparação ──
select is(pg_temp.manual('+5577993334444', 'DINHEIRO', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a002', 3))) ->> 'erro',
  'MAX_PER_MODEL', 'o limite por peça vale também na venda já paga');
insert into t select 'pago', (pg_temp.manual('+5577993334444', 'DINHEIRO', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a002', 2))) -> 'reserva' ->> 'id')::uuid;
select is((select (status, payment_method)::text from reservations where id = (select id from t where nome = 'pago')), '(PAGAMENTO_CONFIRMADO,DINHEIRO)',
  'venda em dinheiro nasce paga, mesmo com o telefone bloqueado');
select ok((select payment_confirmed_at is not null from reservations where id = (select id from t where nome = 'pago')), 'com a hora do pagamento');
select is((select string_agg(event || ':' || actor_type, ',' order by id) from reservation_transitions where reservation_id = (select id from t where nome = 'pago')),
  'T1:ADMIN,T2:ADMIN', 'T1 e T2 pela loja');
select is((select (qty_reserved, qty_sold)::text from product_variants where id = testes.unico('00000000-0000-4000-8000-00000000a002')), '(0,2)',
  'a venda baixa o estoque direto');
select is((select string_agg(kind::text, ',') from stock_movements where reservation_id = (select id from t where nome = 'pago')), 'VENDA', 'um movimento de venda');
select is((select (mode, substatus)::text from fulfillments where reservation_id = (select id from t where nome = 'pago')), '(RETIRADA,EM_PREPARACAO)',
  'retirada combinada: já em preparação');
select is((select params ->> 'forma' from outbox_messages where reservation_id = (select id from t where nome = 'pago') and template = 'pagamento_confirmado'),
  'DINHEIRO', 'a cliente recebe o pagamento confirmado com a forma');
select is((select params ->> 'retirada' from outbox_messages where reservation_id = (select id from t where nome = 'pago') and template = 'pagamento_confirmado'),
  'true', 'e sabe que a retirada já está combinada');
select is((select count(*)::int from outbox_messages where reservation_id = (select id from t where nome = 'pago') and template = 'reserva_criada'), 0,
  'sem mensagem de reserva criada');
select is((sales_totals(app_now() - interval '1 hour', app_now() + interval '1 hour') ->> 'pedidos')::int, 1, 'entra no faturamento');
select is(reservation_json((select r from reservations r where id = (select id from t where nome = 'pago'))) ->> 'forma', 'DINHEIRO', 'a reserva mostra a forma');

insert into t select 'motoboy', (pg_temp.manual('+5577995556666', 'MAQUININHA', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1)), 'MOTOBOY') -> 'reserva' ->> 'id')::uuid;
select is((select (mode, substatus)::text from fulfillments where reservation_id = (select id from t where nome = 'motoboy')), '(MOTOBOY,AGUARDANDO_MODALIDADE)',
  'motoboy paga: a cliente informa o endereço no site');

-- ── Desconto manual: sempre com motivo; a cliente vê "Desconto da loja", o painel vê o motivo ──
select is(pg_temp.manual('+5577997778888', 'PIX_DIRETO', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1, 999)), 'RETIRADA', 999) ->> 'erro',
  'VALIDATION_ERROR', 'desconto manual sem motivo é recusado');
insert into t select 'desc', (pg_temp.manual('+5577997778888', 'PIX_DIRETO', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1, 999)),
  'RETIRADA', 999, 'Cliente fiel, combinado com a Carol') -> 'reserva' ->> 'id')::uuid;
select is((select (subtotal_cents, discount_cents, manual_discount_cents, total_cents)::text from reservations where id = (select id from t where nome = 'desc')),
  '(4999,999,999,4000)', 'o desconto manual entra no desconto e no total');
select is(reservation_json((select r from reservations r where id = (select id from t where nome = 'desc'))) -> 'descontos' -> 0 ->> 'rotulo', 'Desconto da loja',
  'a cliente vê o desconto da loja');
select ok(not (reservation_json((select r from reservations r where id = (select id from t where nome = 'desc')))::text like '%Carol%'), 'sem o motivo');
select is(admin_reservation_detail((select id from t where nome = 'desc')) -> 'manual' ->> 'motivoDesconto', 'Cliente fiel, combinado com a Carol',
  'o painel vê o motivo');
select is(admin_reservation_detail((select id from t where nome = 'desc')) -> 'manual' ->> 'criadaPor', 'Carol', 'e quem cadastrou');
select is((select data ->> 'desconto_manual_cents' from audit_log where action = 'reserva.manual' and reservation_id = (select id from t where nome = 'desc')),
  '999', 'o desconto vai para a auditoria');

-- ── O banco confere as contas e o estoque ──
select is(admin_create_reservation(:admin, jsonb_build_object('nome', 'Bia', 'telefone', '+5577990001111', 'entrega', 'RETIRADA', 'pagamento', 'LINK',
  'linhas', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1)), 'subtotalCentavos', 4999, 'descontoCentavos', 0,
  'descontoManualCentavos', 0, 'totalCentavos', 3999, 'chaveHash', pg_temp.h('x1'), 'link', 'l')) ->> 'erro', 'PRICE_CHANGED', 'total que não fecha é recusado');
select is(admin_create_reservation(:admin, jsonb_build_object('nome', 'Bia', 'telefone', '+5577990001111', 'entrega', 'RETIRADA', 'pagamento', 'LINK',
  'linhas', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1) || '{"precoTabelaCentavos": 3999, "totalCentavos": 3999}'),
  'subtotalCentavos', 3999, 'descontoCentavos', 0, 'descontoManualCentavos', 0, 'totalCentavos', 3999, 'chaveHash', pg_temp.h('x2'), 'link', 'l')) ->> 'erro',
  'PRICE_CHANGED', 'preço diferente do da tabela é recusado');
select is(admin_create_reservation(:admin, jsonb_build_object('nome', 'Bia', 'telefone', '+5577990001111', 'entrega', 'RETIRADA', 'pagamento', 'LINK',
  'linhas', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1) || '{"descontoPromoCentavos": 1000, "descontoCentavos": 1000, "totalCentavos": 3999}'),
  'subtotalCentavos', 4999, 'descontoCentavos', 1000, 'descontoManualCentavos', 0, 'totalCentavos', 3999, 'chaveHash', pg_temp.h('x3'), 'link', 'l')) ->> 'erro',
  'PRICE_CHANGED', 'desconto de promoção sem a promoção é recusado');
select is(pg_temp.manual('+5577990001111', 'CHEQUE', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1))) ->> 'erro',
  'VALIDATION_ERROR', 'forma de pagamento desconhecida é recusada');
select is(pg_temp.manual('+5577990001111', 'DINHEIRO', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a002', 1))) ->> 'erro',
  'STOCK_UNAVAILABLE', 'sem estoque, nada é reservado');
select is((select (qty_reserved, qty_sold)::text from product_variants where id = testes.unico('00000000-0000-4000-8000-00000000a002')), '(0,2)',
  'e o estoque fica como estava');
select throws_ok($$ select pg_temp.manual('+5577990001111', 'LINK', jsonb_build_array(pg_temp.linha('00000000-0000-4000-8000-00000000a001', 1)),
  'RETIRADA', 0, null, '00000000-0000-4000-8000-0000000000ff') $$, 'TS122', null, 'só administrador ativo cadastra');
select is((check_stock_invariants() ->> 'divergencias')::int, 0, 'o estoque bate com as reservas');

select * from finish();
rollback;
