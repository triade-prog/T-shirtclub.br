begin;
select plan(19);

-- Avisos da loja (0510): sem número gravado nada entra; com ele, cada evento entra na fila do
-- WhatsApp como aviso_loja para o número da equipe, com prioridade 2; os desligados não entram;
-- a reserva do painel não avisa; e um aviso com problema nunca derruba o evento que o disparou.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
\set admin '''00000000-0000-4000-8000-0000000000d1'''
create function pg_temp.avisos(p_tipo text) returns bigint language sql as $$
  select count(*) from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = p_tipo
$$;

-- ── Sem número: nada ──
insert into vip_signups (phone_e164, name, source, consent_text) values ('+5577990000001', 'Ana Paula', 'POPUP', 'Quero receber os drops pelo WhatsApp');
select is(pg_temp.avisos('lista_vip'), 0::bigint, 'sem número gravado, nenhum aviso');

-- ── Configuração pelo painel ──
select throws_ok($$ select admin_update_store_alerts('00000000-0000-4000-8000-0000000000d1', '{"telefone": "77999"}') $$,
  'TS185', null, 'número fora do E.164 não entra');
select throws_ok($$ select admin_update_store_alerts('00000000-0000-4000-8000-0000000000d1', '{"desligados": ["reserva_nova"]}') $$,
  'TS185', null, 'aviso que não existe não entra');
select throws_ok($$ select admin_store_alert_test('00000000-0000-4000-8000-0000000000d1') $$, 'TS186', null, 'teste pede o número gravado');
select is(admin_update_store_alerts(:admin, '{"telefone": "+5577998887777"}') ->> 'telefone', '+5577998887777', 'grava o número');
select is((select data ->> 'ligado' from audit_log where action = 'avisos_loja.configuracao' order by id desc limit 1), 'true',
  'a auditoria diz que ligou, sem o número');
select ok(not exists (select 1 from audit_log where action = 'avisos_loja.configuracao' and data::text like '%98887777%'), 'o número não vai para a auditoria');

-- ── Lista VIP ──
insert into vip_signups (phone_e164, name, source, consent_text) values ('+5577990000002', 'Bia Souza', 'RODAPE', 'Quero receber os drops pelo WhatsApp');
select is((select (phone_e164, priority, params ->> 'nome', params ->> 'origem', params ->> 'total')::text
             from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = 'lista_vip'),
  '(+5577998887777,2,Bia,RODAPE,2)', 'inscrição na lista VIP: primeiro nome, origem e total, para o número da equipe, prioridade 2');

-- ── Desligado ──
select is(admin_update_store_alerts(:admin, '{"desligados": ["lista_vip"]}') -> 'desligados', '["lista_vip"]'::jsonb, 'desliga um aviso');
insert into vip_signups (phone_e164, source, consent_text) values ('+5577990000003', 'POPUP', 'Quero receber os drops pelo WhatsApp');
select is(pg_temp.avisos('lista_vip'), 1::bigint, 'o desligado não entra');
select admin_update_store_alerts(:admin, '{"desligados": []}');

-- ── Reserva do site e do painel, pagamento, frete, cancelamento, análise e contestação ──
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999);
insert into customers (id, phone_e164) values ('00000000-0000-4000-8000-0000000000e1', '+5577991112222');
select set_transition_context('T1', 'CLIENTE');
insert into reservations (id, access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent, subtotal_cents, total_cents, expires_at)
values ('00000000-0000-4000-8000-0000000000f1', repeat('a', 64), '00000000-0000-4000-8000-0000000000e1', '+5577991112222', 'Marina Lima',
        'RESERVADO', 'ENVIO', 9998, 9998, app_now() + interval '30 minutes');
insert into reservation_items (reservation_id, product_id, name_snapshot, qty, list_price_cents, total_cents, variant_id, size_snapshot)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000a001', 'Limone Amalfi', 2, 4999, 9998,
        testes.unico('00000000-0000-4000-8000-00000000a001'), 'UNICO');
