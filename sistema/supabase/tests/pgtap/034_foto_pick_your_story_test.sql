begin;
select plan(4);

-- Foto do Pick your story (0440): escolhida no painel, mantida quando o painel não manda o campo e
-- apagada com null (o círculo volta para a peça mais nova).

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (id uuid);
insert into t select admin_save_collection('00000000-0000-4000-8000-0000000000d1', null,
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO"}');

select is((select collection_json(c) -> 'fotoStory' from collections c where slug = 'riviera'), 'null'::jsonb, 'sem foto escolhida, o círculo usa a peça mais nova');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "fotoStory": {"caminho": "colecoes/riviera-story.webp"}}');
select is((select collection_json(c) -> 'fotoStory' ->> 'caminho' from collections c where slug = 'riviera'), 'colecoes/riviera-story.webp', 'a foto escolhida vai para a loja');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "chamada": "Mar e sal."}');
select is((select story_path from collections where slug = 'riviera'), 'colecoes/riviera-story.webp', 'um painel que não manda o campo não apaga a foto');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "fotoStory": null}');
select is((select story_path from collections where slug = 'riviera'), null, 'tirar a foto volta para a peça mais nova');

select * from finish();
rollback;
