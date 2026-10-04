begin;
select plan(11);

-- Tela da reserva v2 (0580): as mensagens da reserva (sem os avisos da equipe), o número da
-- operação no Mercado Pago, e da cliente a conversa, as compras, as outras reservas e os chamados.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into customers (id, phone_e164) values ('00000000-0000-4000-8000-0000000000e1', '+5577991110001');

create function pg_temp.reserva(p_id uuid, p_hash text, p_total int, p_paga boolean) returns void language plpgsql as $$
declare r reservations;
begin
  perform set_transition_context('T1', 'ADMIN');
  insert into reservations (id, access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent, subtotal_cents, total_cents, expires_at, channel, created_by)
  values (p_id, p_hash, '00000000-0000-4000-8000-0000000000e1', '+5577991110001', 'Ana Paula', 'RESERVADO', 'RETIRADA', p_total, p_total,
          app_now() + interval '1 hour', 'PAINEL', '00000000-0000-4000-8000-0000000000d1');
  if p_paga then
    perform set_transition_context('T2', 'PROVEDOR');
    update reservations set status = 'PAGAMENTO_CONFIRMADO', payment_confirmed_at = app_now() where id = p_id returning * into r;
    perform ensure_fulfillment(r);
  end if;
end $$;
create function pg_temp.d() returns jsonb language sql as $$ select admin_reservation_detail('00000000-0000-4000-8000-0000000000f2') $$;

-- Uma compra antiga e a reserva de agora
select pg_temp.reserva('00000000-0000-4000-8000-0000000000f1', repeat('a', 64), 3000, true);
select set_app_clock(interval '1 hour');
-- A cliente escreveu antes, de um aparelho que manda o número sem o nono dígito
select inbound_register('m1', '557791110001', 'oi');
select set_app_clock(interval '2 hours');
select pg_temp.reserva('00000000-0000-4000-8000-0000000000f2', repeat('b', 64), 4999, true);
insert into payments (reservation_id, method, idempotency_key, provider_payment_id, amount_cents, status, applied, approved_at)
values ('00000000-0000-4000-8000-0000000000f2', 'PIX', gen_random_uuid(), '123456789', 4999, 'APROVADO', true, app_now());

select enqueue_message('teste:criada', '+5577991110001', 'pagamento_confirmado', '{"numero": 1002}', 1::smallint, null,
                       '00000000-0000-4000-8000-0000000000f2');
select enqueue_message('teste:falha', '+5577991110001', 'pronto_retirada', '{"numero": 1002}', 2::smallint, null,
                       '00000000-0000-4000-8000-0000000000f2');
update outbox_messages set status = 'FALHOU', attempts = 5, last_error = 'recusada' where dedupe_key = 'teste:falha';
select enqueue_message('teste:aviso', '+5577998887777', 'aviso_loja', '{"tipo": "nova_reserva"}', 1::smallint, null,
                       '00000000-0000-4000-8000-0000000000f2');
select ticket_open('557791110001', 'DUVIDA');

-- ── Mensagens ──
select is((select jsonb_agg(m ->> 'modelo' order by m ->> 'criadaEm', m ->> 'modelo') from jsonb_array_elements(pg_temp.d() -> 'mensagens') m),
  '["pagamento_confirmado", "pronto_retirada"]'::jsonb, 'as mensagens da reserva, sem o aviso da equipe');
select is((select m -> 'params' ->> 'numero' from jsonb_array_elements(pg_temp.d() -> 'mensagens') m where m ->> 'modelo' = 'pronto_retirada'),
  '1002', 'com os parâmetros para montar o texto');
select is((select (m ->> 'status', m ->> 'erro', coalesce(m ->> 'naoReenvia', 'pode'))::text from jsonb_array_elements(pg_temp.d() -> 'mensagens') m
            where m ->> 'modelo' = 'pronto_retirada'), '(FALHOU,recusada,pode)', 'a que falhou, com o motivo e podendo voltar para a fila');
select is((select m ->> 'naoReenvia' from jsonb_array_elements(pg_temp.d() -> 'mensagens') m where m ->> 'modelo' = 'pagamento_confirmado'),
  null, 'a que não falhou não traz o motivo de não reenviar');

-- ── Pagamento ──
select is((pg_temp.d() -> 'pagamentos' -> 0 ->> 'idProvedor', pg_temp.d() -> 'pagamentos' -> 0 ->> 'provedor')::text,
  '(123456789,mercadopago)', 'o número da operação no Mercado Pago');

-- ── Cliente ──
select is(pg_temp.d() -> 'cliente' ->> 'chat', '557791110001', 'a conversa da cliente, mesmo sem o nono dígito');
select is((pg_temp.d() -> 'cliente' ->> 'compras', pg_temp.d() -> 'cliente' ->> 'comprasCentavos')::text, '(2,7999)', 'quanto ela já comprou');
select is((select jsonb_agg(o ->> 'id') from jsonb_array_elements(pg_temp.d() -> 'cliente' -> 'outras') o),
  '["00000000-0000-4000-8000-0000000000f1"]'::jsonb, 'as outras reservas, sem esta');
select is((pg_temp.d() -> 'cliente' -> 'chamados' -> 0 ->> 'motivo'), 'DUVIDA', 'o chamado aberto depois da reserva');
select is(jsonb_array_length(admin_reservation_detail('00000000-0000-4000-8000-0000000000f1') -> 'cliente' -> 'chamados'), 1,
  'na reserva antiga também (aberto depois dela)');
select is(wa_phone_chats('+5577991110001'), array['5577991110001', '557791110001'], 'as duas formas do número no WhatsApp');

select set_app_clock(interval '0');
select * from finish();
rollback;