select is(pg_temp.avisos('nova_reserva'), 0::bigint, 'a nova reserva espera o fim da transação (as peças entram depois)');
set constraints aviso_nova_reserva immediate;
select is((select (params ->> 'numero' is not null, params ->> 'nome', params ->> 'pecas', params ->> 'totalCentavos', params ->> 'retirada')::text
             from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = 'nova_reserva'),
  '(t,Marina,2,9998,false)', 'nova reserva do site: número, primeiro nome, peças, total e entrega');
set constraints aviso_nova_reserva deferred;

insert into customers (id, phone_e164) values ('00000000-0000-4000-8000-0000000000e2', '+5577993334444');
select set_transition_context('T1', 'ADMIN', :admin);
insert into reservations (access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent, subtotal_cents, total_cents, expires_at, channel, created_by)
values (repeat('b', 64), '00000000-0000-4000-8000-0000000000e2', '+5577993334444', 'Rosa Lima', 'RESERVADO', 'RETIRADA', 4999, 4999,
        app_now() + interval '30 minutes', 'PAINEL', :admin);
set constraints aviso_nova_reserva immediate;
select is(pg_temp.avisos('nova_reserva'), 1::bigint, 'a reserva feita no painel não avisa');
set constraints aviso_nova_reserva deferred;

insert into payments (id, reservation_id, method, idempotency_key, amount_cents)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000f1', 'PIX', gen_random_uuid(), 9998);
update payments set status = 'PENDENTE' where id = '00000000-0000-4000-8000-0000000000b1';
select is(pg_temp.avisos('pagamento_aprovado'), 0::bigint, 'pagamento pendente não avisa');
update payments set status = 'APROVADO', approved_at = app_now() where id = '00000000-0000-4000-8000-0000000000b1';
select is((select (params ->> 'valorCentavos', params ->> 'forma', params ->> 'frete')::text
             from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = 'pagamento_aprovado'),
  '(9998,PIX,false)', 'pagamento aprovado: valor, forma e se é frete');

insert into fulfillments (reservation_id, mode, substatus, pickup_code)
values ('00000000-0000-4000-8000-0000000000f1', 'ENVIO', 'AGUARDANDO_CALCULO_FRETE', 'ABCDEF');
select is((select params ->> 'modalidade' from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = 'frete_calcular'),
  'ENVIO', 'frete para calcular');

insert into cancellation_requests (reservation_id) values ('00000000-0000-4000-8000-0000000000f1');
insert into payment_disputes (payment_id, reservation_id, kind) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000f1', 'CONTESTACAO');
select is((pg_temp.avisos('cancelamento'), pg_temp.avisos('contestacao'))::text, '(1,1)', 'pedido de cancelamento e contestação');

-- ── Troca no WhatsApp e alerta do sistema ──
insert into whatsapp_inbound (wa_message_id, from_wa_id, text) values ('wamid.1', '5577991112222', 'quero trocar');
update whatsapp_inbound set handled_as = 'TROCAS' where wa_message_id = 'wamid.1';
select open_alert('PAGAMENTOS_PARADOS', 'pagamentos', 'Pagamentos sem confirmação há 30 minutos');
select is((pg_temp.avisos('troca'), (select params ->> 'mensagem' from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = 'sistema'))::text,
  '(1,"Pagamentos sem confirmação há 30 minutos")', 'cliente falou em troca e alerta do sistema');

-- ── Um aviso com problema não derruba a inscrição ──
update app_settings set value = '"77-numero-quebrado"' where key = 'avisos_loja_telefone';
insert into vip_signups (phone_e164, source, consent_text) values ('+5577990000004', 'POPUP', 'Quero receber os drops pelo WhatsApp');
select ok(exists (select 1 from vip_signups where phone_e164 = '+5577990000004'), 'com o número quebrado, a inscrição entra mesmo assim');

select * from finish();
rollback;
