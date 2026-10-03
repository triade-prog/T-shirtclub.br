begin;
select plan(6);

-- Venda do painel com retirada (0530): paga pelo link, a retirada fica confirmada e a mensagem de
-- pagamento diz que a cliente retira na loja. A reserva do site e a do painel com motoboy seguem
-- esperando a escolha da cliente.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into customers (id, phone_e164) values
  ('00000000-0000-4000-8000-0000000000e1', '+5577991110001'),
  ('00000000-0000-4000-8000-0000000000e2', '+5577991110002'),
  ('00000000-0000-4000-8000-0000000000e3', '+5577991110003');

-- Reserva aberta e depois paga (T1 e T2), com a entrega aberta e a mensagem de pagamento, como o
-- pagamento aprovado faz (apply_payment_result)
create function pg_temp.paga(p_id uuid, p_cliente uuid, p_tel text, p_canal text, p_entrega delivery_mode, p_hash text) returns void language plpgsql as $$
declare r reservations;
begin
  perform set_transition_context('T1', case p_canal when 'PAINEL' then 'ADMIN' else 'CLIENTE' end::actor_type);
  insert into reservations (id, access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent, subtotal_cents, total_cents, expires_at, channel, created_by)
  values (p_id, p_hash, p_cliente, p_tel, 'Ana Paula', 'RESERVADO', p_entrega, 4999, 4999, app_now() + interval '1 hour', p_canal,
          case when p_canal = 'PAINEL' then '00000000-0000-4000-8000-0000000000d1'::uuid end);
  perform set_transition_context('T2', 'PROVEDOR');
  update reservations set status = 'PAGAMENTO_CONFIRMADO', payment_confirmed_at = app_now() where id = p_id returning * into r;
  perform ensure_fulfillment(r);
  perform enqueue_message('pagamento_confirmado:' || r.id, r.phone_e164, 'pagamento_confirmado',
                          jsonb_build_object('nome', 'Ana', 'numero', r.number, 'totalCentavos', r.total_cents, 'forma', 'PIX'), 1::smallint, app_now() + interval '1 day', r.id);
end $$;

select pg_temp.paga('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', '+5577991110001', 'PAINEL', 'RETIRADA', repeat('a', 64));
select pg_temp.paga('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', '+5577991110002', 'SITE', 'RETIRADA', repeat('b', 64));
select pg_temp.paga('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e3', '+5577991110003', 'PAINEL', 'MOTOBOY', repeat('c', 64));

select is((select (substatus, confirmed_at is not null)::text from fulfillments where reservation_id = '00000000-0000-4000-8000-0000000000f1'),
  '(EM_PREPARACAO,t)', 'painel com retirada: confirmada no pagamento, já em preparação');
select is((select params -> 'retirada' from outbox_messages where reservation_id = '00000000-0000-4000-8000-0000000000f1' and template = 'pagamento_confirmado'),
  'true'::jsonb, 'painel com retirada: a mensagem diz que ela retira na loja');
select is((select substatus::text from fulfillments where reservation_id = '00000000-0000-4000-8000-0000000000f2'),
  'AGUARDANDO_MODALIDADE', 'site com retirada pretendida: a cliente confirma depois de pagar');
select ok((select not params ? 'retirada' from outbox_messages where reservation_id = '00000000-0000-4000-8000-0000000000f2' and template = 'pagamento_confirmado'),
  'site: a mensagem pede a escolha da entrega');
select is((select substatus::text from fulfillments where reservation_id = '00000000-0000-4000-8000-0000000000f3'),
  'AGUARDANDO_MODALIDADE', 'painel com motoboy: espera o endereço da cliente');
select is((select count(*) from outbox_messages where template = 'pagamento_confirmado' and params ? 'retirada'), 1::bigint,
  'só a venda do painel com retirada muda a mensagem');

select * from finish();
rollback;
