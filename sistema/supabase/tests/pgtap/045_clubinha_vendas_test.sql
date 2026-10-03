begin;
select plan(24);

-- Clubinha vendedora (0550): aviso para a equipe com os dados da cliente (e sem eles depois de
-- enviado), boas-vindas com o nome e a coleção mais nova, reserva expirada com as peças que
-- seguem à venda (sem convite se o número foi bloqueado), equipe demorou dentro do horário e
-- pós-entrega agendado.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
\set admin '''00000000-0000-4000-8000-0000000000d1'''
-- 14:00 de um sábado na loja (America/Bahia): dentro do horário de atendimento
select set_app_clock(timestamptz '2026-10-10 14:00:00-03' - now());
select admin_update_store_alerts(:admin, '{"telefone": "+5577998887777"}');
create function pg_temp.aviso(p_chave text) returns jsonb language sql as $$
  select params - 'tipo' from outbox_messages where dedupe_key = 'aviso:' || p_chave
$$;

-- Catálogo e a cliente Marina (+55 77 99111-2222), com uma reserva
insert into collections (id, name, slug, color_key, created_at) values
  ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO', app_now() - interval '30 days'),
  ('00000000-0000-4000-8000-00000000c002', 'Estate Italiana', 'estate-italiana', 'MENTA', app_now() - interval '2 days'),
  ('00000000-0000-4000-8000-00000000c003', 'Rascunho', 'rascunho', 'MENTA', app_now() - interval '1 day');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-amalfi', 'Limone Amalfi', 4999),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000c001', 'LIM-02', 'limone-capri', 'Limone Capri', 4999),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000c002', 'EST-01', 'estate-roma', 'Estate Roma', 4999),
  ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000c003', 'RAS-01', 'rascunho-1', 'Rascunho', 4999);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', name, 10, 10, 1 from products where code in ('LIM-01', 'LIM-02', 'EST-01');
update products set published_at = app_now() - interval '1 day' where code in ('LIM-01', 'LIM-02', 'EST-01');
select testes.estoque('00000000-0000-4000-8000-00000000a001', 3);
select testes.estoque('00000000-0000-4000-8000-00000000a002', 1, 0, 1);
insert into customers (id, phone_e164) values ('00000000-0000-4000-8000-0000000000e1', '+5577991112222');
select set_transition_context('T1', 'CLIENTE');
insert into reservations (id, number, access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent, subtotal_cents, total_cents, expires_at)
values ('00000000-0000-4000-8000-0000000000f1', 1048, repeat('a', 64), '00000000-0000-4000-8000-0000000000e1', '+5577991112222', 'Marina Lima',
        'RESERVADO', 'RETIRADA', 9998, 9998, app_now() + interval '30 minutes');
insert into reservation_items (reservation_id, product_id, name_snapshot, qty, list_price_cents, total_cents, variant_id, size_snapshot) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000a001', 'Limone Amalfi', 1, 4999, 4999, testes.unico('00000000-0000-4000-8000-00000000a001'), 'UNICO'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000a002', 'Limone Capri', 1, 4999, 4999, testes.unico('00000000-0000-4000-8000-00000000a002'), 'UNICO');

-- ── Quem é a cliente ──
select is(wa_phone_candidates('557791112222'), '{+5577991112222}'::text[], 'sem o nono dígito, o telefone ganha o 9');
select is(wa_phone_candidates('123456789@lid'), '{}'::text[], 'identificador LID não é telefone');
select is(wa_customer_name('5577991112222'), 'Marina', 'primeiro nome da última reserva do número');

-- ── Boas-vindas: nome e coleção mais nova (com peça à venda) ──
select inbound_register('b1', '5577991112222', 'oi, boa tarde');
select is((select jsonb_build_object('nome', c -> 'nome', 'novidade', c -> 'novidade') from inbound_context('b1') c),
  '{"nome": "Marina", "novidade": {"nome": "Estate Italiana", "slug": "estate-italiana"}}'::jsonb,
  'o contexto traz o nome e a coleção mais nova que tem peça à venda');
