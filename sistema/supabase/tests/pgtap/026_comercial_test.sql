begin;
select plan(20);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Loja');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999);
update product_variants v set qty_total = x.q from (values ('00000000-0000-4000-8000-00000000a001', 20)) x(p, q) where v.product_id = x.p::uuid and v.size = 'UNICO';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-00000000a001', 'produtos/lim-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
update products set published_at = app_now();
update app_settings set value = '"Rua da Loja, 10"' where key = 'loja_endereco_retirada';

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.reservar(p_phone text, p_entrega delivery_mode) returns uuid language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina', p_phone, p_entrega, testes.com_unico('[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]'), 4999, s,
          'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return (create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', testes.com_unico('[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1, "precoTabelaCentavos": 4999, "descontoCentavos": 0, "totalCentavos": 4999}]'),
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'totalCentavos', 4999, 'aplicada', null,
    'chaveHash', pg_temp.h(v_token || 'k'), 'link', 'https://tshirtclub.pt/r#x')) -> 'reserva' ->> 'id')::uuid;
end $$;
create function pg_temp.aprovar(p_pagamento uuid, p_valor integer) returns jsonb language sql as $$
  select apply_payment_result(p_pagamento, jsonb_build_object('status', 'APROVADO', 'aprovadoEm', app_now(), 'valorCentavos', p_valor,
    'moeda', 'BRL', 'referencia', p_pagamento::text, 'statusProvedor', 'approved'))
$$;
create function pg_temp.pagar(p_reserva uuid, p_phone text) returns void language sql as $$
  select pg_temp.aprovar((register_payment_attempt(p_reserva, p_phone, 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid, 4999)
$$;
create function pg_temp.frete(p_reserva uuid, p_phone text, p_chave uuid default gen_random_uuid()) returns jsonb language sql as $$
  select register_shipping_payment(p_reserva, p_phone, 'PIX', p_chave)
$$;
create temp table t (nome text primary key, id uuid);
create temp table endereco as select '{"cep": "45000000", "rua": "Rua das Flores", "numero": "12", "bairro": "Centro", "cidade": "Vitória da Conquista", "uf": "BA"}'::jsonb as a;
\set admin '''00000000-0000-4000-8000-0000000000d1'''


create function pg_temp.pagamento(p_nome text) returns uuid language sql as $$
  select id from payments where reservation_id = (select id from t where nome = p_nome) and purpose = 'PRODUTOS' and applied
$$;

-- Três pedidos pagos hoje (1 peça, R$ 49,99), um deles com frete de R$ 12,00; uma reserva que expira
insert into t values ('a', pg_temp.reservar('+5577900000011', 'RETIRADA'));
select pg_temp.pagar((select id from t where nome = 'a'), '+5577900000011');
insert into t values ('b', pg_temp.reservar('+5577900000012', 'RETIRADA'));
select pg_temp.pagar((select id from t where nome = 'b'), '+5577900000012');
insert into t values ('c', pg_temp.reservar('+5577900000013', 'MOTOBOY'));
select pg_temp.pagar((select id from t where nome = 'c'), '+5577900000013');
select set_fulfillment((select id from t where nome = 'c'), '+5577900000013', 'MOTOBOY', (select a from endereco));
select admin_shipping_quote((select id from t where nome = 'c'), :admin, 1200, 1, null);
insert into t values ('fc', (pg_temp.frete((select id from t where nome = 'c'), '+5577900000013') -> 'pagamento' ->> 'id')::uuid);
select pg_temp.aprovar((select id from t where nome = 'fc'), 1200);
insert into t values ('x', pg_temp.reservar('+5577900000014', 'RETIRADA'));

create temp table h as select admin_sales_dashboard('HOJE') as v;
select is((select (v -> 'atual' ->> 'pedidos')::int from h), 3, 'pedidos pagos hoje');
select is((select (v -> 'atual' ->> 'pecasBrutaCentavos')::int from h), 14997, 'peças pelo preço de tabela');
select is((select (v -> 'atual' ->> 'freteCentavos')::int from h), 1200, 'frete cobrado');
select is((select (v -> 'atual' ->> 'receitaBrutaCentavos')::int from h), 16197, 'receita bruta = peças + frete');
select is((select (v -> 'atual' ->> 'receitaLiquidaCentavos')::int from h), 16197, 'sem descontos nem estornos, líquida = bruta');
select is((select (v -> 'atual' ->> 'ticketMedioCentavos')::int from h), 4999, 'ticket médio só das peças');
select is((select (v -> 'atual' ->> 'pecas')::int from h), 3, 'peças vendidas');
select is((select (v -> 'atual' ->> 'reservasEncerradas')::int from h), 3, 'a reserva ainda ativa não conta na conversão');
select is((select jsonb_array_length(v -> 'serie') from h), 7, 'série dos últimos 7 dias');
select is((select v -> 'colecoes' -> 0 ->> 'nome' from h), 'Limone', 'coleção que mais vende');
select is((select v -> 'mix' -> 'entrega' from h), '{"MOTOBOY": 1, "RETIRADA": 2}'::jsonb, 'mix de entrega');
select is((select v -> 'meta' from h), 'null'::jsonb, 'sem meta cadastrada');

-- Estorno de um pedido já pago entra como dedução no período do estorno
select apply_payment_result(pg_temp.pagamento('a'), jsonb_build_object('status', 'ESTORNADO', 'valorCentavos', 4999, 'moeda', 'BRL',
  'referencia', pg_temp.pagamento('a')::text, 'statusProvedor', 'refunded'));
select is((admin_sales_dashboard('HOJE') -> 'atual' ->> 'estornosCentavos')::int, 4999, 'estorno deduzido');
select is((admin_sales_dashboard('HOJE') -> 'atual' ->> 'receitaLiquidaCentavos')::int, 11198, 'líquida = bruta − estornos');

-- Metas: diária, mensal e anual; 7 e 30 dias usam a diária
select is(admin_update_sales_goals(:admin, '{"diaCentavos": 60000, "mesCentavos": 1500000, "anoCentavos": 18000000}') ->> 'mesCentavos', '1500000', 'metas gravadas');
select is((admin_sales_dashboard('7_DIAS') ->> 'meta')::int, 420000, '7 dias: 7 × a diária');
select is((admin_sales_dashboard('ANO') ->> 'meta')::int, 18000000, 'ano: a anual');
select throws_ok(format('select admin_update_sales_goals(%L, %L)', :admin, '{"diaCentavos": -1}'), 'TS181', null, 'meta negativa é recusada');
select throws_ok('select admin_sales_dashboard(''SEMANA'')', 'TS182', null, 'período desconhecido é recusado');

-- Estoque em atenção: até 1 peça disponível
update product_variants set qty_total = qty_reserved + qty_sold + 1 where product_id = '00000000-0000-4000-8000-00000000a001' and size = 'UNICO';
select is((admin_sales_dashboard('HOJE') -> 'estoque' -> 0 ->> 'disponivel')::int, 1, 'produto com 1 peça entra na lista');

select * from finish();
rollback;
