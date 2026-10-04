begin;
select plan(19);

-- Histórico de cancelamentos da loja e de pagamentos no painel (0600).

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999);
update product_variants v set qty_total = 10 from products p where p.id = v.product_id and v.size = 'UNICO';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', 'Frente', 10, 10, 1 from products;
update products set published_at = app_now();

create temp table t (nome text primary key, id uuid);
create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.manual(p_telefone text) returns uuid language sql as $$
  select (admin_create_reservation('00000000-0000-4000-8000-0000000000d1', jsonb_build_object(
    'nome', 'Ana Paula', 'telefone', p_telefone, 'entrega', 'RETIRADA', 'pagamento', 'LINK',
    'linhas', jsonb_build_array(jsonb_build_object('produtoId', '00000000-0000-4000-8000-00000000a001',
      'varianteId', testes.unico('00000000-0000-4000-8000-00000000a001'), 'qtd', 1, 'precoTabelaCentavos', 4999,
      'descontoPromoCentavos', 0, 'descontoManualCentavos', 0, 'descontoCentavos', 0, 'totalCentavos', 4999)),
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'descontoManualCentavos', 0, 'totalCentavos', 4999,
    'aplicada', null, 'chaveHash', pg_temp.h(gen_random_uuid()::text), 'link', 'https://tshirtclub.vercel.app/r#abc')) -> 'reserva' ->> 'id')::uuid
$$;
create function pg_temp.cobrar(p_reserva uuid, p_phone text) returns uuid language sql as $$
  select (register_payment_attempt(p_reserva, p_phone, 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid
$$;
create function pg_temp.aprovar(p_pagamento uuid) returns void language plpgsql as $$
begin
  update payments set provider_payment_id = 'mp-' || left(p_pagamento::text, 8) where id = p_pagamento;
  perform apply_payment_result(p_pagamento, jsonb_build_object('status', 'APROVADO', 'aprovadoEm', app_now(), 'valorCentavos', 4999,
    'moeda', 'BRL', 'referencia', p_pagamento::text, 'statusProvedor', 'approved'));
end $$;

-- Paga e cancelada pela loja (com o estorno), não paga e cancelada, paga e uma cobrança em aberto
insert into t values ('paga', pg_temp.manual('+5577990000001'));
insert into t values ('pg_paga', pg_temp.cobrar((select id from t where nome = 'paga'), '+5577990000001'));
select pg_temp.aprovar((select id from t where nome = 'pg_paga'));
select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'paga'), 'Teste de estorno',
                                array[(select id from t where nome = 'pg_paga')]);
insert into t values ('aberta', pg_temp.manual('+5577990000002'));
select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'aberta'), 'Cliente desistiu');
insert into t values ('ok', pg_temp.manual('+5577990000003'));
select pg_temp.aprovar(pg_temp.cobrar((select id from t where nome = 'ok'), '+5577990000003'));
insert into t values ('pendente', pg_temp.manual('+5577990000004'));
select pg_temp.cobrar((select id from t where nome = 'pendente'), '+5577990000004');
-- Numa transação o relógio não anda: a cobrança em aberto é a mais nova
update payments set created_at = app_now() + interval '1 minute' where reservation_id = (select id from t where nome = 'pendente');

-- ── Cancelamentos da loja ──
select is(jsonb_array_length(admin_list_store_cancellations()), 2, 'os 2 cancelamentos da loja aparecem');
select is((select e ->> 'motivo' from jsonb_array_elements(admin_list_store_cancellations()) e
            where e -> 'reserva' ->> 'id' = (select id::text from t where nome = 'paga')), 'Teste de estorno', 'com o motivo');
select is((select e ->> 'canceladaPor' from jsonb_array_elements(admin_list_store_cancellations()) e
            where e -> 'reserva' ->> 'id' = (select id::text from t where nome = 'paga')), 'Carol', 'quem cancelou');
select is((select (e ->> 'estornoCentavos')::int from jsonb_array_elements(admin_list_store_cancellations()) e
            where e -> 'reserva' ->> 'id' = (select id::text from t where nome = 'paga')), 4999, 'e o estorno do pedido pago');
select is((select (e ->> 'pago')::boolean from jsonb_array_elements(admin_list_store_cancellations()) e
            where e -> 'reserva' ->> 'id' = (select id::text from t where nome = 'aberta')), false, 'a reserva não paga aparece como não paga');
select is(jsonb_array_length(admin_list_store_cancellations(1)), 1, 'o limite vale');

-- ── Pagamentos ──
select is(admin_list_payments() -> 'totais', '{"APROVADO": 1, "AGUARDANDO": 1, "ESTORNADO": 1}'::jsonb, 'o total de cada grupo');
select is(jsonb_array_length(admin_list_payments() -> 'itens'), 3, 'todos os pagamentos');
select is(admin_list_payments() -> 'itens' -> 0 -> 'reserva' ->> 'id', (select id::text from t where nome = 'pendente'), 'o mais novo primeiro');
select is((select e ->> 'estornadoEm' is not null from jsonb_array_elements(admin_list_payments('ESTORNADO') -> 'itens') e), true,
  'o estornado traz quando voltou');
select is((select count(*) from jsonb_array_elements(admin_list_payments('APROVADO') -> 'itens')), 1::bigint, 'o filtro por grupo');
select is((select e ->> 'idProvedor' from jsonb_array_elements(admin_list_payments('APROVADO') -> 'itens') e),
  (select 'mp-' || left(p.id::text, 8) from payments p join t on t.id = p.reservation_id where t.nome = 'ok'), 'com o número do Mercado Pago');
select is(array[payment_group('RECUSADO'), payment_group('CANCELADO'), payment_group('FALHOU'), payment_group('EM_ANALISE')],
  array['NAO_PAGO', 'NAO_PAGO', 'NAO_PAGO', 'EM_ANALISE'], 'recusado, cancelado e falhou ficam em Não pagos');

-- ── Dashboard (0610): o pedido cancelado pela loja deixa de ser venda ──
create temp table v as select sales_totals(app_now() - interval '1 hour', app_now() + interval '1 hour') as t;
select is((select (t ->> 'pedidos', t ->> 'pecas', t ->> 'ticketMedioCentavos')::text from v), '(1,1,4999)',
  'só o pedido que segue de pé conta: pedidos, peças e ticket');
select is((select (t ->> 'estornosCentavos', t ->> 'receitaLiquidaCentavos')::text from v), '(0,4999)',
  'o estorno do cancelado não é descontado de novo');
select is((select (t ->> 'reservasPagas', t ->> 'reservasEncerradas')::text from v), '(1,1)', 'nem na conversão');
select is((select (t ->> 'canceladosPelaLoja')::int from v), 1, 'a tela sabe quantos pedidos pagos a loja cancelou');
select is((select (c ->> 'pecas')::int from jsonb_array_elements(admin_sales_dashboard('HOJE') -> 'colecoes') c), 1,
  'as coleções também ficam sem o cancelado');

select ok(not has_function_privilege('anon', 'admin_list_payments(text, integer)', 'execute')
          and not has_function_privilege('anon', 'admin_list_store_cancellations(integer)', 'execute'), 'fechado ao público');

select * from finish();
rollback;
