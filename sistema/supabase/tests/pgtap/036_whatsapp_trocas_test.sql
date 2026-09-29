begin;
select plan(9);

select inbound_register('t1', '5577998128809', 'Quero trocar a Limone');
select is(inbound_exchange('t1'), true, 'primeira mensagem sobre troca do número: responde');
select is((select handled_as from whatsapp_inbound where wa_message_id = 't1'), 'TROCAS', 'e já fica marcada');

select inbound_register('t2', '5577998128809', 'É o pedido 1048, tamanho M');
select is(inbound_exchange('t2'), false, 'mesmo número dentro de 24 h: não responde de novo');

select inbound_register('t3', '5577981112222', 'Como faço a devolução?');
select is(inbound_exchange('t3'), true, 'outro número: responde');

-- A resposta de boas-vindas e a de trocas contam cada uma o seu intervalo
select inbound_register('t4', '5577981112222', 'Oi');
select is(inbound_welcome('t4'), true, 'a política não conta como boas-vindas');

update whatsapp_inbound set received_at = app_now() - interval '25 hours' where wa_message_id = 't1';
select inbound_register('t5', '5577998128809', 'Troca de novo');
select is(inbound_exchange('t5'), true, 'passadas 24 h: responde de novo');

select inbound_register('t6', null, 'troca');
select is(inbound_exchange('t6'), false, 'sem número (LID): não responde');

update app_settings set value = '["trocas"]' where key = 'notificacoes_desligadas';
select inbound_register('t7', '5577983334444', 'troca');
select is(inbound_exchange('t7'), false, 'desligada no painel: não responde');

select is(has_function_privilege('anon', 'public.inbound_exchange(text)', 'execute'), false, 'a chave anon não chama');

select * from finish();
rollback;
