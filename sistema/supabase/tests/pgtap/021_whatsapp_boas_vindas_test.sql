begin;
select plan(7);

select inbound_register('b1', '5577998128809', 'Oi, tem a Limone?');
select is(inbound_welcome('b1'), true, 'primeira mensagem comum do número: responde');
select is((select handled_as from whatsapp_inbound where wa_message_id = 'b1'), 'BOAS_VINDAS', 'e já fica marcada');

select inbound_register('b2', '5577998128809', 'E a Pitaya?');
select is(inbound_welcome('b2'), false, 'mesmo número dentro de 24 h: não responde de novo');

select inbound_register('b3', '5577981112222', 'Oi');
select is(inbound_welcome('b3'), true, 'outro número: responde');

update whatsapp_inbound set received_at = app_now() - interval '25 hours' where wa_message_id = 'b1';
select inbound_register('b4', '5577998128809', 'Oi de novo');
select is(inbound_welcome('b4'), true, 'passadas 24 h: responde de novo');

select inbound_register('b5', null, 'Oi');
select is(inbound_welcome('b5'), false, 'sem número (LID): não responde');

update app_settings set value = '["boas_vindas"]' where key = 'notificacoes_desligadas';
select inbound_register('b6', '5577983334444', 'Oi');
select is(inbound_welcome('b6'), false, 'desligada no painel: não responde');

select * from finish();
rollback;
