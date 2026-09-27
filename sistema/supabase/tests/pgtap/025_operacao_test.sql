begin;
select plan(14);

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


-- Uma reserva em cada situação
insert into t values ('aguardando', pg_temp.reservar('+5577900000001', 'RETIRADA'));
insert into t values ('cancelar', pg_temp.reservar('+5577900000002', 'RETIRADA'));
select request_cancellation((select id from t where nome = 'cancelar'), '+5577900000002', 'Comprei errado');
insert into t values ('paga', pg_temp.reservar('+5577900000003', 'MOTOBOY'));
select pg_temp.pagar((select id from t where nome = 'paga'), '+5577900000003');
insert into t values ('preparar', pg_temp.reservar('+5577900000004', 'RETIRADA'));
select pg_temp.pagar((select id from t where nome = 'preparar'), '+5577900000004');
select set_fulfillment((select id from t where nome = 'preparar'), '+5577900000004', 'RETIRADA');
insert into t values ('entregue', pg_temp.reservar('+5577900000005', 'RETIRADA'));
select pg_temp.pagar((select id from t where nome = 'entregue'), '+5577900000005');
select set_fulfillment((select id from t where nome = 'entregue'), '+5577900000005', 'RETIRADA');
select admin_set_substatus((select id from t where nome = 'entregue'), :admin, 'PRONTO_PARA_RETIRADA');
select deliver_reservation((select id from t where nome = 'entregue'), :admin);

create temp table q as select admin_operation_board() as v;
create function pg_temp.coluna(p_nome text) returns text language sql as $$
  select k from q, jsonb_each(q.v -> 'colunas') as c(k, cartoes), jsonb_array_elements(c.cartoes) x
   where (x ->> 'id')::uuid = (select id from t where nome = p_nome)
$$;

select is(pg_temp.coluna('aguardando'), 'AGUARDANDO', 'reserva ativa: aguardando pagamento');
select is(pg_temp.coluna('cancelar'), 'ACAO', 'cancelamento pendente: precisa de ação');
select is(pg_temp.coluna('paga'), 'PAGO', 'paga sem entrega escolhida: pagamento confirmado');
select is(pg_temp.coluna('preparar'), 'ENTREGA', 'em preparação: preparação e entrega');
select is(pg_temp.coluna('entregue'), 'CONCLUIDO', 'entregue hoje: concluídos');
select is((select count(*)::int from q, jsonb_each(q.v -> 'colunas') as c(k, cartoes), jsonb_array_elements(c.cartoes) x), 5, 'cada reserva em uma coluna só');

select is((select x -> 'motivos' from q, jsonb_array_elements(q.v -> 'colunas' -> 'ACAO') x), '["CANCELAMENTO"]'::jsonb, 'o cartão diz o motivo');
select is((select x ->> 'notaCancelamento' from q, jsonb_array_elements(q.v -> 'colunas' -> 'ACAO') x), 'Comprei errado', 'e o que a cliente escreveu');
select is((select x ->> 'nome' from q, jsonb_array_elements(q.v -> 'colunas' -> 'AGUARDANDO') x), 'Marina', 'com o nome da cliente');
select ok((select (x ->> 'hoje')::boolean from q, jsonb_array_elements(q.v -> 'colunas' -> 'AGUARDANDO') x), 'criada hoje entra no filtro Hoje');
select is(q.v -> 'resumo', '{"ativas": 2, "pagas": 2, "precisamDeAcao": 1, "fretePendente": 0}'::jsonb, 'resumo do topo') from q;

-- O frete por calcular também pede a loja
select set_fulfillment((select id from t where nome = 'paga'), '+5577900000003', 'MOTOBOY', (select a from endereco));
select is((admin_operation_board() -> 'resumo' ->> 'precisamDeAcao')::int, 2, 'frete por calcular conta como ação');
select is((admin_operation_board() -> 'resumo' ->> 'fretePendente')::int, 1, 'e como frete pendente');

-- Expirada sem pendência não aparece
select set_app_clock(interval '1 hour');
select sweep_reservations();
select ok(not exists (select 1 from jsonb_array_elements(admin_operation_board() -> 'colunas' -> 'AGUARDANDO') x
                      where (x ->> 'id')::uuid = (select id from t where nome = 'aguardando')), 'expirada sai do quadro');

select * from finish();
rollback;
