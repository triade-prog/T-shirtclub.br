begin;
select plan(32);

-- Cancelar pela loja e entrega pelo painel (0590).

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
create function pg_temp.manual(p_telefone text, p_pagamento text, p_entrega text default 'RETIRADA') returns uuid language sql as $$
  select (admin_create_reservation('00000000-0000-4000-8000-0000000000d1', jsonb_build_object(
    'nome', 'Ana Paula', 'telefone', p_telefone, 'entrega', p_entrega, 'pagamento', p_pagamento,
    'linhas', jsonb_build_array(jsonb_build_object('produtoId', '00000000-0000-4000-8000-00000000a001',
      'varianteId', testes.unico('00000000-0000-4000-8000-00000000a001'), 'qtd', 1, 'precoTabelaCentavos', 4999,
      'descontoPromoCentavos', 0, 'descontoManualCentavos', 0, 'descontoCentavos', 0, 'totalCentavos', 4999)),
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'descontoManualCentavos', 0, 'totalCentavos', 4999,
    'aplicada', null, 'chaveHash', pg_temp.h(gen_random_uuid()::text), 'link', 'https://tshirtclub.vercel.app/r#abc')) -> 'reserva' ->> 'id')::uuid
$$;
-- Paga pelo Mercado Pago (PIX aprovado pelo provedor)
create function pg_temp.pagar(p_reserva uuid, p_phone text) returns uuid language plpgsql as $$
declare v uuid := (register_payment_attempt(p_reserva, p_phone, 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid;
begin
  update payments set provider_payment_id = 'mp-' || left(v::text, 8) where id = v;
  perform apply_payment_result(v, jsonb_build_object('status', 'APROVADO', 'aprovadoEm', app_now(), 'valorCentavos', 4999,
    'moeda', 'BRL', 'referencia', v::text, 'statusProvedor', 'approved'));
  return v;
end $$;
create function pg_temp.estoque() returns text language sql as $$
  select (qty_reserved, qty_sold)::text from product_variants where product_id = '00000000-0000-4000-8000-00000000a001'
$$;
create function pg_temp.st(p_nome text) returns text language sql as $$
  select (status, closure_reason)::text from reservations where id = (select id from t where nome = p_nome)
$$;
\set admin '''00000000-0000-4000-8000-0000000000d1'''

insert into t values ('aberta', pg_temp.manual('+5577990000001', 'LINK'));
insert into t values ('mp', pg_temp.manual('+5577990000002', 'LINK'));
select pg_temp.pagar((select id from t where nome = 'mp'), '+5577990000002');
insert into t values ('dinheiro', pg_temp.manual('+5577990000003', 'DINHEIRO', 'MOTOBOY'));
insert into t values ('contestada', pg_temp.manual('+5577990000004', 'LINK'));
select pg_temp.pagar((select id from t where nome = 'contestada'), '+5577990000004');
insert into payment_disputes (payment_id, reservation_id, kind)
select id, reservation_id, 'CONTESTACAO' from payments where reservation_id = (select id from t where nome = 'contestada');
select is(pg_temp.estoque(), '(1,3)', 'antes: 1 reservada e 3 vendidas');

-- ── Reserva não paga ──
select throws_ok($$ select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'aberta'), 'x') $$,
  'TS121', null, 'cancelar pede um motivo');
select is((admin_cancel_preview((select id from t where nome = 'aberta')) ->> 'pode')::boolean, true, 'a não paga pode ser cancelada');
select lives_ok($$ select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'aberta'), 'Cliente desistiu pelo telefone') $$,
  'cancela a reserva não paga');
select is(pg_temp.st('aberta'), '(EXPIRADO,CANCELADA_PELA_LOJA)', 'encerrada com o motivo da loja');
select is((select event from reservation_transitions where reservation_id = (select id from t where nome = 'aberta') order by id desc limit 1), 'T4',
  'pela T4, como o cancelamento aprovado');
select is(pg_temp.estoque(), '(0,3)', 'a peça reservada volta');
select is((select params ->> 'pago' from outbox_messages where dedupe_key = 'reserva_cancelada:' || (select id from t where nome = 'aberta')), 'false',
  'a cliente recebe o aviso do cancelamento');
select is((select count(*) from phone_blocks), 0::bigint, 'e não conta para o bloqueio');

-- ── Pedido pago pelo Mercado Pago ──
select is(jsonb_array_length(admin_cancel_preview((select id from t where nome = 'mp')) -> 'estornar'), 1, 'o pago mostra o pagamento a estornar');
select throws_ok($$ select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'mp'), 'Peça com defeito') $$,
  'TS176', null, 'sem o estorno no Mercado Pago, não cancela');
-- O aviso de estorno do Mercado Pago chega antes (a api-admin estornou): disputa aberta
select apply_payment_result(p.id, jsonb_build_object('status', 'ESTORNADO', 'valorCentavos', 4999, 'moeda', 'BRL', 'referencia', p.id::text, 'statusProvedor', 'refunded'))
  from payments p where p.reservation_id = (select id from t where nome = 'mp');
select lives_ok($$ select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'mp'), 'Peça com defeito',
                                                   (select array_agg(id) from payments where reservation_id = (select id from t where nome = 'mp'))) $$,
  'com o estorno feito, cancela o pedido pago');
