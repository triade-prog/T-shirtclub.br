begin;
select plan(8);

-- Bloco "Almost Gone" (0380): as peças com o selo de últimas unidades, da que tem menos para a
-- que tem mais; esgotadas, com estoque folgado ou não publicadas ficam de fora.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Dog Club', 'dog-club', 'LAVANDA');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'DOG-01', 'dog-scooter', 'Dog Scooter', 4999),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c001', 'DOG-02', 'dog-parisienne', 'Dog Parisienne', 4999),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000c001', 'DOG-03', 'dog-poodle', 'Dog Classic Poodle', 4999),
  ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000c001', 'DOG-04', 'dog-folgado', 'Dog Folgado', 4999),
  ('00000000-0000-4000-8000-00000000a005', '00000000-0000-4000-8000-00000000c001', 'DOG-05', 'dog-esgotado', 'Dog Esgotado', 4999),
  ('00000000-0000-4000-8000-00000000a006', '00000000-0000-4000-8000-00000000c001', 'DOG-06', 'dog-rascunho', 'Dog Rascunho', 4999);
-- 2, 1, 2, 5, 0 e 1 (rascunho) unidades no Único
update product_variants v set qty_total = x.q
  from (values ('DOG-01', 2), ('DOG-02', 1), ('DOG-03', 2), ('DOG-04', 5), ('DOG-05', 0), ('DOG-06', 1)) x(c, q)
 where v.sku = x.c || '-UNI';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '/1.webp', 'FRENTE', name, 864, 1536, 1 from products;
update products set published_at = app_now() - (substr(code, 5)::int || ' minutes')::interval where code <> 'DOG-06';

select is((select jsonb_agg(x ->> 'slug') from jsonb_array_elements(catalog_quase_esgotadas()) x),
  '["dog-parisienne", "dog-scooter", "dog-poodle"]'::jsonb,
  'só as de últimas unidades, a de 1 antes das de 2 e, no empate, a publicada mais recente primeiro');
select is(jsonb_array_length(catalog_quase_esgotadas(1)), 1, 'respeita o limite');

-- No início, pelo painel
select lives_ok($$ select admin_set_home_blocks('00000000-0000-4000-8000-0000000000d1',
  '[{"tipo": "QUASE_ESGOTADAS", "titulo": "Almost Gone"}, {"tipo": "NOVIDADES"}]') $$, 'o painel aceita o bloco novo');
select is((catalog_home() -> 0 ->> 'tipo'), 'QUASE_ESGOTADAS', 'o bloco vem na ordem do painel');
select is((catalog_home() -> 0 ->> 'titulo'), 'Almost Gone', 'com o título do painel');
select is(jsonb_array_length(catalog_home() -> 0 -> 'conteudo'), 3, 'com as peças acabando');

-- Vendeu a última: sai do bloco
update product_variants set qty_sold = 1 where sku = 'DOG-02-UNI';
select is((select jsonb_agg(x ->> 'slug') from jsonb_array_elements(catalog_home() -> 0 -> 'conteudo') x),
  '["dog-scooter", "dog-poodle"]'::jsonb, 'a esgotada sai do bloco');

-- Nenhuma acabando: o bloco vem vazio (a loja não mostra)
update product_variants set qty_total = 9 where sku like 'DOG-0_-UNI' and qty_sold = 0;
select is(catalog_home() -> 0 -> 'conteudo', '[]'::jsonb, 'sem peça acabando, o bloco vem vazio');

select * from finish();
rollback;
