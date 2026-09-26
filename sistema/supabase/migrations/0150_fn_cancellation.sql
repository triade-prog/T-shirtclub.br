-- 0150 · Cancelamento pedido pela cliente (regra 12, R1, R4, D7)
-- A cliente pede enquanto a reserva está RESERVADO; o painel aprova ou recusa, sempre com
-- motivo. O pedido não pausa o relógio. Aprovado: T4, RESERVADO → EXPIRADO com motivo
-- CANCELAMENTO_APROVADO, estoque de volta e sem contar para o bloqueio. Recusado: a
-- reserva segue no prazo original. Se ela expira ou é paga antes da decisão, o pedido fica
-- PREJUDICADO sozinho (0140 e 0130).

create function cancellation_json(c cancellation_requests) returns jsonb
language sql stable
as $$
  select jsonb_strip_nulls(jsonb_build_object('id', c.id, 'status', c.status, 'observacao', c.customer_note, 'solicitadoEm', c.requested_at,
                                              'decididoEm', c.decided_at, 'motivoDecisao', c.decision_reason))
$$;

create function request_cancellation(p_reservation_id uuid, p_phone text, p_note text default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
  c cancellation_requests;
begin
  select * into r from reservations where id = p_reservation_id and phone_e164 = p_phone for update;
  if not found then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;
  if not reservation_is_live(r) then
    return jsonb_build_object('erro', 'RESERVATION_NOT_ACTIVE');
  end if;
  if exists (select 1 from cancellation_requests where reservation_id = r.id and status = 'PENDENTE') then
    return jsonb_build_object('erro', 'ALREADY_REQUESTED');
  end if;
  insert into cancellation_requests (reservation_id, customer_note) values (r.id, nullif(btrim(p_note), '')) returning * into c;
  perform enqueue_message('cancelamento_recebido:' || c.id, r.phone_e164, 'cancelamento_recebido',
                          jsonb_build_object('numero', r.number, 'expiraEm', r.expires_at), 2::smallint, r.expires_at, r.id, 'RESERVADO',
                          p_optional => true);
  perform log_audit('CLIENTE', null, 'cancelamento.solicitado', 'reservation', r.id::text, r.id);
  return jsonb_build_object('cancelamento', cancellation_json(c));
end $$;

-- Trava a reserva antes do pedido (ordem global) e confere que a decisão ainda cabe.
create function lock_cancellation(p_request_id uuid, p_admin uuid, p_reason text, out r reservations, out c cancellation_requests)
language plpgsql
set search_path = public
as $$
declare v_reserva uuid;
begin
  perform admin_guard(p_admin);
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A decisão precisa de um motivo' using errcode = 'TS121';
  end if;
  select reservation_id into v_reserva from cancellation_requests where id = p_request_id;
  if v_reserva is null then
    raise exception 'Pedido de cancelamento não encontrado' using errcode = 'TS130';
  end if;
  select * into r from reservations where id = v_reserva for update;
  select * into c from cancellation_requests where id = p_request_id for update;
  if c.status <> 'PENDENTE' then
    raise exception 'Este pedido já foi decidido ou ficou prejudicado (%)', c.status using errcode = 'TS161';
  end if;
end $$;

create function approve_cancellation(p_request_id uuid, p_admin uuid, p_reason text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  r reservations;
  c cancellation_requests;
begin
  select * into v from lock_cancellation(p_request_id, p_admin, p_reason);
  r := v.r;
  c := v.c;
  if r.status <> 'RESERVADO' then
    raise exception 'A reserva já não está ativa' using errcode = 'TS161';
  end if;
  -- T4: expira com motivo próprio; não conta para o bloqueio e não prejudica este pedido.
  -- Um PIX pendente é cancelado no provedor pelo worker; se aprovar depois, vai para análise.
  perform expire_reservation(r.id, 'CANCELAMENTO_APROVADO', 'ADMIN', p_admin, btrim(p_reason));
  update cancellation_requests set status = 'APROVADA', decided_at = app_now(), decided_by = p_admin, decision_reason = btrim(p_reason)
   where id = c.id returning * into c;
  perform enqueue_message('cancelamento_aprovado:' || c.id, r.phone_e164, 'cancelamento_aprovado',
                          jsonb_build_object('numero', r.number), 2::smallint, app_now() + interval '1 day', r.id, p_optional => true);
  perform log_audit('ADMIN', p_admin, 'cancelamento.aprovado', 'reservation', r.id::text, r.id, jsonb_build_object('motivo', btrim(p_reason)));
  return cancellation_json(c);
end $$;

create function reject_cancellation(p_request_id uuid, p_admin uuid, p_reason text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  r reservations;
  c cancellation_requests;
begin
  select * into v from lock_cancellation(p_request_id, p_admin, p_reason);
  r := v.r;
  c := v.c;
  update cancellation_requests set status = 'RECUSADA', decided_at = app_now(), decided_by = p_admin, decision_reason = btrim(p_reason)
   where id = c.id returning * into c;
  perform enqueue_message('cancelamento_recusado:' || c.id, r.phone_e164, 'cancelamento_recusado',
                          jsonb_build_object('numero', r.number, 'expiraEm', r.expires_at), 2::smallint, r.expires_at, r.id, 'RESERVADO',
                          p_optional => true);
  perform log_audit('ADMIN', p_admin, 'cancelamento.recusado', 'reservation', r.id::text, r.id, jsonb_build_object('motivo', btrim(p_reason)));
  return cancellation_json(c);
end $$;

create function admin_list_cancellation_requests(p_status cancel_status default 'PENDENTE') returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(cancellation_json(c) || jsonb_build_object(
    'reserva', jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'nome', r.customer_name, 'telefone', r.phone_e164,
                                  'totalCentavos', r.total_cents, 'expiraEm', r.expires_at))
    order by c.requested_at), '[]')
  from cancellation_requests c join reservations r on r.id = c.reservation_id
  where p_status is null or c.status = p_status
$$;
