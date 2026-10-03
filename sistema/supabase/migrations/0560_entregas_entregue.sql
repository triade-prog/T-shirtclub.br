-- 0560 · Coluna Entregue no Kanban de Entregas e frete (03/10, pedido da loja): sem a coluna, o
-- pedido sumia do quadro ao marcar como entregue. A lista sem filtro passa a trazer também os
-- pedidos entregues nos últimos 7 dias (com a data da entrega); com filtro por etapa, só os em
-- aberto, como antes. O mais antigo fica na reserva.

create or replace function admin_list_fulfillments(p_substatus fulfillment_substatus default null) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(fulfillment_json(f, true) || jsonb_build_object(
    'reserva', jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'nome', r.customer_name, 'telefone', r.phone_e164,
                                  'totalCentavos', r.total_cents, 'pagaEm', r.payment_confirmed_at, 'entregueEm', r.delivered_at),
    'disputaAberta', has_open_dispute(r.id))
    order by r.payment_confirmed_at), '[]')
  from fulfillments f join reservations r on r.id = f.reservation_id
  where (r.status = 'PAGAMENTO_CONFIRMADO' and (p_substatus is null or f.substatus = p_substatus))
     or (p_substatus is null and r.status = 'ENTREGUE' and r.delivered_at >= app_now() - interval '7 days')
$$;
