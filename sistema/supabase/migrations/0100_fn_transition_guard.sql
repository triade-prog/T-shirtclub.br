-- 0100 · Gatilho guardião das transições de estado (seção 03)
-- Permitidas: T1 (criação em RESERVADO), T2 RESERVADO → PAGAMENTO_CONFIRMADO,
-- T3/T4 RESERVADO → EXPIRADO, T5 PAGAMENTO_CONFIRMADO → ENTREGUE. Qualquer outra mudança
-- de estado, e qualquer mudança do número da reserva, é recusada.
-- Quem muda o estado são as funções de domínio: elas informam o evento e o ator com
-- set_transition_context() na mesma transação; UPDATE direto sem contexto é recusado.

create function reservation_transition_allowed(p_from reservation_status, p_to reservation_status) returns boolean
language sql immutable
as $$
  select (p_from, p_to) in (
    ('RESERVADO'::reservation_status, 'PAGAMENTO_CONFIRMADO'::reservation_status),
    ('RESERVADO', 'EXPIRADO'),
    ('PAGAMENTO_CONFIRMADO', 'ENTREGUE')
  )
$$;

create function set_transition_context(p_event text, p_actor_type actor_type, p_actor_id uuid default null, p_reason text default null)
returns void
language plpgsql
as $$
begin
  if p_event is null or p_event !~ '^[A-Za-z][A-Za-z0-9_]{1,40}$' then
    raise exception 'Evento de transição inválido' using errcode = 'TS020';
  end if;
  perform set_config('app.transition_event', p_event, true);
  perform set_config('app.transition_actor_type', p_actor_type::text, true);
  perform set_config('app.transition_actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.transition_reason', coalesce(p_reason, ''), true);
end $$;

create function trg_reservation_transition_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_event text := nullif(current_setting('app.transition_event', true), '');
  v_actor text := nullif(current_setting('app.transition_actor_type', true), '');
begin
  if tg_op = 'INSERT' then
    if new.status <> 'RESERVADO' then
      raise exception 'Reserva nasce em RESERVADO, não em %', new.status using errcode = 'TS021';
    end if;
  else
    if new.number is distinct from old.number then
      raise exception 'O número da reserva não muda' using errcode = 'TS022';
    end if;
    if new.status is not distinct from old.status then
      return new;
    end if;
    if not reservation_transition_allowed(old.status, new.status) then
      raise exception 'Transição proibida: % → %', old.status, new.status using errcode = 'TS023';
    end if;
  end if;

  if v_event is null or v_actor is null then
    raise exception 'Mudança de estado só pelas funções de domínio (falta o contexto da transição)' using errcode = 'TS024';
  end if;

  insert into reservation_transitions (reservation_id, from_status, to_status, event, actor_type, actor_id, reason, created_at)
  values (
    new.id,
    case when tg_op = 'INSERT' then 'SELECIONADO'::reservation_status else old.status end,
    new.status,
    v_event,
    v_actor::actor_type,
    nullif(current_setting('app.transition_actor_id', true), '')::uuid,
    nullif(current_setting('app.transition_reason', true), ''),
    app_now()
  );
  return new;
end $$;

create trigger trg_reservation_transition_guard before insert or update on reservations
  for each row execute function trg_reservation_transition_guard();
