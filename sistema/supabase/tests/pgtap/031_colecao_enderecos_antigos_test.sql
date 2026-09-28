begin;
select plan(6);

-- Endereços antigos (0410): trocar o endereço da coleção guarda o antigo para a loja
-- redirecionar; o endereço que volta a ser usado deixa de ser apelido.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (id uuid);
insert into t select admin_save_collection('00000000-0000-4000-8000-0000000000d1', null,
  '{"nome": "La Dolce Vita Club", "slug": "la-dolce-vita-club", "cor": "LIMAO"}');
select is((select x -> 'slugsAntigos' from jsonb_array_elements(catalog_collections()) x), '[]'::jsonb, 'coleção nova não tem endereço antigo');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Estate Italiana", "slug": "estate-italiana", "cor": "LIMAO"}');
select is((select x ->> 'slug' from jsonb_array_elements(catalog_collections()) x), 'estate-italiana', 'o endereço novo vale');
select is((select x -> 'slugsAntigos' from jsonb_array_elements(catalog_collections()) x), '["la-dolce-vita-club"]'::jsonb, 'e o antigo fica guardado');

-- Editar sem trocar o endereço não cria apelido
select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Estate Italiana", "slug": "estate-italiana", "cor": "LIMAO", "chamada": "Limões e listras."}');
select is((select count(*)::int from collection_slug_aliases), 1, 'editar sem trocar o endereço não guarda nada');

-- Uma coleção nova com o endereço antigo passa a ser dona dele
select admin_save_collection('00000000-0000-4000-8000-0000000000d1', null, '{"nome": "Outra", "slug": "la-dolce-vita-club", "cor": "MENTA"}');
select is((select count(*)::int from collection_slug_aliases), 0, 'endereço reutilizado deixa de redirecionar');
select throws_ok($$ insert into collection_slug_aliases (slug, collection_id) values ('Com Espaço', (select id from t)) $$, '23514', null, 'endereço inválido é recusado');

select * from finish();
rollback;
