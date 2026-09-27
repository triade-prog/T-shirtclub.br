begin;
select plan(26);

-- Variantes Único e Plus (0370): o estoque, a reserva e a venda são por tamanho; o limite por
-- peça soma os tamanhos; a variante é sempre da peça; e o cadastro publica só com um tamanho ativo.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c001', 'LIM-02', 'limone-2', 'Limone Capri', 4999);
update product_variants set qty_total = 5 where sku = 'LIM-01-UNI';
update product_variants set qty_total = 1, active = true where sku = 'LIM-01-PLUS';
update product_variants set qty_total = 3 where sku = 'LIM-02-UNI';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', name, 10, 10, 1 from products;
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.v(p_sku text) returns uuid language sql as $$ select id from product_variants where sku = p_sku $$;
-- Itens [{sku, qtd}] no formato da sacola: peça, variante e quantidade
create function pg_temp.itens(p jsonb) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('produtoId', v.product_id, 'varianteId', v.id, 'qtd', (x ->> 'qtd')::int) order by o)
    from jsonb_array_elements(p) with ordinality y(x, o) join product_variants v on v.sku = x ->> 'sku'
$$;
-- Reserva de ponta a ponta: tentativa verificada e create_reservation com as linhas do motor (sem desconto)
create function pg_temp.reservar(p_phone text, p_itens jsonb) returns jsonb language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text; v_total int;
begin
  v_total := (select sum(4999 * (x ->> 'qtd')::int) from jsonb_array_elements(p_itens) x);
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina Souza', p_phone, 'RETIRADA', p_itens, v_total, s, 'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', (select jsonb_agg(x || jsonb_build_object('precoTabelaCentavos', 4999, 'descontoCentavos', 0, 'totalCentavos', 4999 * (x ->> 'qtd')::int))
                 from jsonb_array_elements(p_itens) x),
    'subtotalCentavos', v_total, 'descontoCentavos', 0, 'totalCentavos', v_total, 'aplicada', null,
    'chaveHash', pg_temp.h(v_token || 'k'), 'link', 'https://tshirtclub.vercel.app/r#x'));
end $$;
create temp table t (nome text primary key, v jsonb);

-- ─── Reserva por tamanho ─────────────────────────────────────────────────────────────
insert into t values ('r1', pg_temp.reservar('+5577998128809', pg_temp.itens('[{"sku": "LIM-01-UNI", "qtd": 1}, {"sku": "LIM-01-PLUS", "qtd": 1}]')));
select is((select v -> 'reserva' ->> 'status' from t where nome = 'r1'), 'RESERVADO', 'Único e Plus da mesma peça na mesma reserva');
select is((select (qty_reserved, (select qty_reserved from product_variants where sku = 'LIM-01-PLUS'))::text from product_variants where sku = 'LIM-01-UNI'),
  '(1,1)', 'cada tamanho reserva o seu estoque');
select is((select jsonb_agg(i ->> 'tamanho' || ':' || (i ->> 'rotuloTamanho') order by i ->> 'tamanho') from t, jsonb_array_elements(v -> 'reserva' -> 'itens') i where nome = 'r1'),
  '["PLUS:Plus · 44 ao 48", "UNICO:Único · P ao 42"]'::jsonb, 'a reserva mostra o tamanho de cada item');
select is((select count(*)::int from stock_movements where kind = 'RESERVA' and variant_id in (pg_temp.v('LIM-01-UNI'), pg_temp.v('LIM-01-PLUS'))),
  2, 'um movimento por tamanho');

select is(pg_temp.reservar('+5571991112222', pg_temp.itens('[{"sku": "LIM-01-UNI", "qtd": 2}, {"sku": "LIM-01-PLUS", "qtd": 1}]')) ->> 'erro',
  'MAX_PER_MODEL', 'o limite por peça soma os tamanhos');

-- O Plus acabou; o Único ainda tem
insert into t values ('r2', pg_temp.reservar('+5571991112222', pg_temp.itens('[{"sku": "LIM-01-PLUS", "qtd": 1}]')));
select is((select v ->> 'erro' from t where nome = 'r2'), 'STOCK_UNAVAILABLE', 'tamanho esgotado não reserva');
select is((select v -> 'detalhes' -> 'produtos' from t where nome = 'r2'), '["Limone Amalfi · Plus · 44 ao 48"]'::jsonb, 'o erro diz o tamanho que acabou');
select is(pg_temp.reservar('+5573995556666', pg_temp.itens('[{"sku": "LIM-01-UNI", "qtd": 1}]')) -> 'reserva' ->> 'status',
  'RESERVADO', 'o outro tamanho da mesma peça segue à venda');

-- Variante de outra peça, ou inativa, é indisponível
select is(pg_temp.reservar('+5575993334444', jsonb_build_array(jsonb_build_object('produtoId', '00000000-0000-4000-8000-00000000a002',
                                                                                  'varianteId', pg_temp.v('LIM-01-UNI'), 'qtd', 1))) ->> 'erro',
  'STOCK_UNAVAILABLE', 'variante que não é da peça não reserva');
