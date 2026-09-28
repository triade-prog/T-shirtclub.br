begin;
select plan(7);

-- Campanhas prontas antes das fotos (0430): gravadas desligadas, ligadas no painel, com frase no
-- capítulo e as paletas dos 5 universos.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (id uuid);
insert into t select admin_save_collection('00000000-0000-4000-8000-0000000000d1', null, $j${
  "nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "campanha": "Mare, Amore!", "paleta": "RIVIERA",
  "capitulos": [{"rotulo": "Al porto", "titulo": "Arrivare senza fretta.", "texto": "Cais, barcos e nenhuma pressa."}]}$j$);
create temp table j as select collection_json(c) as v from collections c where slug = 'riviera';

select is((select v -> 'campanhaAtiva' from j), 'false'::jsonb, 'a campanha nasce desligada (rascunho)');
select is((select v ->> 'paleta' from j), 'RIVIERA', 'com a paleta do universo');
select is((select v -> 'capitulos' -> 0 ->> 'texto' from j), 'Cais, barcos e nenhuma pressa.', 'o capítulo tem a frase');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t), $j${
  "nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "campanha": "Mare, Amore!", "paleta": "RIVIERA", "campanhaAtiva": true}$j$);
select is((select campaign_active from collections where slug = 'riviera'), true, 'o painel liga a campanha');
select throws_ok($$ select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t),
  '{"nome": "Riviera", "slug": "riviera", "cor": "MEDITERRANEO", "paleta": "RIVIERA", "campanhaAtiva": true}') $$,
  '23514', null, 'não liga campanha sem nome');
select lives_ok($$ update collections set palette = p from unnest(array['GIRLHOOD', 'DOG_STORIES', 'FE', 'ESTATE_ITALIANA', 'CLUB']) p where slug = 'riviera' $$, 'as paletas dos 5 universos existem');
select throws_ok($$ update collections set palette = 'NEON' where slug = 'riviera' $$, '23514', null, 'paleta desconhecida continua recusada');

select * from finish();
rollback;
