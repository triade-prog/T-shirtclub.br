begin;
select plan(8);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Loja');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Teddy', 'teddy', 'TOMATE');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'TED-01', 'teddy-1', 'Teddy Rosa', 4999),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c001', 'TED-02', 'teddy-2', 'Teddy Azul', 4999);
update product_variants v set qty_total = x.q from (values ('00000000-0000-4000-8000-00000000a001', 1), ('00000000-0000-4000-8000-00000000a002', 10)) x(p, q) where v.product_id = x.p::uuid and v.size = 'UNICO';
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
  values (gen_attempt_ref(), 'Marina', p_phone, 'RETIRADA', jsonb_build_array(jsonb_build_object('produtoId', p_produto, 'varianteId', testes.unico(p_produto::uuid), 'qtd', 1)),
          4999 - p_desconto, s, 'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', jsonb_build_array(jsonb_build_object('produtoId', p_produto, 'varianteId', testes.unico(p_produto::uuid), 'qtd', 1, 'precoTabelaCentavos', 4999,
                                                   'descontoCentavos', p_desconto, 'totalCentavos', 4999 - p_desconto)),
    'subtotalCentavos', 4999, 'descontoCentavos', p_desconto, 'totalCentavos', 4999 - p_desconto, 'aplicada', p_aplicada,
    'chaveHash', pg_temp.h(v_token || 'chave'), 'link', 'https://tshirtclub.pt/r#x'));
end $$;
create function pg_temp.id(p jsonb) returns uuid language sql as $$ select (p -> 'reserva' ->> 'id')::uuid $$;

-- Nome e peças vêm da reserva quando a função que enfileira não manda
create temp table t (v jsonb);
insert into t select pg_temp.reservar('+5577998128809', '00000000-0000-4000-8000-00000000a002');
select enqueue_message('teste:lembrete', '+5577998128809', 'reserva_lembrete_5min', '{"numero": 1}', 1::smallint, null,
                       pg_temp.id((select v from t)));
select is((select params ->> 'nome' from outbox_messages where dedupe_key = 'teste:lembrete'), 'Marina', 'lembrete com o primeiro nome da reserva');
select is((select (params ->> 'pecas')::int from outbox_messages where dedupe_key = 'teste:lembrete'), 1, 'e o número de peças');
select enqueue_message('teste:nome', '+5577998128809', 'pedido_entregue', '{"numero": 1, "nome": "Outra"}', 2::smallint, null,
                       pg_temp.id((select v from t)));
select is((select params ->> 'nome' from outbox_messages where dedupe_key = 'teste:nome'), 'Outra', 'o que veio de quem enfileira não é trocado');
select enqueue_message('teste:sem-reserva', '+5577998128809', 'mensagem_teste', '{}', 2::smallint);
select is((select params from outbox_messages where dedupe_key = 'teste:sem-reserva'), '{}'::jsonb, 'sem reserva, nada é acrescentado');

-- A oferta do Club: "compre mais" por grupo, ativo e para todos, quando falta 1 peça
insert into promotions (type, buy_more_mode, group_qty, group_price_cents, name, starts_at, ends_at)
values ('COMPRE_MAIS', 'PRECO_POR_GRUPO', 3, 11999, 'Club', app_now() - interval '1 day', app_now() + interval '30 days');
select enqueue_message('teste:2', '+5577998128809', 'reserva_criada', '{"numero": 1, "pecas": 2}', 1::smallint);
select enqueue_message('teste:3', '+5577998128809', 'reserva_criada', '{"numero": 1, "pecas": 3}', 1::smallint);
select enqueue_message('teste:1', '+5577998128809', 'reserva_criada', '{"numero": 1, "pecas": 1}', 1::smallint);
select is((select params -> 'grupo' from outbox_messages where dedupe_key = 'teste:2'), '{"qtd": 3, "precoCentavos": 11999}'::jsonb, '2 peças: leva a oferta');
select is((select params ? 'grupo' from outbox_messages where dedupe_key = 'teste:3'), false, '3 peças: já é o Club');
select is((select params ? 'grupo' from outbox_messages where dedupe_key = 'teste:1'), false, '1 peça: sem oferta');
update promotions set ended_at = app_now() - interval '1 second' where name = 'Club';
select enqueue_message('teste:2b', '+5577998128809', 'reserva_criada', '{"numero": 1, "pecas": 2}', 1::smallint);
select is((select params ? 'grupo' from outbox_messages where dedupe_key = 'teste:2b'), false, 'promoção encerrada: sem oferta');

select * from finish();
rollback;
