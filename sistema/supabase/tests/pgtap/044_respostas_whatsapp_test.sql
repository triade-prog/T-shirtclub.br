begin;
select plan(33);

-- Atendimento automático (0540): respostas e menu de partida, o que o webhook pergunta antes de
-- responder, a mesma resposta por palavra sem repetir, a pausa quando a equipe responde (e não
-- quando é o próprio robô), o "falar com a equipe" com o aviso uma vez, e o painel.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
\set admin '''00000000-0000-4000-8000-0000000000d1'''
create function pg_temp.ctx(p_id text) returns jsonb language sql as $$ select inbound_context(p_id) $$;
create function pg_temp.resposta(p_titulo text) returns uuid language sql as $$
  select id from whatsapp_quick_replies where title = p_titulo and removed_at is null
$$;

-- ── Partida ──
select is((select count(*) from whatsapp_quick_replies where active), 9::bigint, 'nove opções de partida, todas ativas');
select is((select string_agg(action, ',' order by position) from whatsapp_quick_replies),
  'TEXTO,TEXTO,TEXTO,TEXTO,TEXTO,MINHA_RESERVA,OFERTAS,TROCAS,EQUIPE', 'cinco textos e as quatro ações, equipe no fim');

-- ── Primeira mensagem: sem menu recente, sem pausa ──
select inbound_register('m1', '5577991110001', 'oi');
select is(pg_temp.ctx('m1') - 'respostas', '{"ligadas": true, "pausada": false, "menuRecente": false, "endereco": null, "horario": null}'::jsonb,
  'ligadas, sem pausa e sem menu recente');
select is((select jsonb_build_object('n', jsonb_array_length(c -> 'respostas'), 'primeira', c -> 'respostas' -> 0 -> 'numero', 'titulo', c -> 'respostas' -> 0 ->> 'titulo')
             from pg_temp.ctx('m1') c),
  '{"n": 9, "primeira": 1, "titulo": "Ver as peças e reservar"}'::jsonb, 'as respostas ativas, numeradas na ordem do painel');
select is(inbound_welcome('m1'), true, 'boas-vindas (com o menu) para a primeira mensagem');
select inbound_register('m2', '5577991110001', '3');
select is((pg_temp.ctx('m2') ->> 'menuRecente')::boolean, true, 'depois das boas-vindas, o número escolhido vale');

-- ── Resposta por palavra não se repete; escolhida no menu, sempre sai ──
select is(inbound_answer('m2', 'RESPOSTA', pg_temp.resposta('Entrega e frete'), false), true, 'primeira resposta por palavra sai');
select is((select (handled_as, quick_reply_id = pg_temp.resposta('Entrega e frete'))::text from whatsapp_inbound where wa_message_id = 'm2'),
  '(RESPOSTA,t)', 'marcada com a resposta');
select inbound_register('m3', '5577991110001', 'e o frete?');
select is(inbound_answer('m3', 'RESPOSTA', pg_temp.resposta('Entrega e frete'), false), false, 'a mesma por palavra, de novo, não sai');
select is(inbound_answer('m3', 'RESPOSTA', pg_temp.resposta('Entrega e frete'), true), true, 'escolhida no menu sai');
select throws_ok($$ select inbound_answer('m3', 'QUALQUER', null, true) $$, '22023', null, 'tratamento fora da lista não entra');

-- ── Pausa: a equipe respondeu pelo celular ──
select inbound_from_store('equipe-1', '5577991110001');
select inbound_register('m4', '5577991110001', 'quanto fica?');
select is((pg_temp.ctx('m4') ->> 'pausada')::boolean, true, 'a equipe respondeu: o robô fica quieto');
select is((select (handled_as, text)::text from whatsapp_inbound where wa_message_id = 'equipe-1'), '(DA_LOJA,)', 'da mensagem da equipe, sem o texto');
select inbound_register('m5', '5577991110001', 'menu');
select is(inbound_answer('m5', 'MENU'), true, 'a cliente pede o menu');
select inbound_register('m6', '5577991110001', '2');
select is((pg_temp.ctx('m6') ->> 'pausada')::boolean, false, 'depois do menu, o robô volta');

