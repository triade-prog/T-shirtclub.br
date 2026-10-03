begin;
select plan(24);

-- Painel de WhatsApp (0570): as conversas, a conversa inteira com a ficha, o histórico da fila
-- com "Tentar de novo", os números do atendimento e o horário de atendimento editável.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
\set admin '''00000000-0000-4000-8000-0000000000d1'''
select admin_update_store_alerts(:admin, '{"telefone": "+5577998887777"}');
create function pg_temp.conversas() returns jsonb language sql as $$ select admin_wa_conversations() $$;
create function pg_temp.eventos(p_chat text) returns text language sql as $$
  select string_agg(e ->> 'tipo' || coalesce(':' || (e ->> 'evento'), ''), ',' order by n)
    from jsonb_array_elements(admin_wa_conversation(p_chat) -> 'eventos') with ordinality as x(e, n)
$$;

-- Ana pede a equipe; Bia só pergunta do frete; a equipe manda um comando do número dela
select inbound_register('a1', '5577991230001', 'quero falar com alguém');
select inbound_answer('a1', 'EQUIPE', null, true);
select set_app_clock(interval '1 minute');
select inbound_register('b1', '5577991230002', 'qual o frete?');
select inbound_mark('b1', 'RESPOSTA');
select inbound_register('x1', '5577998887777', 'assumi 1');
select inbound_mark('x1', 'COMANDO');

-- ── Conversas ──
select is((select jsonb_agg(c ->> 'chat') from jsonb_array_elements(pg_temp.conversas()) c), '["5577991230001", "5577991230002"]'::jsonb,
  'a conversa com chamado aberto vem primeiro, e a da equipe não entra');
select is((select (c -> 'chamado' ->> 'status', c -> 'chamado' ->> 'motivo', c ->> 'telefone')::text from jsonb_array_elements(pg_temp.conversas()) c
            where c ->> 'chat' = '5577991230001'), '(ABERTO,EQUIPE,+5577991230001)', 'com o chamado e o telefone');
select is((select c -> 'ultima' ->> 'texto' from jsonb_array_elements(pg_temp.conversas()) c where c ->> 'chat' = '5577991230002'),
  'qual o frete?', 'com a última mensagem da cliente');

-- ── A conversa inteira ──
-- A Clubinha respondeu (o eco da resposta volta como "da loja") e a equipe respondeu pelo celular
update whatsapp_inbound set reply_ids = '{eco1}' where wa_message_id = 'a1';
select inbound_from_store('eco1', '5577991230001');
select set_app_clock(interval '2 minutes');
select inbound_from_store('eq1', '5577991230001');
select whatsapp_team_followup();
select set_app_clock(interval '3 minutes');
select enqueue_message('teste:1', '+5577991230001', 'pedido_entregue', '{"numero": 1001}', 2::smallint, null, null);
select is(pg_temp.eventos('5577991230001'), 'CLIENTE,CHAMADO:ABERTO,EQUIPE,CHAMADO:ASSUMIDO,ENVIO',
  'a mensagem, o chamado, a resposta da equipe pelo celular (que assume) e a mensagem da fila, sem o eco do robô');
select is((admin_wa_conversation('5577991230001') -> 'eventos' -> 0 ->> 'texto'), 'quero falar com alguém', 'com o texto da cliente');
select is((admin_wa_conversation('5577991230001') -> 'eventos' -> 4 ->> 'modelo'), 'pedido_entregue', 'a da fila vem com o modelo');
select is((admin_wa_conversation('5577991230001') -> 'chamados' -> 0 ->> 'assumidoVia'), 'CELULAR', 'e o chamado na ficha');
select throws_ok($$ select admin_wa_conversation('5577998887777') $$, 'TS123', null, 'a conversa da equipe não abre');
select throws_ok($$ select admin_wa_conversation('x; select 1') $$, 'TS123', null, 'nem um número inválido');

-- ── Envios ──
select enqueue_message('teste:2', '+5577991230002', 'pedido_entregue', '{"numero": 1002}', 2::smallint, null, null);
select enqueue_message('teste:3', '+5577991230002', 'saiu_entrega', '{"numero": 1002}', 2::smallint, app_now() + interval '1 minute', null);
update outbox_messages set status = 'FALHOU', attempts = 5, last_error = 'recusada' where dedupe_key in ('teste:2', 'teste:3');
select is((select jsonb_array_length(admin_outbox_list('FALHOU') -> 'mensagens')), 2, 'filtro das que falharam');
select is((select jsonb_array_length(admin_outbox_list(null) -> 'dias')), 7, 'resumo dos últimos 7 dias');
select set_app_clock(interval '5 minutes');
select is((select jsonb_object_agg(m ->> 'modelo', coalesce(m ->> 'naoReenvia', 'pode')) from jsonb_array_elements(admin_outbox_list('FALHOU') -> 'mensagens') m),
  '{"pedido_entregue": "pode", "saiu_entrega": "VENCIDA"}'::jsonb, 'a vencida não volta');
select is(admin_outbox_retry(:admin, (select id from outbox_messages where dedupe_key = 'teste:2')), '{"ok": true}'::jsonb, 'tentar de novo');
select is((select (status, attempts, last_error)::text from outbox_messages where dedupe_key = 'teste:2'), '(PENDENTE,0,)', 'volta para a fila, do zero');
select is((select count(*) from audit_log where action = 'whatsapp.reenvio'), 1::bigint, 'e vai para a auditoria');
select is(admin_outbox_retry(:admin, (select id from outbox_messages where dedupe_key = 'teste:2')), '{"ok": false, "motivo": "STATUS"}'::jsonb,
  'só a que falhou');
select is(admin_outbox_retry(:admin, (select id from outbox_messages where dedupe_key = 'teste:3')), '{"ok": false, "motivo": "VENCIDA"}'::jsonb,
  'a vencida não');
select throws_ok($$ select admin_outbox_list('OUTRO') $$, 'TS110', null, 'filtro inválido');

-- ── Números ──
select is((select (r ->> 'conversas', r ->> 'soClubinha', r ->> 'chamados', r -> 'porMotivo' ->> 'EQUIPE')::text from admin_wa_report(7) r),
  '(2,1,1,1)', 'duas conversas, uma só com a Clubinha, um chamado pedindo a equipe');
select throws_ok($$ select admin_wa_report(3) $$, 'TS110', null, 'período de 7 ou 30 dias');

-- ── Horário de atendimento ──
select is((admin_update_quick_reply_settings(:admin, '{"inicioHora": 9, "fimHora": 18, "lembreteMinutos": 30}') -> 'atendimento'),
  '{"fimHora": 18, "inicioHora": 9, "lembreteMinutos": 30}'::jsonb, 'horário e lembrete salvos');
select is((select count(*) from audit_log where action in ('whatsapp.horario', 'whatsapp.lembrete')), 3::bigint, 'cada mudança na auditoria');
select throws_ok($$ select admin_update_quick_reply_settings('00000000-0000-4000-8000-0000000000d1', '{"inicioHora": 19}') $$, 'TS188', null,
  'o início vem antes do fim');
select is((admin_update_quick_reply_settings(:admin, '{"pausaHoras": 6}') ->> 'pausaHoras')::int, 6, 'a pausa segue funcionando');

select set_app_clock(interval '0');
select * from finish();
rollback;