update product_variants set active = false where sku = 'LIM-02-UNI';
select is(pg_temp.reservar('+5579997778888', pg_temp.itens('[{"sku": "LIM-02-UNI", "qtd": 1}]')) ->> 'erro',
  'STOCK_UNAVAILABLE', 'tamanho inativo não reserva');
update product_variants set active = true where sku = 'LIM-02-UNI';

-- ─── Expiração e venda devolvem ou vendem no tamanho certo ───────────────────────────
select ok(expire_reservation((select (v -> 'reserva' ->> 'id')::uuid from t where nome = 'r1'), 'CANCELAMENTO_APROVADO'), 'reserva cancelada');
select is((select (qty_reserved, (select qty_reserved from product_variants where sku = 'LIM-01-PLUS'))::text from product_variants where sku = 'LIM-01-UNI'),
  '(1,0)', 'o Plus volta; o Único segue com a outra reserva');
select is((select count(*)::int from stock_movements where kind = 'LIBERACAO' and variant_id = pg_temp.v('LIM-01-PLUS')), 1, 'liberação no Plus');
select is((check_stock_invariants() ->> 'divergencias')::int, 0, 'invariantes conferem por tamanho');

-- ─── Cadastro: tamanhos, SKU e publicação ────────────────────────────────────────────
select is(admin_save_product('00000000-0000-4000-8000-0000000000d1', null, jsonb_build_object(
    'colecaoId', '00000000-0000-4000-8000-00000000c001', 'codigo', 'TED-01', 'slug', 'teddy-1', 'nome', 'Teddy Rose', 'precoCentavos', 4999,
    'variantes', jsonb_build_array(
      jsonb_build_object('tamanho', 'UNICO', 'sku', 'ted-01-uni', 'ativa', true, 'medidas', '{"busto": 104}'::jsonb),
      jsonb_build_object('tamanho', 'PLUS', 'sku', 'TED-01-PLUS', 'ativa', true, 'medidas', '{"busto": 116}'::jsonb)))) is not null,
  true, 'peça nova com os dois tamanhos');
select is((select string_agg(v.size || ':' || v.sku || ':' || v.active || ':' || (v.measurements ->> 'busto'), ' ' order by v.size)
             from product_variants v join products p on p.id = v.product_id where p.code = 'TED-01'),
  'UNICO:TED-01-UNI:true:104 PLUS:TED-01-PLUS:true:116', 'SKU em maiúsculas, tamanhos ativos e medidas de cada um');
select throws_ok($$ select admin_save_product('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a002', jsonb_build_object(
    'colecaoId', '00000000-0000-4000-8000-00000000c001', 'codigo', 'LIM-02', 'slug', 'limone-2', 'nome', 'Limone Capri', 'precoCentavos', 4999,
    'publicado', true, 'variantes', '[{"tamanho": "UNICO", "sku": "LIM-02-UNI", "ativa": false}]'::jsonb)) $$,
  'TS183', null, 'publicar sem tamanho ativo é recusado');
select is((select active from product_variants where sku = 'LIM-02-UNI'), true, 'e nada muda');
select throws_ok($$ select admin_save_product('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a002', jsonb_build_object(
    'colecaoId', '00000000-0000-4000-8000-00000000c001', 'codigo', 'LIM-02', 'slug', 'limone-2', 'nome', 'Limone Capri', 'precoCentavos', 4999,
    'variantes', '[{"tamanho": "UNICO", "sku": "TED-01-UNI", "ativa": true}]'::jsonb)) $$,
  '23505', null, 'SKU repetido é recusado');
select lives_ok($$ select admin_save_product('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000a002', jsonb_build_object(
    'colecaoId', '00000000-0000-4000-8000-00000000c001', 'codigo', 'LIM-02', 'slug', 'limone-2', 'nome', 'Limone Capri', 'precoCentavos', 4999,
    'publicado', true, 'variantes', '[{"tamanho": "PLUS", "sku": "LIM-02-PLUS", "ativa": true}]'::jsonb)) $$,
  'o tamanho que não veio fica como está');
select is((select data -> 'tamanhos' -> 0 ->> 'tamanho' from audit_log where action = 'produto.editado' order by id desc limit 1),
  'PLUS', 'a auditoria registra o tamanho alterado');
select is((select count(*)::int from product_variants v join products p on p.id = v.product_id where p.code = 'LIM-02' and v.active), 2,
  'Único e Plus ativos');

-- ─── Nomes dos tamanhos ──────────────────────────────────────────────────────────────
select is(admin_update_size_labels('00000000-0000-4000-8000-0000000000d1', '{"plus": "Plus · 44 ao 50"}') ->> 'plus', 'Plus · 44 ao 50',
  'a loja muda o nome do Plus');
select is((catalog_product('limone-1') -> 'tamanhos' -> 1 ->> 'rotulo'), 'Plus · 44 ao 50', 'e a loja mostra o nome novo');
select throws_ok($$ select admin_update_size_labels('00000000-0000-4000-8000-0000000000d1', '{"unico": " "}') $$,
  'TS184', null, 'nome vazio é recusado');
select is((select count(*)::int from audit_log where action = 'tamanhos.alterados'), 1, 'a mudança vai para a auditoria');

select * from finish();
rollback;
