-- Última unidade disputada por 50 clientes (T1) e duas abas do mesmo telefone (T3).
create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;

insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-0000000cc001', 'Teste', 'teste-concorrencia', 'MENTA');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-0000000aa001', '00000000-0000-4000-8000-0000000cc001', 'CON-01', 'ultima-unidade', 'Última unidade', 4999, 1),
  ('00000000-0000-4000-8000-0000000aa002', '00000000-0000-4000-8000-0000000cc001', 'CON-02', 'duas-abas', 'Duas abas', 4999, 5);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', name, 10, 10, 1 from products where code like 'CON-%';
update products set published_at = app_now() where code like 'CON-%';

-- 50 tentativas verificadas, uma por telefone, todas querendo a última unidade
with s as (
  insert into otp_sessions (phone_e164, purpose, status, verified_at)
  select '+55779' || lpad(n::text, 8, '0'), 'RESERVA', 'VERIFICADA', app_now() from generate_series(1, 50) n
  returning id, phone_e164
)
insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents,
                                  otp_session_id, status, verified_until, browser_token_hash)
select 'C' || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (right(phone_e164, 2)::int % 32) + 1, 1)
           || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (right(phone_e164, 2)::int / 32) + 1, 1) || 'Z',
       'Cliente ' || right(phone_e164, 2), phone_e164, 'RETIRADA',
       '[{"produtoId": "00000000-0000-4000-8000-0000000aa001", "qtd": 1}]', 4999, s.id, 'VERIFICADA',
       app_now() + interval '10 minutes', pg_temp.h('t' || phone_e164)
  from s;

-- Duas abas do mesmo telefone, cada uma com a sua tentativa verificada
with s as (
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values ('+5577988887777', 'RESERVA', 'VERIFICADA', app_now()) returning id
)
insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents,
                                  otp_session_id, status, verified_until, browser_token_hash)
select r, 'Duas Abas', '+5577988887777', 'RETIRADA', '[{"produtoId": "00000000-0000-4000-8000-0000000aa002", "qtd": 1}]', 4999,
       s.id, 'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h('aba-' || r)
  from s, unnest(array['ABA2', 'ABA3']) r;
