begin;
select plan(18);

-- As regras de formato são conferidas no fim da transação (gatilhos adiáveis). Aqui cada
-- caso grava as linhas e força a conferência com "set constraints all immediate"; os casos
-- que devem falhar rodam dentro de um savepoint, desfeito em seguida.

insert into collections (id, name, slug, color_key) values ('00000000-0000-0000-0000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'LIM-01', 'limone-1', 'Limone 1', 4999),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001', 'LIM-02', 'limone-2', 'Limone 2', 4999);

-- "Monte seu Club": compre e economize mais, preço por grupo (3 por R$ 119,99)
insert into promotions (id, type, buy_more_mode, group_qty, group_price_cents, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b1', 'COMPRE_MAIS', 'PRECO_POR_GRUPO', 3, 11999, 'Monte seu Club',
        app_now() - interval '1 day', app_now() + interval '30 days');
select lives_ok('set constraints all immediate', 'Monte seu Club é cadastrado como preço por grupo');
set constraints all deferred;
select is(promotion_state(starts_at, ends_at, ended_at), 'ATIVA', 'situação calculada: ativa')
  from promotions where id = '00000000-0000-0000-0000-0000000000b1';

select throws_ok($$
  insert into promotions (type, buy_more_mode, name, starts_at, ends_at)
  values ('COMPRE_MAIS', 'PRECO_POR_GRUPO', 'Sem grupo', app_now(), app_now() + interval '1 day')
$$, '23514', null, 'preço por grupo exige quantidade e preço do grupo');

savepoint s;
insert into promotions (id, type, buy_more_mode, group_qty, group_price_cents, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b9', 'COMPRE_MAIS', 'PRECO_POR_GRUPO', 3, 11999, 'Com nível', app_now(), app_now() + interval '1 day');
insert into promotion_tiers values ('00000000-0000-0000-0000-0000000000b9', 1, 3, 10);
select throws_ok('set constraints all immediate', 'TS112', null, 'preço por grupo não tem níveis');
rollback to savepoint s;

-- Em níveis: quantidade e porcentagem crescentes
insert into promotions (id, type, buy_more_mode, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b2', 'COMPRE_MAIS', 'NIVEIS', 'Leve mais', app_now(), app_now() + interval '7 days');
insert into promotion_tiers values ('00000000-0000-0000-0000-0000000000b2', 1, 3, 20), ('00000000-0000-0000-0000-0000000000b2', 2, 6, 25);
select lives_ok('set constraints all immediate', 'níveis crescentes são aceitos');
set constraints all deferred;

savepoint s;
insert into promotions (id, type, buy_more_mode, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b3', 'COMPRE_MAIS', 'NIVEIS', 'Errada', app_now(), app_now() + interval '7 days');
insert into promotion_tiers values ('00000000-0000-0000-0000-0000000000b3', 1, 6, 20), ('00000000-0000-0000-0000-0000000000b3', 2, 3, 25);
select throws_ok('set constraints all immediate', 'TS112', null, 'nível com quantidade menor que o anterior é recusado');
rollback to savepoint s;

savepoint s;
insert into promotions (type, buy_more_mode, name, starts_at, ends_at)
values ('COMPRE_MAIS', 'NIVEIS', 'Sem níveis', app_now(), app_now() + interval '7 days');
select throws_ok('set constraints all immediate', 'TS112', null, 'modo em níveis sem nenhum nível é recusado');
rollback to savepoint s;

-- Desconto do produto: só produtos específicos e nunca dois ao mesmo tempo no mesmo produto
select throws_ok($$
  insert into promotions (type, name, starts_at, ends_at) values ('DESCONTO_PRODUTO', 'Todos', app_now(), app_now() + interval '1 day')
$$, '23514', null, 'desconto do produto não vale para todos');

insert into promotions (id, type, scope, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b4', 'DESCONTO_PRODUTO', 'ESPECIFICOS', 'Semana Limone', app_now() - interval '1 hour', app_now() + interval '7 days');
insert into promotion_products (promotion_id, product_id, discount_kind, discount_value)
values ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-00000000a001', 'PERCENTUAL', 20);
select lives_ok('set constraints all immediate', 'desconto do produto com porcentagem');
set constraints all deferred;

savepoint s;
insert into promotions (id, type, scope, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b5', 'DESCONTO_PRODUTO', 'ESPECIFICOS', 'Sobreposta', app_now() + interval '1 day', app_now() + interval '10 days');
select throws_ok($$
  insert into promotion_products (promotion_id, product_id, discount_kind, discount_value)
  values ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-00000000a001', 'PERCENTUAL', 10)
$$, '23P01', null, 'mesmo produto em dois descontos no mesmo período é recusado');
rollback to savepoint s;

savepoint s;
insert into promotions (id, type, scope, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b6', 'DESCONTO_PRODUTO', 'ESPECIFICOS', 'Preço alto', app_now(), app_now() + interval '1 day');
select throws_ok($$
  insert into promotion_products (promotion_id, product_id, discount_kind, discount_value)
  values ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-00000000a002', 'PRECO_FIXO', 4999)
$$, 'TS111', null, 'preço promocional precisa ser menor que o preço do produto');
rollback to savepoint s;

-- Encerrar antes do fim libera o produto para outro desconto
select isnt(end_promotion('00000000-0000-0000-0000-0000000000b4', null), null, 'promoção encerrada antes do fim');
select is((select count(*)::int from audit_log where action = 'promocao.encerrada'), 1, 'encerramento vai para a auditoria');
select throws_ok($$ select end_promotion('00000000-0000-0000-0000-0000000000b4', null) $$, 'TS116', null, 'não encerra duas vezes');

insert into promotions (id, type, scope, name, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b7', 'DESCONTO_PRODUTO', 'ESPECIFICOS', 'Depois', app_now() + interval '1 day', app_now() + interval '10 days');
insert into promotion_products (promotion_id, product_id, discount_kind, discount_value)
values ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-00000000a001', 'PRECO_FIXO', 3999);
select lives_ok('set constraints all immediate', 'depois de encerrada, o produto entra em outro desconto');
set constraints all deferred;

-- Cupom
savepoint s;
insert into promotions (type, name, starts_at, ends_at) values ('CUPOM', 'Sem código', app_now(), app_now() + interval '1 day');
select throws_ok('set constraints all immediate', 'TS114', null, 'cupom precisa de código');
rollback to savepoint s;

savepoint s;
insert into promotions (id, type, name, starts_at, ends_at) values ('00000000-0000-0000-0000-0000000000b8', 'CUPOM', 'Minúsculo', app_now(), app_now() + interval '1 day');
select throws_ok($$
  insert into coupons (promotion_id, code, kind, value, total_quantity, validity_days)
  values ('00000000-0000-0000-0000-0000000000b8', 'bemvinda', 'VALOR', 1000, 100, 3)
$$, '23514', null, 'código do cupom só em maiúsculas e números');
rollback to savepoint s;

-- Orçamento: o usado nunca passa do total
select throws_ok($$
  update promotions set budget_cents = 10000, budget_used_cents = 10001 where id = '00000000-0000-0000-0000-0000000000b1'
$$, '23514', null, 'orçamento usado não passa do orçamento');

select * from finish();
rollback;
