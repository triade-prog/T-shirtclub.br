begin;
select plan(3);

-- Prévia na loja no painel (0450): a lista de coleções do painel traz a foto da peça mais nova
-- que aparece na loja, a mesma do círculo do Pick your story sem foto escolhida.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (nome text primary key, id uuid);
insert into t values ('dog', admin_save_collection('00000000-0000-4000-8000-0000000000d1', null, '{"nome": "Dog Club", "slug": "dog-club", "cor": "LAVANDA"}'));
insert into t values ('fe', admin_save_collection('00000000-0000-4000-8000-0000000000d1', null, '{"nome": "Fé", "slug": "fe", "cor": "MENTA"}'));

-- 3 peças com foto: 2 publicadas (a 01 é a mais nova) e 1 em rascunho, mais nova ainda
insert into products (id, collection_id, code, slug, name, price_cents)
select ('00000000-0000-4000-8000-00000000a00' || n)::uuid, (select id from t where nome = 'dog'), 'DOG-0' || n, 'dog-' || n, 'Dog ' || n, 4999
  from generate_series(1, 3) n;
update product_variants set qty_total = 5 where sku like 'DOG-0_-UNI';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '/1.webp', 'FRENTE', name, 864, 1536, 1 from products;
update products set published_at = app_now() - (substr(code, 5)::int || ' minutes')::interval where code <> 'DOG-03';

create temp table l as select x from jsonb_array_elements(admin_list_collections()) x;
select is((select x -> 'pecaMaisNova' ->> 'caminho' from l where x ->> 'slug' = 'dog-club'), 'produtos/dog-01/1.webp', 'a peça mais nova que está na loja, sem rascunho');
select is((select x -> 'pecaMaisNova' from l where x ->> 'slug' = 'fe'), 'null'::jsonb, 'coleção sem peças não tem foto');
select is((select (x ->> 'produtos')::int from l where x ->> 'slug' = 'dog-club'), 3, 'a contagem do painel continua com todas as peças');

select * from finish();
rollback;
