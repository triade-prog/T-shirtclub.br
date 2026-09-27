begin;
select plan(12);

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');
insert into admin_users (id, name, active) values
  ('00000000-0000-0000-0000-0000000000d1', 'Loja', true),
  ('00000000-0000-0000-0000-0000000000d2', 'Antiga', false);
insert into collections (id, name, slug, color_key) values ('00000000-0000-0000-0000-00000000c001', 'Teddy', 'teddy', 'TOMATE');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'TED-01', 'teddy-1', 'Teddy 1', 4999);

select is(adjust_stock('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), 5, 'Chegada do lote', '00000000-0000-0000-0000-0000000000d1', 'ENTRADA'),
  5, 'entrada soma ao total');
update product_variants set qty_reserved = 2, qty_sold = 1 where sku = 'TED-01-UNI';

select throws_ok($$ select adjust_stock('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), -3, 'Peça com defeito', '00000000-0000-0000-0000-0000000000d1') $$,
  'TS124', null, 'não deixa o total abaixo do reservado + vendido');
select is(adjust_stock('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), -2, 'Peça com defeito', '00000000-0000-0000-0000-0000000000d1'),
  3, 'ajuste negativo até o comprometido é aceito');
select throws_ok($$ select adjust_stock('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), 1, '  ', '00000000-0000-0000-0000-0000000000d1') $$,
  'TS121', null, 'ajuste sem motivo é recusado');
select throws_ok($$ select adjust_stock('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), -1, 'Saída', '00000000-0000-0000-0000-0000000000d1', 'ENTRADA') $$,
  'TS120', null, 'entrada negativa é recusada');
select throws_ok($$ select adjust_stock('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a001'), 1, 'Ajuste', '00000000-0000-0000-0000-0000000000d2') $$,
  'TS122', null, 'administrador inativo não ajusta');

select is((select sum(qty)::int from stock_movements where product_id = '00000000-0000-0000-0000-00000000a001' and kind in ('ENTRADA', 'AJUSTE')),
  (testes.variante('TED-01')).qty_total, 'os movimentos reconstroem o total');
select is((select count(*)::int from audit_log where action = 'estoque.ajustado'), 2, 'cada ajuste vai para a auditoria');
select is((select data->>'motivo' from audit_log where action = 'estoque.ajustado' order by id desc limit 1), 'Peça com defeito', 'com o motivo');

-- Por tamanho: o Plus tem estoque próprio; a variante tem de ser da peça
select is(adjust_stock('00000000-0000-0000-0000-00000000a001', (testes.variante('TED-01', 'PLUS')).id, 4, 'Lote Plus', '00000000-0000-0000-0000-0000000000d1', 'ENTRADA'),
  4, 'entrada no Plus');
select is((testes.variante('TED-01')).qty_total, 3, 'sem mexer no Único');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001', 'TED-02', 'teddy-2', 'Teddy 2', 4999);
select throws_ok($$ select adjust_stock('00000000-0000-0000-0000-00000000a001', testes.unico('00000000-0000-0000-0000-00000000a002'), 1, 'Lote', '00000000-0000-0000-0000-0000000000d1') $$,
  'TS123', null, 'tamanho de outra peça não é encontrado');

select * from finish();
rollback;
