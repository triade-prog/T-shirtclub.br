begin;
select plan(6);

-- Ícone do Pick your story (0500): escolhido no painel, mantido quando o painel não manda o campo,
-- apagado com null (a loja volta para a camiseta) e só com chave no formato da lista da loja.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (id uuid);
insert into t select admin_save_collection('00000000-0000-4000-8000-0000000000d1', null,
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO"}');

select is((select collection_json(c) -> 'iconeStory' from collections c where slug = 'riviera'), 'null'::jsonb, 'sem ícone escolhido, a loja mostra a camiseta');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "iconeStory": "onda"}');
select is((select collection_json(c) ->> 'iconeStory' from collections c where slug = 'riviera'), 'onda', 'o ícone escolhido vai para a loja');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "chamada": "Mar e sal."}');
select is((select story_icon from collections where slug = 'riviera'), 'onda', 'um painel que não manda o campo não apaga o ícone');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "iconeStory": null}');
select is((select story_icon from collections where slug = 'riviera'), null, 'tirar o ícone volta para a camiseta');

select throws_ok($$ select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "iconeStory": "<svg>"}') $$,
  '23514', null, 'chave fora do formato não entra');

select ok(not has_function_privilege('anon', 'admin_save_collection(uuid, uuid, jsonb)', 'execute'), 'só o painel grava a coleção');

select * from finish();
rollback;
