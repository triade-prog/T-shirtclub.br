begin;
select plan(14);

insert into collections (id, name, slug, color_key, position) values
  ('00000000-0000-0000-0000-00000000c001', 'Limone', 'limone', 'LIMAO', 1),
  ('00000000-0000-0000-0000-00000000c002', 'Teddy', 'teddy', 'TOMATE', 2);
insert into collections (id, name, slug, color_key, active) values ('00000000-0000-0000-0000-00000000c003', 'Oculta', 'oculta', 'MENTA', false);
insert into products (id, collection_id, code, slug, name, price_cents, qty_total, description) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'LIM-01', 'limone-amalfi', 'Limone Amalfi', 4999, 5, 'Algodão macio'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001', 'LIM-02', 'limone-capri', 'Limone Capri', 4999, 0, null),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000c002', 'TED-01', 'teddy-rosa', 'Teddy Rosa', 4999, 1, null),
  ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000c002', 'TED-02', 'teddy-rascunho', 'Teddy rascunho', 4999, 9, null),
  ('00000000-0000-0000-0000-00000000a005', '00000000-0000-0000-0000-00000000c003', 'OCU-01', 'oculta-1', 'Oculta', 4999, 9, null);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '/1.webp', 'FRENTE', 'Frente de ' || name, 1440, 1800, 1 from products;
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-0000-0000-00000000a001', 'produtos/lim-01/2.webp', 'COSTAS', 'Costas', 1440, 1800, 2);
update products set published_at = app_now() - interval '3 hours' where code = 'LIM-01';
update products set published_at = app_now() - interval '2 hours' where code = 'LIM-02';
update products set published_at = app_now() - interval '1 hour' where code in ('TED-01', 'OCU-01');

select is(jsonb_array_length(catalog_products()), 3, 'só produtos publicados de coleções ativas');
select is((catalog_products() -> 0 ->> 'slug'), 'teddy-rosa', 'mais recentes primeiro');
select is((select jsonb_agg(x ->> 'slug' order by x ->> 'slug') from jsonb_array_elements(catalog_products('limone')) x),
  '["limone-amalfi", "limone-capri"]'::jsonb, 'filtro por coleção');
select is(jsonb_array_length(catalog_products(null, 'DISPONIVEL')), 2, 'filtro de disponibilidade esconde os esgotados');
select is((select x ->> 'selo' from jsonb_array_elements(catalog_products()) x where x ->> 'slug' = 'teddy-rosa'), 'ULTIMAS_UNIDADES', 'selo de últimas unidades');
select ok(not (catalog_products() -> 0 ? 'qty_total'), 'a vitrine não expõe os saldos internos');

select is((catalog_product('limone-amalfi') -> 'fotos' -> 1 ->> 'tipo'), 'COSTAS', 'página do produto com as fotos em ordem');
select is((catalog_product('limone-amalfi') -> 'colecao' ->> 'cor'), 'LIMAO', 'com a coleção e a cor');
select is(catalog_product('teddy-rascunho'), null, 'produto não publicado não abre');
select is(catalog_product('oculta-1'), null, 'produto de coleção inativa não abre');

select is((select jsonb_agg(x ->> 'slug' order by x ->> 'slug') from jsonb_array_elements(catalog_collections()) x),
  '["limone", "teddy"]'::jsonb, 'só coleções ativas');

insert into home_blocks (kind, position, title) values ('NOVIDADES', 0, 'Chegou agora'), ('MONTE_SEU_CLUB', 1, null), ('COLECOES', 2, null);
select is((select jsonb_agg(b ->> 'tipo') from jsonb_array_elements(catalog_home()) b), '["NOVIDADES", "MONTE_SEU_CLUB", "COLECOES"]'::jsonb,
  'página inicial na ordem do painel');

insert into promotions (id, type, buy_more_mode, group_qty, group_price_cents, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b1', 'COMPRE_MAIS', 'PRECO_POR_GRUPO', 3, 11999, 'Monte seu Club', app_now() - interval '1 day', app_now() + interval '1 day');
insert into promotions (id, type, name, starts_at, ends_at) values ('00000000-0000-0000-0000-0000000000b2', 'CUPOM', 'Futuro', app_now() + interval '1 day', app_now() + interval '2 days');
insert into coupons (promotion_id, code, kind, value, total_quantity, validity_days) values ('00000000-0000-0000-0000-0000000000b2', 'FUTURO', 'VALOR', 1000, 10, 3);
select is((select jsonb_agg(x ->> 'nome' order by x ->> 'nome') from jsonb_array_elements(pricing_promotions(' futuro ')) x),
  '["Futuro", "Monte seu Club"]'::jsonb, 'promoções vigentes e o cupom digitado, mesmo agendado');

select is(cart_products(array['00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a004']::uuid[]),
  '{"produtos": [{"id": "00000000-0000-0000-0000-00000000a001", "nome": "Limone Amalfi", "disponivel": 5, "precoCentavos": 4999}], "limites": {"maxPecas": 9, "maxPorProduto": 2}}'::jsonb,
  'sacola só com produtos visíveis e os limites das configurações');

select * from finish();
rollback;