select inbound_register('b2', '5577990000009', 'oi');
select is(inbound_context('b2') -> 'nome', 'null'::jsonb, 'número sem reserva: sem nome');

-- ── Falar com a equipe: o aviso traz quem é, o pedido e o que ela escreveu ──
select inbound_register('b3', '5577991112222', 'tem a Limone Capri no plus?');
select inbound_register('b4', '5577991112222', '9');
select inbound_answer('b4', 'EQUIPE', null, true);
select is(pg_temp.aviso('atendimento:' || (select id from whatsapp_inbound where wa_message_id = 'b4')),
  '{"nome": "Marina", "telefone": "+5577991112222", "final": "2222", "pedido": {"numero": 1048, "status": "RESERVADO", "substatus": null},
    "mensagens": ["oi, boa tarde", "tem a Limone Capri no plus?"]}'::jsonb,
  'nome, telefone, final, último pedido e as mensagens, sem o número do menu');

-- ── Troca, com os dados da cliente ──
insert into whatsapp_inbound (wa_message_id, from_wa_id, text) values ('t1', '5577991112222', 'quero trocar a minha');
update whatsapp_inbound set handled_as = 'TROCAS' where wa_message_id = 't1';
select is((select (p ->> 'nome', p ->> 'telefone', p -> 'mensagens' ->> -1) from pg_temp.aviso('troca:' || (select id from whatsapp_inbound where wa_message_id = 't1')) p)::text,
  '(Marina,+5577991112222,"quero trocar a minha")', 'aviso de troca com o nome, o telefone e o que ela escreveu');

-- ── Depois de enviado, o aviso fica sem o telefone e sem as mensagens ──
update outbox_messages set status = 'ENVIANDO' where dedupe_key like 'aviso:troca:%';
select ok((select params ? 'telefone' from outbox_messages where dedupe_key like 'aviso:troca:%'), 'enquanto sai, o aviso tem o telefone');
select outbox_result((select id from outbox_messages where dedupe_key like 'aviso:troca:%'), true, 'wa-1');
select is((select params from outbox_messages where dedupe_key like 'aviso:troca:%'),
  '{"tipo": "troca", "nome": "Marina", "final": "2222", "pedido": {"numero": 1048, "status": "RESERVADO", "substatus": null}}'::jsonb,
  'enviado, ficam só o nome, o final e o pedido');

-- ── Equipe demorou ──
select is(whatsapp_team_followup(), 0, 'antes de 20 minutos, nada');
select set_app_clock(timestamptz '2026-10-10 14:21:00-03' - now());
select is(whatsapp_team_followup(), 1, 'depois de 20 minutos sem resposta, acompanha');
select is((select (phone_e164, priority, params ->> 'nome')::text from outbox_messages where template = 'atendimento_lembrete'),
  '(+5577991112222,1,Marina)', 'a Clubinha avisa a cliente, pelo nome');
select is((select (params ->> 'lembrete', params ->> 'nome', params ? 'desde')::text from outbox_messages
            where dedupe_key like 'aviso:atendimento:%:lembrete'),
  '(true,Marina,t)', 'e a equipe recebe o aviso de novo, com a hora do pedido');
select is(whatsapp_team_followup(), 0, 'uma vez por pedido');

-- A equipe respondeu pelo celular: sem acompanhamento
select inbound_register('c1', '5577993334444', 'atendente');
select inbound_answer('c1', 'EQUIPE', null, true);
select inbound_from_store('equipe-1', '5577993334444');
-- A cliente voltou ao menu: sem acompanhamento
select inbound_register('d1', '5577995556666', 'atendente');
select inbound_answer('d1', 'EQUIPE', null, true);
select inbound_register('d2', '5577995556666', 'menu');
select inbound_answer('d2', 'MENU');
select set_app_clock(timestamptz '2026-10-10 14:45:00-03' - now());
select is(whatsapp_team_followup(), 0, 'a equipe respondeu ou a cliente voltou ao menu: nada');

