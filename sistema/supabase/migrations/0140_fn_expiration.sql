-- 0140 · Expiração, lembrete de 5 min e rede de segurança (seção 06, T3, R4, G5)
-- O relógio é o do banco (app_now). A reserva nunca é renovada: passou do prazo efetivo
-- sem pagamento em andamento, expira e o estoque volta na hora.
-- Ordem de locks (seção 05): customers → reservations → products → promotions/coupons.
-- A expiração não trava a cliente: o bloqueio por abuso (0160) usa o índice único do
-- bloqueio ativo, sem precisar da trava. Pagamento em andamento: has_pending_payment (0130).

-- Prazo efetivo, o mesmo para todos (seção 06).
create function effective_deadline(r reservations) returns timestamptz
language sql immutable
as $$ select coalesce(r.grace_until, r.expires_at) $$;

-- A reserva ainda segura as peças? (RESERVADO dentro do prazo, ou com pagamento em andamento)
create function reservation_is_live(r reservations) returns boolean
language sql stable
set search_path = public
as $$
  select r.status = 'RESERVADO' and (app_now() < effective_deadline(r) or has_pending_payment(r.id))
$$;

-- T3 (PRAZO_ESGOTADO) e T4 (CANCELAMENTO_APROVADO, F7). Devolve o estoque, o uso do cupom e
-- o orçamento; o pedido de cancelamento pendente fica PREJUDICADO (R4). Só o prazo esgotado
-- conta para o bloqueio (0160) e manda a mensagem "reserva expirada".
create function expire_reservation(
  p_id         uuid,
  p_reason     closure_reason,
  p_actor_type actor_type default 'SISTEMA',
  p_actor_id   uuid default null,
  p_note       text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
  v_item record;
  v_desconto record;
begin
  select * into r from reservations where id = p_id for update;
  if not found or r.status <> 'RESERVADO' then
    return false; -- já foi paga, expirada ou não existe: nada a fazer
  end if;

  perform set_transition_context(case when p_reason = 'PRAZO_ESGOTADO' then 'T3' else 'T4' end, p_actor_type, p_actor_id, p_note);
  update reservations set status = 'EXPIRADO', closure_reason = p_reason, expired_at = app_now() where id = r.id;

  -- Estoque: produtos em ordem de id, como em toda função
  for v_item in
    select i.product_id, i.qty from reservation_items i where i.reservation_id = r.id order by i.product_id
  loop
    update products set qty_reserved = qty_reserved - v_item.qty where id = v_item.product_id;
    insert into stock_movements (product_id, kind, qty, reservation_id, actor_type, actor_id)
    values (v_item.product_id, 'LIBERACAO', v_item.qty, r.id, p_actor_type, p_actor_id);
  end loop;

  -- Cupom e orçamento voltam (regra 28)
  for v_desconto in
    select d.promotion_id, d.amount_cents, p.type, p.budget_cents
      from reservation_discounts d join promotions p on p.id = d.promotion_id
     where d.reservation_id = r.id order by d.promotion_id
  loop
    perform 1 from promotions where id = v_desconto.promotion_id for update;
    if v_desconto.budget_cents is not null then
      update promotions set budget_used_cents = greatest(budget_used_cents - v_desconto.amount_cents, 0) where id = v_desconto.promotion_id;
    end if;
    if v_desconto.type = 'CUPOM' then
      update coupons set used_quantity = greatest(used_quantity - 1, 0) where promotion_id = v_desconto.promotion_id;
      update coupon_uses set status = 'DEVOLVIDO' where reservation_id = r.id and status = 'PRESO';
    end if;
  end loop;

  if p_reason = 'PRAZO_ESGOTADO' then
    update cancellation_requests set status = 'PREJUDICADA', decided_at = app_now()
     where reservation_id = r.id and status = 'PENDENTE';
    perform enqueue_message('reserva_expirada:' || r.id, r.phone_e164, 'reserva_expirada',
                            jsonb_build_object('numero', r.number, 'expiradaEm', effective_deadline(r)),
                            1::smallint, app_now() + interval '1 hour', r.id, 'EXPIRADO');
  end if;

  perform log_audit(p_actor_type, p_actor_id, 'reserva.expirada', 'reservation', r.id::text, r.id,
                    jsonb_build_object('motivo', p_reason, 'numero', r.number));

  if p_reason = 'PRAZO_ESGOTADO' then
    perform check_phone_block(r.customer_id, r.id);
  end if;
  return true;
end $$;

-- Expira se já venceu (e não há pagamento em andamento). Usada antes de conferir estoque e
-- a reserva ativa, para nada ficar preso esperando a próxima varredura (seção 05).
create function expire_if_overdue(p_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare r reservations;
begin
  select * into r from reservations where id = p_id;
  if not found or r.status <> 'RESERVADO' or reservation_is_live(r) then
    return false;
  end if;
  return expire_reservation(p_id, 'PRAZO_ESGOTADO');
end $$;

-- Reservas vencidas que ainda seguram algum destes produtos.
create function expire_overdue_holding(p_product_ids uuid[]) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  n integer := 0;
begin
  for v_id in
    select distinct r.id from reservations r join reservation_items i on i.reservation_id = r.id
     where i.product_id = any(p_product_ids) and r.status = 'RESERVADO' and app_now() >= effective_deadline(r)
     order by r.id
  loop
    if expire_if_overdue(v_id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Varredura (pg_cron a cada 10 s, 0300), em lotes de 100 e sem esperar travas:
--  1. lembrete de 5 min, só se ainda falta mais de 1 min (G5)
--  2. tolerância: prazo vencido com pagamento em andamento ganha +5 min (D5)
--  3. expira o que venceu sem pagamento em andamento
--  4. rede de segurança: tolerância vencida há 2 min expira mesmo com pagamento pendente
--     (o worker cancela a cobrança; o pagamento que chegar depois vai para análise)
create function sweep_reservations() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
  v_lembretes integer := 0;
  v_tolerancias integer := 0;
  v_expiradas integer := 0;
  v_minutos integer := setting_int('lembrete_minutos');
begin
  for r in
    select * from reservations
     where status = 'RESERVADO' and reminder_enqueued_at is null
       and app_now() >= expires_at - make_interval(mins => v_minutos)
       and app_now() < expires_at - interval '1 minute'
     order by expires_at limit 100
     for update skip locked
  loop
    perform enqueue_message('lembrete:' || r.id, r.phone_e164, 'reserva_lembrete_5min',
                            jsonb_build_object('numero', r.number, 'expiraEm', r.expires_at),
                            1::smallint, r.expires_at - interval '1 minute', r.id, 'RESERVADO');
    update reservations set reminder_enqueued_at = app_now() where id = r.id;
    v_lembretes := v_lembretes + 1;
  end loop;

  for r in
    select * from reservations
     where status = 'RESERVADO' and grace_until is null and app_now() >= expires_at
     order by expires_at limit 100
     for update skip locked
  loop
    if has_pending_payment(r.id) then
      update reservations set grace_until = expires_at + make_interval(mins => setting_int('tolerancia_minutos')) where id = r.id;
      perform log_audit('SISTEMA', null, 'tolerancia.iniciada', 'reservation', r.id::text, r.id);
      v_tolerancias := v_tolerancias + 1;
    end if;
  end loop;

  for r in
    select * from reservations
     where status = 'RESERVADO' and app_now() >= coalesce(grace_until, expires_at)
     order by expires_at limit 100
     for update skip locked
  loop
    if not has_pending_payment(r.id) or app_now() >= r.grace_until + interval '2 minutes' then
      if expire_reservation(r.id, 'PRAZO_ESGOTADO') then
        v_expiradas := v_expiradas + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('lembretes', v_lembretes, 'tolerancias', v_tolerancias, 'expiradas', v_expiradas,
                            'filaPendente', exists (select 1 from outbox_messages where status = 'PENDENTE' and next_attempt_at <= app_now()));
end $$;
