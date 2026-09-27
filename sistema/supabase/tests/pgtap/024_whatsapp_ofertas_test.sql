begin;
select plan(5);

delete from coupons;
delete from promotions;
insert into promotions (id, type, buy_more_mode, group_qty, group_price_cents, name, starts_at, ends_at) values
  ('00000000-0000-4000-8000-0000000000f1', 'COMPRE_MAIS', 'PRECO_POR_GRUPO', 3, 11999, 'Club', app_now() - interval '1 day', app_now() + interval '30 days');
insert into promotions (id, type, name, starts_at, ends_at) values
  ('00000000-0000-4000-8000-0000000000f2', 'CUPOM', 'Boas-vindas', app_now() - interval '1 day', app_now() + interval '30 days'),
  ('00000000-0000-4000-8000-0000000000f3', 'CUPOM', 'Esgotado', app_now() - interval '1 day', app_now() + interval '30 days'),
  ('00000000-0000-4000-8000-0000000000f4', 'CUPOM', 'Agendado', app_now() + interval '1 day', app_now() + interval '30 days');
insert into coupons (promotion_id, code, kind, value, total_quantity, validity_days) values
  ('00000000-0000-4000-8000-0000000000f2', 'BEMVINDA10', 'VALOR', 1000, 10, 3),
  ('00000000-0000-4000-8000-0000000000f3', 'ACABOU', 'VALOR', 1000, 1, 3),
  ('00000000-0000-4000-8000-0000000000f4', 'DEPOIS', 'VALOR', 1000, 10, 3);
update coupons set used_quantity = 1 where code = 'ACABOU';

select is(jsonb_array_length(whatsapp_offers()), 2, 'só a promoção ativa e o cupom que ainda dá para usar');
select is(whatsapp_offers() -> 0 ->> 'nome', 'Club', 'o "compre mais" vem antes dos cupons');
select is(whatsapp_offers() -> 1 ->> 'codigo', 'BEMVINDA10', 'o cupom leva o código');
select is(whatsapp_offers() -> 0 -> 'grupo', '{"qtd": 3, "precoCentavos": 11999}'::jsonb, 'no formato do motor de preço');

update promotions set ended_at = app_now() - interval '1 second' where name = 'Club';
select is(jsonb_array_length(whatsapp_offers()), 1, 'encerrada sai da lista');

select * from finish();
rollback;