-- Fora do horário espera; às 8h acompanha
select set_app_clock(timestamptz '2026-10-10 22:30:00-03' - now());
select inbound_register('e2', '5577997770000', 'atendente');
select inbound_answer('e2', 'EQUIPE', null, true);
select set_app_clock(timestamptz '2026-10-10 23:00:00-03' - now());
select is(whatsapp_team_followup(), 0, 'às 23h, nada');
select set_app_clock(timestamptz '2026-10-11 08:01:00-03' - now());
select is(whatsapp_team_followup(), 1, 'às 8h, acompanha o pedido da noite');

-- ── Reserva não paga: as peças que seguem à venda ──
select set_app_clock(timestamptz '2026-10-10 14:00:00-03' - now());
select enqueue_message('reserva_expirada:teste', '+5577991112222', 'reserva_expirada', '{"numero": 1048}', 1::smallint,
                       app_now() + interval '1 hour', '00000000-0000-4000-8000-0000000000f1');
select is((select params -> 'disponiveis' from outbox_messages where dedupe_key = 'reserva_expirada:teste'),
  '[{"nome": "Limone Amalfi", "slug": "limone-amalfi"}]'::jsonb, 'só a peça que ainda tem estoque, com o link');
insert into phone_blocks (customer_id, trigger_reservations) values ('00000000-0000-4000-8000-0000000000e1', array['00000000-0000-4000-8000-0000000000f1'::uuid]);
select is((select (params ? 'disponiveis', params ->> 'pausada') from outbox_messages where dedupe_key = 'reserva_expirada:teste')::text,
  '(f,true)', 'o número foi bloqueado: sai o convite');
select enqueue_message('reserva_expirada:teste2', '+5577991112222', 'reserva_expirada', '{"numero": 1048}', 1::smallint,
                       app_now() + interval '1 hour', '00000000-0000-4000-8000-0000000000f1');
select is((select params ->> 'pausada' from outbox_messages where dedupe_key = 'reserva_expirada:teste2'), 'true', 'já bloqueado: sem convite');

-- ── Pós-entrega: 2 dias depois, no horário de atendimento ──
select set_transition_context('T2', 'PROVEDOR');
update reservations set status = 'PAGAMENTO_CONFIRMADO' where id = '00000000-0000-4000-8000-0000000000f1';
select set_app_clock(timestamptz '2026-10-10 21:30:00-03' - now());
select set_transition_context('T5', 'ADMIN', :admin);
update reservations set status = 'ENTREGUE' where id = '00000000-0000-4000-8000-0000000000f1';
select is((select (template, params ->> 'nome', requires_status, next_attempt_at = timestamptz '2026-10-13 08:00:00-03')::text
             from outbox_messages where dedupe_key = 'pos_venda:00000000-0000-4000-8000-0000000000f1'),
  '(pos_venda,Marina,ENTREGUE,t)', 'entregue às 21h30: a mensagem sai 2 dias depois, às 8h');
update app_settings set value = '["pos_venda"]' where key = 'notificacoes_desligadas';
select is(enqueue_message('pos_venda:outra', '+5577991112222', 'pos_venda', '{}', p_optional => true), null, 'desligada no painel, não entra na fila');
select is(next_business_time(timestamptz '2026-10-10 12:00:00-03'), timestamptz '2026-10-10 12:00:00-03', 'no horário, o mesmo instante');
select is(next_business_time(timestamptz '2026-10-10 06:00:00-03'), timestamptz '2026-10-10 08:00:00-03', 'cedo, às 8h do mesmo dia');

select set_app_clock(interval '0');
select * from finish();
rollback;
