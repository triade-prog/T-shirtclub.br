-- 0080 · Auditoria somente de inserção
-- Nenhum UPDATE, DELETE ou TRUNCATE passa. A cliente aparece só pelo customer_id: nome,
-- telefone e endereço não entram em data (G9).

create table audit_log (
  id             bigserial primary key,
  occurred_at    timestamptz not null default now(),
  actor_type     actor_type not null,
  actor_id       uuid,
  action         text not null check (action ~ '^[a-z][a-z0-9_.]*$' and length(action) <= 80),
  entity_type    text not null check (entity_type ~ '^[a-z][a-z0-9_]*$' and length(entity_type) <= 40),
  entity_id      text,
  reservation_id uuid,
  data           jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  ip_hash        text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
);

create index audit_log_reservation_idx on audit_log (reservation_id, occurred_at) where reservation_id is not null;
create index audit_log_entity_idx on audit_log (entity_type, entity_id, occurred_at);
create index audit_log_occurred_idx on audit_log (occurred_at);

-- A única mudança aceita é a da rotina de prazos de guarda (F11, G9): apagar o IP em hash
-- depois de 30 dias, sem tocar em mais nada da linha.
create function audit_log_somente_insercao() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.purga_ip', true) = 'on' and new.ip_hash is null
     and (new.id, new.occurred_at, new.actor_type, new.actor_id, new.action, new.entity_type, new.entity_id, new.reservation_id, new.data)
         is not distinct from (old.id, old.occurred_at, old.actor_type, old.actor_id, old.action, old.entity_type, old.entity_id, old.reservation_id, old.data) then
    return new;
  end if;
  raise exception 'audit_log é somente de inserção (% bloqueado)', tg_op using errcode = 'TS010';
end $$;

create trigger audit_log_sem_update before update or delete on audit_log
  for each row execute function audit_log_somente_insercao();
create trigger audit_log_sem_truncate before truncate on audit_log
  for each statement execute function audit_log_somente_insercao();

-- Chaves que indicam dado pessoal; o registro é recusado se data tiver alguma delas,
-- em qualquer nível.
create function audit_tem_dado_pessoal(p_data jsonb) returns boolean
language sql immutable
as $$
  with recursive nos(valor) as (
    select p_data
    union all
    select filho.value
    from nos
    cross join lateral (
      select e.value from jsonb_each(case when jsonb_typeof(nos.valor) = 'object' then nos.valor else '{}'::jsonb end) e
      union all
      select a.value from jsonb_array_elements(case when jsonb_typeof(nos.valor) = 'array' then nos.valor else '[]'::jsonb end) a
    ) filho
  )
  select exists (
    select 1 from nos, jsonb_object_keys(case when jsonb_typeof(nos.valor) = 'object' then nos.valor else '{}'::jsonb end) k
    where lower(k) in ('phone', 'phone_e164', 'telefone', 'name', 'nome', 'customer_name', 'address', 'endereco', 'email', 'ip', 'cpf')
  )
$$;

create function log_audit(
  p_actor_type     actor_type,
  p_actor_id       uuid,
  p_action         text,
  p_entity_type    text,
  p_entity_id      text,
  p_reservation_id uuid default null,
  p_data           jsonb default '{}'::jsonb,
  p_ip_hash        text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if audit_tem_dado_pessoal(coalesce(p_data, '{}'::jsonb)) then
    raise exception 'Auditoria não guarda dado pessoal (use customer_id)' using errcode = 'TS011';
  end if;
  insert into audit_log (occurred_at, actor_type, actor_id, action, entity_type, entity_id, reservation_id, data, ip_hash)
  values (app_now(), p_actor_type, p_actor_id, p_action, p_entity_type, p_entity_id, p_reservation_id, coalesce(p_data, '{}'::jsonb), p_ip_hash)
  returning id into v_id;
  return v_id;
end $$;
