begin;
select plan(16);

-- Lista VIP (0390): entrada com consentimento, um registro por número, cupom de boas-vindas só
-- quando está valendo, lista e exportação no painel (com auditoria sem dado pessoal) e saída
-- que apaga o registro.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
create temp table t (nome text primary key, v jsonb);
\set consentimento 'Quero receber novidades, drops e ofertas da T-shirt Club pelo WhatsApp.'

-- Sem cupom configurado
insert into t values ('a', vip_signup('+5577998128809', 'Marina', 'POPUP', :'consentimento', null));
select is((select v ->> 'novo' from t where nome = 'a'), 'true', 'número novo entra na lista');
select is((select v -> 'cupom' from t where nome = 'a'), 'null'::jsonb, 'sem cupom configurado, não há cupom');
select is(vip_offer(), null, 'e o rodapé não promete benefício');

-- O mesmo número de novo: renova o consentimento, sem duplicar
insert into t values ('b', vip_signup('+5577998128809', null, 'RODAPE', :'consentimento', null));
select is((select v ->> 'novo' from t where nome = 'b'), 'false', 'o mesmo número não entra duas vezes');
select is((select name from vip_signups where phone_e164 = '+5577998128809'), 'Marina', 'e o nome que já estava fica');
select throws_ok($$ select vip_signup('+5577998128809', null, 'INSTAGRAM', 'Quero receber novidades pelo WhatsApp.', null) $$, '23514', null, 'origem desconhecida é recusada');

-- Cupom de boas-vindas: 10% num cupom que está valendo
select admin_save_promotion('00000000-0000-4000-8000-0000000000d1', null, jsonb_build_object(
  'nome', 'Boas-vindas VIP', 'tipo', 'CUPOM', 'inicio', app_now() - interval '1 hour', 'fim', app_now() + interval '30 days',
  'cupom', jsonb_build_object('codigo', 'VIP10', 'modo', 'PERCENTUAL', 'valor', 10, 'quantidadeTotal', 2, 'validadeDias', 3)));
select throws_ok($$ select admin_set_vip_coupon('00000000-0000-4000-8000-0000000000d1', 'NAOEXISTE') $$, 'TS130', null, 'cupom que não existe é recusado');
select is(admin_set_vip_coupon('00000000-0000-4000-8000-0000000000d1', ' vip10 ') ->> 'cupom', 'VIP10', 'o painel escolhe o cupom');
select is(vip_offer(), '{"modo": "PERCENTUAL", "valor": 10, "minimoCentavos": null}'::jsonb, 'o rodapé mostra o benefício, sem o código');
select is(vip_signup('+5571991112222', 'Ana', 'RODAPE', :'consentimento', null) -> 'cupom' ->> 'codigo', 'VIP10', 'quem entra vê o código');

-- Cupom esgotado some
update coupons set used_quantity = total_quantity where code = 'VIP10';
select is(vip_signup('+5573995556666', null, 'POPUP', :'consentimento', null) -> 'cupom', 'null'::jsonb, 'cupom esgotado não aparece');

-- Painel
select is((admin_list_vip() ->> 'total')::int, 3, 'a lista tem os três números');
select is((admin_list_vip('9981') -> 'itens' -> 0 ->> 'nome'), 'Marina', 'busca pelo número');
select is(jsonb_array_length(admin_export_vip('00000000-0000-4000-8000-0000000000d1')), 3, 'exporta a lista inteira');
select lives_ok($$ select admin_remove_vip('00000000-0000-4000-8000-0000000000d1', (select id from vip_signups where phone_e164 = '+5571991112222')) $$, 'sair da lista');
select is((select string_agg(action, ',' order by id) from audit_log where action like 'vip.%'), 'vip.cupom,vip.exportada,vip.removido',
  'cupom, exportação e saída ficam na auditoria (sem dado pessoal)');

select * from finish();
rollback;
