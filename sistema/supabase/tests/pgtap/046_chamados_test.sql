begin;
select plan(27);

-- Chamados (0550): abrem com a dúvida que a Clubinha não respondeu (e com falar com a equipe ou
-- troca), um aberto por conversa, o robô quieto enquanto ele está aberto; a equipe assume e
-- finaliza pelo WhatsApp (só do número dos avisos) ou pelo painel; ao finalizar, a Clubinha pede
-- a nota, que vai para a equipe; e as respostas de partida conferidas com a loja.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
\set admin '''00000000-0000-4000-8000-0000000000d1'''
select admin_update_store_alerts(:admin, '{"telefone": "+5577998887777"}');
create function pg_temp.chamado(p_chat text) returns whatsapp_tickets language sql as $$
  select * from whatsapp_tickets where chat = p_chat order by id desc limit 1
$$;
create function pg_temp.comando(p_id text, p_de text, p_acao text, p_numero bigint) returns jsonb language sql as $$
  select inbound_register(p_id, p_de, p_acao || ' ' || p_numero);
  select ticket_command(p_id, p_acao, p_numero)
$$;

-- ── Dúvida que a Clubinha não respondeu ──
select inbound_register('a1', '5577991230001', 'vocês fazem embrulho pra presente?');
select is((select (r ->> 'novo')::boolean from inbound_ticket('a1') r), true, 'a dúvida abre o chamado');
select is((select (status, reason, phone_e164)::text from pg_temp.chamado('5577991230001')), '(ABERTO,DUVIDA,+5577991230001)', 'aberto, por dúvida, com o telefone');
select is((select handled_as from whatsapp_inbound where wa_message_id = 'a1'), 'CHAMADO', 'a mensagem fica marcada como chamado');
select is((select params ->> 'motivo' from outbox_messages where dedupe_key = 'aviso:atendimento:chamado:' || (pg_temp.chamado('5577991230001')).id),
  'DUVIDA', 'a equipe recebe o aviso do chamado');
select inbound_register('a2', '5577991230001', 'e qual o prazo?');
select is((select (r ->> 'novo')::boolean from inbound_ticket('a2') r), false, 'outra dúvida entra no mesmo chamado');
select is((select count(*) from outbox_messages where params ->> 'tipo' = 'atendimento'), 1::bigint, 'sem aviso repetido');
select is((inbound_context('a2') ->> 'pausada')::boolean, true, 'com o chamado aberto, o robô fica quieto');

-- ── Comandos: só do número dos avisos ──
select is(pg_temp.comando('x1', '5577991230001', 'RESOLVER', (pg_temp.chamado('5577991230001')).id), '{"equipe": false}'::jsonb,
  'de outro número, não é comando');
select is((select status from pg_temp.chamado('5577991230001')), 'ABERTO', 'e o chamado segue aberto');
select is(pg_temp.comando('x2', '557798887777', 'ASSUMIR', (pg_temp.chamado('5577991230001')).id) - 'numero',
  '{"equipe": true, "resultado": "ASSUMIDO"}'::jsonb, 'a equipe assume pelo WhatsApp (o número chega sem o nono dígito)');
select is((select (status, taken_via)::text from pg_temp.chamado('5577991230001')), '(EM_ATENDIMENTO,WHATSAPP)', 'em atendimento, pelo WhatsApp');
select is((select handled_as from whatsapp_inbound where wa_message_id = 'x2'), 'COMANDO', 'o comando não conta como mensagem de cliente');
select is(pg_temp.comando('x3', '5577998887777', 'ASSUMIR', (pg_temp.chamado('5577991230001')).id) ->> 'resultado', 'JA_ASSUMIDO', 'assumir de novo');
select is(pg_temp.comando('x4', '5577998887777', 'RESOLVER', (pg_temp.chamado('5577991230001')).id) - 'numero',
  '{"equipe": true, "resultado": "RESOLVIDO", "notaPedida": true}'::jsonb, 'a equipe finaliza pelo WhatsApp e a nota é pedida');
select is((select (phone_e164, priority)::text from outbox_messages where template = 'atendimento_encerrado'), '(+5577991230001,1)',
  'a Clubinha manda o encerramento para a cliente');
select is(pg_temp.comando('x5', '5577998887777', 'RESOLVER', (pg_temp.chamado('5577991230001')).id) ->> 'resultado', 'JA_RESOLVIDO', 'finalizar de novo');
select is(pg_temp.comando('x6', '5577998887777', 'RESOLVER', 999999) ->> 'resultado', 'NAO_ENCONTRADO', 'chamado que não existe');

-- ── Depois de finalizar: o robô volta e a nota vale uma vez ──
select inbound_register('a3', '5577991230001', '5');
select is((select (c ->> 'pausada', c ->> 'avaliacaoPendente')::text from inbound_context('a3') c), '(false,true)', 'finalizado: o robô volta e espera a nota');
select is(ticket_rate('a3', 5) - 'numero', '{"ok": true, "nota": 5}'::jsonb, 'nota 5');
select is((select (params ->> 'nota', params ->> 'chamado' = (pg_temp.chamado('5577991230001')).id::text)::text
             from outbox_messages where params ->> 'tipo' = 'avaliacao'), '(5,t)', 'a nota vai para a equipe');
select inbound_register('a4', '5577991230001', '1');
select is(ticket_rate('a4', 1), '{"ok": false}'::jsonb, 'a nota vale uma vez');
select throws_ok($$ select ticket_rate('a4', 7) $$, '22023', null, 'nota fora de 1 a 5');

-- ── Painel: falar com a equipe, assumir e finalizar; encerramento desligado não pede nota ──
select set_app_clock(interval '1 minute');
select inbound_register('b1', '5577991230002', 'atendente');
select inbound_answer('b1', 'EQUIPE', null, true);
select is((select jsonb_array_length(admin_take_ticket(:admin, (pg_temp.chamado('5577991230002')).id) -> 'abertos')), 1, 'assumido pelo painel, segue na lista dos abertos');
update app_settings set value = '["atendimento_encerrado"]' where key = 'notificacoes_desligadas';
select is((select (j -> 'finalizados' -> 0 ->> 'resolvidoVia', j -> 'finalizados' -> 0 ->> 'notaPedida', j -> 'finalizados' -> 1 ->> 'nota', j -> 'notas' ->> 'media')::text
             from admin_resolve_ticket(:admin, (pg_temp.chamado('5577991230002')).id) j),
  '(PAINEL,false,5,5.0)', 'finalizado pelo painel, sem o pedido de nota; a lista mostra a nota e a média');
select is((select count(*) from audit_log where action in ('chamado.assumido', 'chamado.finalizado') and actor_type = 'ADMIN'), 2::bigint,
  'assumir e finalizar pelo painel vão para a auditoria');

-- ── Respostas de partida conferidas com a loja ──
select ok((select body like '%à vista%Por enquanto não temos parcelamento nem cartão de débito%' from whatsapp_quick_replies where title = 'Pagamento'),
  'pagamento: crédito à vista, sem parcelamento nem débito');
select ok((select body like '%*Motoboy*, só em Caetité%em até 2 horas.' from whatsapp_quick_replies where title = 'Entrega e frete'),
  'entrega: motoboy só em Caetité e o frete pago em até 2 horas');

select set_app_clock(interval '0');
select * from finish();
rollback;
