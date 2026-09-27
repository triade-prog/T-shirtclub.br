-- Última unidade do Plus disputada por 50 clientes enquanto 5 levam o Único, que tem estoque (T1),
-- e duas abas do mesmo telefone (T3). O estoque é por tamanho (0370).
create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;

insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-0000000cc001', 'Teste', 'teste-concorrencia', 'MENTA');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-0000000aa001', '00000000-0000-4000-8000-0000000cc001', 'CON-01', 'ultima-unidade', 'Última unidade', 4999),
  ('00000000-0000-4000-8000-0000000aa002', '00000000-0000-4000-8000-0000000cc001', 'CON-02', 'duas-abas', 'Duas abas', 4999);
update product_variants set qty_total = 5 where sku in ('CON-01-UNI', 'CON-02-UNI');
update product_variants set qty_total = 1, active = true where sku = 'CON-01-PLUS';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', name, 10, 10, 1 from products where code like 'CON-%';
update products set published_at = app_now() where code like 'CON-%';

-- 50 tentativas verificadas querendo o último Plus (+55779…) e 5 querendo o Único (+55778…)
with s as (
  insert into otp_sessions (phone_e164, purpose, status, verified_at)
  select case when n <= 50 then '+55779' else '+55778' end || lpad(n::text, 8, '0'), 'RESERVA', 'VERIFICADA', app_now()
    from generate_series(1, 55) n
  returning id, phone_e164
)
insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents,
                                  otp_session_id, status, verified_until, browser_token_hash)
select 'C' || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (right(phone_e164, 2)::int % 32) + 1, 1)
           || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (right(phone_e164, 2)::int / 32) + 1, 1) || 'Z',
       'Cliente ' || right(phone_e164, 2), phone_e164, 'RETIRADA',
       jsonb_build_array(jsonb_build_object('produtoId', '00000000-0000-4000-8000-0000000aa001', 'qtd', 1, 'varianteId',
         (select id from product_variants where sku = case when s.phone_e164 like '+55779%' then 'CON-01-PLUS' else 'CON-01-UNI' end))),
       4999, s.id, 'VERIFICADA',
       app_now() + interval '10 minutes', pg_temp.h('t' || phone_e164)
  from s;

-- Duas abas do mesmo telefone, cada uma com a sua tentativa verificada
with s as (
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values ('+5577988887777', 'RESERVA', 'VERIFICADA', app_now()) returning id
)
insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents,
                                  otp_session_id, status, verified_until, browser_token_hash)
select r, 'Duas Abas', '+5577988887777', 'RETIRADA',
       jsonb_build_array(jsonb_build_object('produtoId', '00000000-0000-4000-8000-0000000aa002', 'qtd', 1,
                                            'varianteId', (select id from product_variants where sku = 'CON-02-UNI'))), 4999,
       s.id, 'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h('aba-' || r)
  from s, unnest(array['ABA2', 'ABA3']) r;