select is(pg_temp.st('mp'), '(EXPIRADO,CANCELADA_PELA_LOJA)', 'o pedido pago fica encerrado');
select is((select event from reservation_transitions where reservation_id = (select id from t where nome = 'mp') order by id desc limit 1), 'T6', 'pela T6');
select is(pg_temp.estoque(), '(0,2)', 'a peça vendida volta ao estoque');
select is((select kind::text from stock_movements where reservation_id = (select id from t where nome = 'mp') order by id desc limit 1), 'DEVOLUCAO',
  'com o movimento de devolução');
select is((select (status, count(*) over ())::text from payment_disputes where reservation_id = (select id from t where nome = 'mp')), '(RESOLVIDA,1)',
  'o aviso do Mercado Pago fica resolvido pelo cancelamento, sem outra disputa');
select is((select status::text from payments where reservation_id = (select id from t where nome = 'mp')), 'ESTORNADO', 'o pagamento fica estornado');
select is((select closed_at is not null from fulfillments where reservation_id = (select id from t where nome = 'mp')), true, 'a entrega fecha');
select is((select (params ->> 'pago', params ->> 'estornoCentavos', params ->> 'forma')::text from outbox_messages
            where dedupe_key = 'reserva_cancelada:' || (select id from t where nome = 'mp')), '(true,4999,PIX)', 'a cliente sabe do estorno');
-- Outro aviso do Mercado Pago depois: não abre disputa
select apply_payment_result(p.id, jsonb_build_object('status', 'ESTORNADO', 'valorCentavos', 4999, 'moeda', 'BRL', 'referencia', p.id::text, 'statusProvedor', 'refunded'))
  from payments p where p.reservation_id = (select id from t where nome = 'mp');
select is((select count(*) from payment_disputes where reservation_id = (select id from t where nome = 'mp') and status = 'ABERTA'), 0::bigint,
  'o aviso que chega depois não abre disputa');

-- ── Contestação e encerrada ──
select throws_ok($$ select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'contestada'), 'Tentativa') $$,
  'TS173', null, 'contestação aberta impede');
select throws_ok($$ select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'aberta'), 'De novo') $$,
  'TS175', null, 'a encerrada não cancela de novo');

-- ── Entrega pelo painel: venda em dinheiro com motoboy, sem endereço ──
select throws_ok($$ select admin_set_fulfillment('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'dinheiro'), 'MOTOBOY', '{"rua": "R. A"}') $$,
  'TS120', null, 'endereço incompleto não passa');
select lives_ok($$ select admin_set_fulfillment('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'dinheiro'), 'MOTOBOY',
  '{"cep": "46400000", "rua": "R. Sátiro Santos", "numero": "38", "bairro": "Centro", "cidade": "Caetité", "uf": "BA"}') $$, 'a loja preenche o endereço');
select is((select (substatus, address ->> 'rua')::text from fulfillments where reservation_id = (select id from t where nome = 'dinheiro')),
  '(AGUARDANDO_CALCULO_FRETE,"R. Sátiro Santos")', 'e o pedido vai para calcular o frete');
select admin_set_fulfillment(:admin, (select id from t where nome = 'dinheiro'), 'MOTOBOY',
  '{"cep": "46400000", "rua": "R. Sátiro Santos", "numero": "40", "bairro": "Centro", "cidade": "Caetité", "uf": "BA"}');
select is((select (substatus, address ->> 'numero')::text from fulfillments where reservation_id = (select id from t where nome = 'dinheiro')),
  '(AGUARDANDO_CALCULO_FRETE,40)', 'corrigir o endereço não muda a etapa');
select is((select count(*) from outbox_messages where template = 'entrega_confirmada' and reservation_id = (select id from t where nome = 'dinheiro')
            and params ->> 'alterado' = 'true'), 1::bigint, 'e a cliente recebe a confirmação da correção');

-- O quadro de Entregas: as peças e desde quando o pedido está na etapa
select is((select i -> 'pecas' -> 0 ->> 'nome' from jsonb_array_elements(admin_list_fulfillments()) i
            where i -> 'reserva' ->> 'id' = (select id::text from t where nome = 'dinheiro')), 'Limone Amalfi', 'o quadro mostra as peças');
select ok((select (i ->> 'desde') is not null from jsonb_array_elements(admin_list_fulfillments()) i
            where i -> 'reserva' ->> 'id' = (select id::text from t where nome = 'dinheiro')), 'e desde quando está na etapa');

-- Cancelar a venda em dinheiro: devolve por fora e o faturamento desconta
select is((admin_cancel_preview((select id from t where nome = 'dinheiro')) ->> 'devolverPorForaCentavos')::int, 4999, 'a venda em dinheiro devolve por fora');
select admin_cancel_reservation(:admin, (select id from t where nome = 'dinheiro'), 'Cliente desistiu');
select is((sales_totals(app_now() - interval '1 hour', app_now() + interval '1 hour') ->> 'estornosCentavos')::int, 9998,
  'o faturamento desconta o estorno do Mercado Pago e a devolução em dinheiro');

select * from finish();
rollback;
