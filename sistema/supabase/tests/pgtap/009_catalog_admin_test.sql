begin;
select plan(24);

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Loja');
create temp table ids (nome text primary key, id uuid);

-- Coleção
insert into ids select 'limone', admin_save_collection('00000000-0000-0000-0000-0000000000d1', null,
  '{"nome": "Limone", "slug": "limone", "descricao": "Limões do verão", "cor": "LIMAO", "capa": {"caminho": "colecoes/limone.webp", "alt": "Camisetas Limone"}, "posicao": 1, "ativa": true}');
select is((select color_key::text from collections where id = (select id from ids where nome = 'limone')), 'LIMAO', 'coleção criada com a cor escolhida');
select throws_ok($$ select admin_save_collection('00000000-0000-0000-0000-0000000000d1', null, '{"nome": "Outra", "slug": "limone", "cor": "MENTA"}') $$,
  '23505', null, 'endereço (slug) repetido é recusado');
select throws_ok($$ select admin_save_collection('00000000-0000-0000-0000-000000000099', null, '{"nome": "X", "slug": "x", "cor": "MENTA"}') $$,
  'TS122', null, 'quem não é administrador não grava');
select throws_ok($$ select admin_save_collection('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), '{"nome": "X", "slug": "x", "cor": "MENTA"}') $$,
  'TS130', null, 'editar coleção que não existe');

-- Produto: criado sem publicar, publica depois de ter foto
insert into ids select 'p1', admin_save_product('00000000-0000-0000-0000-0000000000d1', null, jsonb_build_object(
  'colecaoId', (select id from ids where nome = 'limone'), 'codigo', 'LIM-01', 'slug', 'limone-amalfi', 'nome', 'Limone Amalfi',
  'precoCentavos', 4999, 'composicao', '100% algodão', 'medidas', jsonb_build_object('busto', 104), 'ativo', true, 'publicado', false));
select is((select published_at from products where code = 'LIM-01'), null, 'produto nasce sem publicar');
select throws_ok(format($$ select admin_save_product('00000000-0000-0000-0000-0000000000d1', %L, jsonb_build_object(
  'colecaoId', %L, 'codigo', 'LIM-01', 'slug', 'limone-amalfi', 'nome', 'Limone Amalfi', 'precoCentavos', 4999, 'publicado', true)) $$,
  (select id from ids where nome = 'p1'), (select id from ids where nome = 'limone')),
  'TS101', null, 'sem foto não publica');

-- Fotos: caminho gerado no banco, posições sem buraco
select matches((admin_add_product_image('00000000-0000-0000-0000-0000000000d1', (select id from ids where nome = 'p1'),
  '{"tipo": "FRENTE", "alt": "Camiseta Limone Amalfi de frente", "largura": 1440, "altura": 1800}') ->> 'caminho'),
  '^produtos/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$', 'caminho da foto é gerado no banco');
select is((admin_add_product_image('00000000-0000-0000-0000-0000000000d1', (select id from ids where nome = 'p1'),
  '{"tipo": "COSTAS", "alt": "Costas", "largura": 1440, "altura": 1800}') ->> 'posicao')::int, 2, 'segunda foto na posição 2');
select is((admin_add_product_image('00000000-0000-0000-0000-0000000000d1', (select id from ids where nome = 'p1'),
  '{"tipo": "DETALHE", "alt": "Detalhe da estampa", "largura": 1440, "altura": 1800}') ->> 'posicao')::int, 3, 'terceira na posição 3');

select lives_ok(format($$ select admin_save_product('00000000-0000-0000-0000-0000000000d1', %L, jsonb_build_object(
  'colecaoId', %L, 'codigo', 'LIM-01', 'slug', 'limone-amalfi', 'nome', 'Limone Amalfi', 'precoCentavos', 5499, 'publicado', true)) $$,
  (select id from ids where nome = 'p1'), (select id from ids where nome = 'limone')), 'com foto, publica e muda o preço');
select is((select data->>'preco_antes' from audit_log where action = 'produto.editado' order by id desc limit 1), '4999', 'mudança de preço vai para a auditoria');

-- Reordenar: a nova primeira é a capa
select lives_ok(format($$ select admin_reorder_product_images('00000000-0000-0000-0000-0000000000d1', %L,
  (select array_agg(id order by position desc) from product_images where product_id = %L)) $$,
  (select id from ids where nome = 'p1'), (select id from ids where nome = 'p1')), 'reordena as fotos');
select is((select kind::text from product_images where product_id = (select id from ids where nome = 'p1') and position = 1), 'DETALHE', 'a última virou a capa');
select throws_ok(format($$ select admin_reorder_product_images('00000000-0000-0000-0000-0000000000d1', %L, array[gen_random_uuid()]) $$,
  (select id from ids where nome = 'p1')), 'TS132', null, 'a ordem precisa ter exatamente as fotos do produto');

-- Apagar sobe as posições e devolve o caminho
select matches(admin_delete_product_image('00000000-0000-0000-0000-0000000000d1',
  (select id from product_images where product_id = (select id from ids where nome = 'p1') and position = 1)), '^produtos/', 'apagar devolve o caminho do arquivo');
select is((select array_agg(position order by position) from product_images where product_id = (select id from ids where nome = 'p1')), array[1, 2],
  'as fotos que ficam sobem de posição');

select is((admin_list_products('amalfi') -> 'itens' -> 0 ->> 'codigo'), 'LIM-01', 'busca do painel por nome');
select is((admin_get_product((select id from ids where nome = 'p1')) -> 'fotos' -> 0 ->> 'tipo'), 'COSTAS', 'detalhe traz as fotos na ordem nova');

-- Look e página inicial
insert into ids select 'look', admin_save_look('00000000-0000-0000-0000-0000000000d1', null, jsonb_build_object(
  'titulo', 'Verão em Amalfi', 'foto', jsonb_build_object('caminho', 'looks/amalfi.webp', 'alt', 'Modelo com a Limone Amalfi'),
  'produtos', jsonb_build_array(jsonb_build_object('produtoId', (select id from ids where nome = 'p1'), 'x', 0.4, 'y', 0.55))));
select is((admin_list_looks() -> 0 -> 'produtos' -> 0 ->> 'x')::numeric, 0.4, 'look com o produto marcado na foto');
select is(jsonb_array_length(admin_set_home_blocks('00000000-0000-0000-0000-0000000000d1', jsonb_build_array(
  jsonb_build_object('tipo', 'CAMPANHA', 'refId', (select id from ids where nome = 'look')),
  jsonb_build_object('tipo', 'NOVIDADES', 'titulo', 'Chegou agora'),
  jsonb_build_object('tipo', 'MONTE_SEU_CLUB')))), 3, 'página inicial regravada na ordem');
select throws_ok($$ select admin_set_home_blocks('00000000-0000-0000-0000-0000000000d1', jsonb_build_array(jsonb_build_object('tipo', 'CAMPANHA', 'refId', gen_random_uuid()))) $$,
  'TS133', null, 'bloco apontando para look inexistente é recusado');

-- Promoções: criar, editar e não trocar o tipo
insert into ids select 'club', admin_save_promotion('00000000-0000-0000-0000-0000000000d1', null, jsonb_build_object(
  'tipo', 'COMPRE_MAIS', 'modo', 'PRECO_POR_GRUPO', 'nome', 'Monte seu Club', 'grupo', jsonb_build_object('qtd', 3, 'precoCentavos', 11999),
  'inicio', app_now() - interval '1 day', 'fim', app_now() + interval '30 days'));
insert into ids select 'cupom', admin_save_promotion('00000000-0000-0000-0000-0000000000d1', null, jsonb_build_object(
  'tipo', 'CUPOM', 'nome', 'Boas-vindas', 'inicio', app_now(), 'fim', app_now() + interval '30 days',
  'cupom', jsonb_build_object('codigo', 'bemvinda10', 'modo', 'VALOR', 'valor', 1000, 'quantidadeTotal', 100, 'validadeDias', 3)));
set constraints all immediate;
set constraints all deferred;
select is((select jsonb_agg(x ->> 'tipo' order by x ->> 'tipo') from jsonb_array_elements(admin_list_promotions()) x), '["COMPRE_MAIS", "CUPOM"]'::jsonb,
  'lista de promoções do painel');
select is((select code from coupons), 'BEMVINDA10', 'código do cupom gravado em maiúsculas');
select throws_ok(format($$ select admin_save_promotion('00000000-0000-0000-0000-0000000000d1', %L, jsonb_build_object(
  'tipo', 'DESCONTO_PRODUTO', 'nome', 'X', 'escopo', 'ESPECIFICOS', 'inicio', app_now(), 'fim', app_now() + interval '1 day')) $$,
  (select id from ids where nome = 'club')), 'TS131', null, 'o tipo da promoção não muda');

select * from finish();
rollback;
