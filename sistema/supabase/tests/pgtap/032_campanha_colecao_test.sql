begin;
select plan(9);

-- Coleção como capítulo de campanha (0420): nome da campanha, temporada, edição, foto do
-- celular, paleta e até 3 capítulos com as estampas da própria coleção.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (nome text primary key, id uuid);
insert into t values ('estate', admin_save_collection('00000000-0000-4000-8000-0000000000d1', null,
  '{"nome": "Estate Italiana", "slug": "estate-italiana", "cor": "LIMAO"}'));
insert into t values ('dog', admin_save_collection('00000000-0000-4000-8000-0000000000d1', null,
  '{"nome": "Dog Club", "slug": "dog-club", "cor": "LAVANDA"}'));
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', (select id from t where nome = 'estate'), 'EST-01', 'pomodoro', 'Pomodoro', 4999),
  ('00000000-0000-4000-8000-00000000a002', (select id from t where nome = 'estate'), 'EST-02', 'il-limone', 'Il Limone', 4999),
  ('00000000-0000-4000-8000-00000000a003', (select id from t where nome = 'dog'), 'DOG-01', 'dog-scooter', 'Dog Scooter', 4999);

select is((select collection_json(c) ->> 'paleta' from collections c where slug = 'estate-italiana'), 'CLUB', 'sem escolha, a paleta é a do Club');
select is((select collection_json(c) -> 'capitulos' from collections c where slug = 'estate-italiana'), '[]'::jsonb, 'e não há capítulos');

select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'estate'), $j${
  "nome": "Estate Italiana", "slug": "estate-italiana", "cor": "LIMAO",
  "campanha": "Ciao, Estate!", "temporada": "SS26", "edicao": "Coleção 01", "paleta": "ESTATE_ITALIANA",
  "capaCelular": {"caminho": "colecoes/celular.webp", "alt": "Duas amigas olhando o mar"},
  "capitulos": [
    {"rotulo": "Mattina — Mercato", "titulo": "Il mercato apre cedo.", "foto": {"caminho": "colecoes/mattina.webp", "alt": "Mercado"},
     "produtos": ["00000000-0000-4000-8000-00000000a001", "00000000-0000-4000-8000-00000000a003"]},
    {"rotulo": "Pomeriggio — Al mare", "titulo": "Al mare.", "produtos": ["00000000-0000-4000-8000-00000000a002"]}
  ]}$j$);
create temp table j as select collection_json(c) as v from collections c where slug = 'estate-italiana';
select is((select v ->> 'campanha' || ' · ' || (v ->> 'edicao') || ' · ' || (v ->> 'temporada') from j), 'Ciao, Estate! · Coleção 01 · SS26', 'a campanha, a edição e a temporada vão para a loja');
select is((select v ->> 'paleta' from j), 'ESTATE_ITALIANA', 'com a paleta da coleção');
select is((select v -> 'capaCelular' ->> 'caminho' from j), 'colecoes/celular.webp', 'e a foto do celular');
select is((select jsonb_agg(k ->> 'rotulo') from j, jsonb_array_elements(v -> 'capitulos') k), '["Mattina — Mercato", "Pomeriggio — Al mare"]'::jsonb, 'os capítulos na ordem do painel');
select is((select v -> 'capitulos' -> 0 -> 'produtos' from j), '["00000000-0000-4000-8000-00000000a001"]'::jsonb, 'peça de outra coleção não entra no capítulo');

-- Um painel que não manda os campos novos não apaga a campanha nem os capítulos
select admin_save_collection('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'estate'),
  '{"nome": "Estate Italiana", "slug": "estate-italiana", "cor": "LIMAO", "chamada": "Limões e listras."}');
select is((select count(*)::int from collection_chapters), 2, 'salvar sem os campos novos mantém os capítulos');
select throws_ok($$ update collections set palette = 'NEON' where slug = 'dog-club' $$, '23514', null, 'paleta desconhecida é recusada');

select * from finish();
rollback;
