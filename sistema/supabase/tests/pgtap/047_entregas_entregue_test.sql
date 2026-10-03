begin;
select plan(5);

-- Coluna Entregue (0560): a lista do Kanban traz os pedidos entregues nos últimos 7 dias, com a
-- data da entrega; com filtro por etapa, só os em aberto.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into customers (id, phone_e164) values
  ('00000000-0000-4000-8000-0000000000e1', '+5577991110001'),
  ('00000000-0000-4000-8000-0000000000e2', '+5577991110002');
\set admin '''00000000-0000-4000-8000-0000000000d1'''

-- Venda do painel com retirada, paga (fica em preparação, 0530)
create function pg_temp.paga(p_id uuid, p_cliente uuid, p_tel text, p_hash text) returns void language plpgsql as $$
declare r reservations;
begin
  perform set_transition_context('T1', 'ADMIN');
  insert into reservations (id, access_key_hash, customer_id, phone_e164, customer_name, status, delivery_intent, subtotal_cents, total_cents, expires_at, channel, created_by)
  values (p_id, p_hash, p_cliente, p_tel, 'Ana Paula', 'RESERVADO', 'RETIRADA', 4999, 4999, app_now() + interval '1 hour', 'PAINEL',
          '00000000-0000-4000-8000-0000000000d1');
  perform set_transition_context('T2', 'PROVEDOR');
  update reservations set status = 'PAGAMENTO_CONFIRMADO', payment_confirmed_at = app_now() where id = p_id returning * into r;
  perform ensure_fulfillment(r);
end $$;
create function pg_temp.lista(p_substatus fulfillment_substatus default null) returns text language sql as $$
  select string_agg((i -> 'reserva' ->> 'id') || ':' || (i -> 'reserva' ->> 'status') || ':' || (i -> 'reserva' ->> 'entregueEm' is not null),
                    ',' order by i -> 'reserva' ->> 'id')
  from jsonb_array_elements(admin_list_fulfillments(p_substatus)) i
$$;

select pg_temp.paga('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', '+5577991110001', repeat('a', 64));
select pg_temp.paga('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', '+5577991110002', repeat('b', 64));
select admin_set_substatus('00000000-0000-4000-8000-0000000000f1', :admin, 'PRONTO_PARA_RETIRADA');
select deliver_reservation('00000000-0000-4000-8000-0000000000f1', :admin);

select is(pg_temp.lista(),
  '00000000-0000-4000-8000-0000000000f1:ENTREGUE:true,00000000-0000-4000-8000-0000000000f2:PAGAMENTO_CONFIRMADO:false',
  'a lista traz o pedido entregue, com a data, e o em aberto');
select is((select i ->> 'codigoRetirada' is not null from jsonb_array_elements(admin_list_fulfillments()) i
            where i -> 'reserva' ->> 'id' = '00000000-0000-4000-8000-0000000000f1'), true, 'o entregue mantém os dados da entrega');
select is(pg_temp.lista('PRONTO_PARA_RETIRADA'), null, 'com filtro por etapa, o entregue não entra');
select is(pg_temp.lista('EM_PREPARACAO'), '00000000-0000-4000-8000-0000000000f2:PAGAMENTO_CONFIRMADO:false', 'e o em aberto segue no filtro');

select set_app_clock(interval '8 days');
select is(pg_temp.lista('EM_PREPARACAO'), pg_temp.lista(), 'depois de 7 dias, o entregue sai do quadro');

select set_app_clock(interval '0');
select * from finish();
rollback;
