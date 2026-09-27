begin;
select plan(22);

insert into collections (id, name, slug, color_key) values
  ('00000000-0000-0000-0000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'LIM-01', 'limone-classica', 'Limone clássica', 4999);

-- cor da coleção só da lista aprovada; capa sempre com texto alternativo
select throws_ok($$ insert into collections (name, slug, color_key) values ('X', 'x', 'ROSA') $$,
  '22P02', null, 'cor fora da lista é recusada');
select throws_ok($$ insert into collections (name, slug, color_key, cover_path) values ('X', 'x', 'MENTA', 'capas/x.webp') $$,
  '23514', null, 'capa sem texto alternativo é recusada');
select throws_ok($$ insert into collections (name, slug, color_key) values ('X', 'Com Espaço', 'MENTA') $$,
  '23514', null, 'endereço (slug) fora do padrão é recusado');

-- publicar exige foto
select throws_ok($$ update products set published_at = now() where code = 'LIM-01' $$,
  'TS101', null, 'produto sem foto não é publicado');

insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select '00000000-0000-0000-0000-00000000a001', 'produtos/lim-01/' || n || '.webp', 'FRENTE', 'Camiseta Limone, foto ' || n, 1440, 1800, n
from generate_series(1, 10) n;
select lives_ok($$ update products set published_at = now() where code = 'LIM-01' $$, 'com foto, publica');

select throws_ok($$ insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
                    values ('00000000-0000-0000-0000-00000000a001', 'produtos/lim-01/11.webp', 'COSTAS', 'Costas', 10, 10, 1) $$,
  'TS102', null, 'no máximo 10 fotos');
select throws_ok($$ insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
                    values ('00000000-0000-0000-0000-00000000c001', 'x/y.webp', 'COSTAS', '  ', 10, 10, 1) $$,
  '23514', null, 'foto sem texto alternativo é recusada');

-- reordenar troca posições dentro da transação
select lives_ok($$
  set constraints product_images_posicao_unica deferred;
  update product_images set position = 11 - position where product_id = '00000000-0000-0000-0000-00000000a001';
$$, 'reordenar as fotos troca posições sem conflito');
select is((select storage_path from product_images where product_id = '00000000-0000-0000-0000-00000000a001' and position = 1),
  'produtos/lim-01/10.webp', 'a nova capa é a foto que foi para a posição 1');

delete from product_images where product_id = '00000000-0000-0000-0000-00000000a001' and position > 1;
select throws_ok($$ delete from product_images where product_id = '00000000-0000-0000-0000-00000000a001' $$,
  'TS101', null, 'produto publicado não fica sem foto');

-- variantes (0370): a peça nasce com o Único ativo e o Plus inativo, cada um com SKU próprio
select is((select string_agg(size || ':' || sku || ':' || active, ' ' order by size) from product_variants
            where product_id = '00000000-0000-0000-0000-00000000a001'),
  'UNICO:LIM-01-UNI:true PLUS:LIM-01-PLUS:false', 'Único ativo e Plus inativo, com SKU pelo código');
select throws_ok($$ insert into product_variants (product_id, size, sku) values ('00000000-0000-0000-0000-00000000a001', 'PLUS', 'LIM-01-P2') $$,
  '23505', null, 'um tamanho por peça');

-- estoque nunca negativo nem abaixo do comprometido, por tamanho
select throws_ok($$ update product_variants set qty_reserved = 1 where sku = 'LIM-01-UNI' $$,
  '23514', null, 'reservado acima do total é recusado');
update product_variants set qty_total = 5, qty_reserved = 2, qty_sold = 1 where sku = 'LIM-01-UNI';
select is((select available from v_product_availability where product_id = '00000000-0000-0000-0000-00000000a001'), 2,
  'disponível = total − reservado − vendido');
select is((select label from v_product_availability where product_id = '00000000-0000-0000-0000-00000000a001'), 'ULTIMAS_UNIDADES',
  'até 2 disponíveis aparece como últimas unidades');
update product_variants set qty_total = 3 where sku = 'LIM-01-PLUS';
select is((select available from v_product_availability where product_id = '00000000-0000-0000-0000-00000000a001'), 2,
  'tamanho inativo não conta na loja');
update product_variants set active = true where sku = 'LIM-01-PLUS';
select is((select available from v_product_availability where product_id = '00000000-0000-0000-0000-00000000a001'), 5,
  'a peça soma os tamanhos ativos');
update product_variants set qty_reserved = 4 where sku = 'LIM-01-UNI';
update product_variants set qty_total = 0 where sku = 'LIM-01-PLUS';
select is((select label from v_product_availability where product_id = '00000000-0000-0000-0000-00000000a001'), 'ESGOTADO',
  'sem disponível em nenhum tamanho aparece esgotado');

-- movimentos: somente inserção, com as regras de cada tipo e a variante da própria peça
insert into stock_movements (product_id, variant_id, kind, qty, actor_type, reason)
values ('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), 'ENTRADA', 5, 'ADMIN', 'Chegada do lote');
select throws_ok($$ update stock_movements set qty = 6 $$, 'TS010', null, 'movimento não é alterado');
select throws_ok($$ insert into stock_movements (product_id, variant_id, kind, qty, actor_type)
                    values ('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), 'AJUSTE', -1, 'ADMIN') $$,
  '23514', null, 'ajuste sem motivo é recusado');
select throws_ok($$ insert into stock_movements (product_id, variant_id, kind, qty, actor_type)
                    values ('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), 'RESERVA', 1, 'SISTEMA') $$,
  '23514', null, 'movimento de reserva exige a reserva');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001', 'LIM-02', 'limone-dois', 'Limone dois', 4999);
select throws_ok($$ insert into stock_movements (product_id, variant_id, kind, qty, actor_type, reason)
                    values ('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a002'), 'ENTRADA', 1, 'ADMIN', 'Lote') $$,
  '23503', null, 'movimento com a variante de outra peça é recusado');

select * from finish();
rollback;
