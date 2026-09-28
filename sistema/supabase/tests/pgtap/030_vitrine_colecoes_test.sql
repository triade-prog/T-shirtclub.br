begin;
select plan(8);

-- Vitrine das coleções (0400): a chamada da faixa verde, salva pelo painel, e até 4 fotos das
-- peças visíveis (a mais recente primeiro) para a capa e o cartão da coleção sem foto própria.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (nome text primary key, id uuid);
insert into t values ('dog', admin_save_collection('00000000-0000-4000-8000-0000000000d1', null,
  '{"nome": "Dog Club", "slug": "dog-club", "cor": "LAVANDA", "chamada": "Cachorros com mais estilo que a gente."}'));
insert into t values ('fe', admin_save_collection('00000000-0000-4000-8000-0000000000d1', null,
  '{"nome": "Fé", "slug": "fe", "cor": "MENTA"}'));

select is((select x ->> 'chamada' from jsonb_array_elements(catalog_collections()) x where x ->> 'slug' = 'dog-club'),
  'Cachorros com mais estilo que a gente.', 'a chamada vai para a loja');
select is((select x -> 'chamada' from jsonb_array_elements(catalog_collections()) x where x ->> 'slug' = 'fe'), 'null'::jsonb, 'sem chamada, vem vazia');
select throws_ok($$ update collections set tagline = repeat('a', 121) where slug = 'fe' $$, '23514', null, 'chamada longa é recusada');

-- 7 peças: 5 publicadas com foto e 2 em rascunho (uma sem foto, outra com)
insert into products (id, collection_id, code, slug, name, price_cents)
select ('00000000-0000-4000-8000-00000000a00' || n)::uuid, (select id from t where nome = 'dog'), 'DOG-0' || n, 'dog-' || n, 'Dog ' || n, 4999
  from generate_series(1, 7) n;
update product_variants set qty_total = 5 where sku like 'DOG-0_-UNI';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '/1.webp', 'FRENTE', name, 864, 1536, 1 from products where code <> 'DOG-06';
update products set published_at = app_now() - (substr(code, 5)::int || ' minutes')::interval where code not in ('DOG-06', 'DOG-07');

select is((select jsonb_agg(f ->> 'caminho') from jsonb_array_elements(catalog_collections()) x, jsonb_array_elements(x -> 'fotos') f where x ->> 'slug' = 'dog-club'),
  '["produtos/dog-01/1.webp", "produtos/dog-02/1.webp", "produtos/dog-03/1.webp", "produtos/dog-04/1.webp"]'::jsonb,
  'até 4 fotos, da peça mais recente para a mais antiga, sem rascunho');
select is((select x -> 'fotos' from jsonb_array_elements(catalog_collections()) x where x ->> 'slug' = 'fe'), '[]'::jsonb, 'coleção sem peças não tem fotos');
select is((catalog_home() is not null), true, 'o início continua montando');

-- Editar pelo painel troca e apaga a chamada
select lives_ok($$ select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'dog'),
  '{"nome": "Dog Club", "slug": "dog-club", "cor": "LAVANDA", "chamada": "  "}') $$, 'o painel salva sem chamada');
select is((select tagline from collections where slug = 'dog-club'), null, 'e a chamada em branco fica vazia');

select * from finish();
rollback;