-- ── O próprio robô não pausa ──
select inbound_register('n1', '5577991110002', 'oi');
select inbound_reply_sent('n1', 'robo-1');
select inbound_from_store('robo-1', '5577991110002');
insert into outbox_messages (dedupe_key, phone_e164, template, status, provider_message_id)
values ('teste-fila', '+5577991110002', 'reserva_criada', 'ENVIADA', 'fila-1');
select inbound_from_store('fila-1', '5577991110002');
select inbound_register('n2', '5577991110002', '1');
select is((pg_temp.ctx('n2') ->> 'pausada')::boolean, false, 'resposta do robô e mensagem da fila não são da equipe');
select is((select reply_ids from whatsapp_inbound where wa_message_id = 'n1'), '{robo-1}'::text[], 'o id da resposta fica na mensagem');
select inbound_reply_sent('n1', '');
select is((select cardinality(reply_ids) from whatsapp_inbound where wa_message_id = 'n1'), 1, 'id vazio não entra');

-- ── Falar com a equipe ──
select admin_update_store_alerts(:admin, '{"telefone": "+5577998887777"}');
select inbound_register('e1', '5577991110003', 'quero falar com atendente');
select is(inbound_answer('e1', 'EQUIPE', pg_temp.resposta('Falar com a equipe'), false), true, 'pedido da equipe');
select is((select params - 'tipo' from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = 'atendimento'),
  '{"final": "0003", "nome": null}'::jsonb, 'aviso para a equipe com o final do número');
select inbound_register('e2', '5577991110003', 'oi?');
select is((pg_temp.ctx('e2') ->> 'pausada')::boolean, true, 'pedida a equipe, o robô fica quieto');
select inbound_register('e3', '5577991110003', 'atendente');
select inbound_answer('e3', 'EQUIPE', pg_temp.resposta('Falar com a equipe'), true);
select is((select count(*) from outbox_messages where template = 'aviso_loja' and params ->> 'tipo' = 'atendimento'), 1::bigint,
  'pedir de novo na mesma pausa não avisa duas vezes');

-- ── Contador do painel ──
select is((whatsapp_queue_stats() ->> 'respostasHoje')::int, 6, 'respostas rápidas, menu e equipe entram nas respostas de hoje');

-- ── A pausa acaba ──
select set_app_clock(interval '5 hours');
select inbound_register('m7', '5577991110001', '2');
select inbound_from_store('equipe-2', '5577991110003');
select set_app_clock(interval '9 hours 1 minute');
select inbound_register('e4', '5577991110003', 'oi');
select is((pg_temp.ctx('e4') ->> 'pausada')::boolean, false, 'depois de 4 horas, o robô volta');

-- ── Desligadas no painel ──
update app_settings set value = '["resposta_rapida"]' where key = 'notificacoes_desligadas';
select is((pg_temp.ctx('e4') ->> 'ligadas')::boolean, false, 'desligadas nas notificações');

-- ── Painel ──
select throws_ok(format($$ select admin_save_quick_reply(%L, '{"titulo": "Brindes", "palavras": ["Brinde"], "texto": "Temos brinde"}') $$, :admin),
  'TS188', null, 'palavra fora do formato (maiúscula) não entra');
select throws_ok(format($$ select admin_save_quick_reply(%L, '{"titulo": "Brindes", "palavras": ["brinde"], "texto": "Temos brinde"}') $$, :admin),
  'TS189', null, 'com 9 ativas, a décima não entra no menu');
select is((select jsonb_array_length(admin_save_quick_reply(:admin, '{"titulo": "Brindes", "palavras": ["brinde", "brinde", "presente"], "texto": "Temos brinde", "ativa": false}') -> 'respostas')),
  10, 'desligada, entra no fim da lista');
select is((select (keywords, position)::text from whatsapp_quick_replies where title = 'Brindes'), '("{brinde,presente}",10)', 'palavras sem repetir, no fim');
select throws_ok(format($$ select admin_remove_quick_reply(%L, %L) $$, :admin, pg_temp.resposta('Minha reserva')), 'TS188', null, 'ação não se exclui, só desliga');
select is((select count(*) from jsonb_array_elements(admin_remove_quick_reply(:admin, pg_temp.resposta('Brindes')) -> 'respostas')), 9::bigint, 'texto se exclui');
select is((select (admin_order_quick_replies(:admin, (select array_agg(id order by position desc) from whatsapp_quick_replies where removed_at is null)) -> 'respostas' -> 0 ->> 'acao')),
  'EQUIPE', 'a ordem nova vale para o menu');
select is((admin_update_quick_reply_settings(:admin, '{"pausaHoras": 6}') ->> 'pausaHoras')::int, 6, 'pausa em horas');

select * from finish();
rollback;
