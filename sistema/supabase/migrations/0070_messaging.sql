-- 0070 · Mensagens do WhatsApp (seções 07 e 10, G4, G5)
-- Entrada: cada mensagem recebida é registrada uma vez (wa_message_id) e com limite por
-- remetente. Saída: a outbox é gravada na mesma transação da mudança de estado e sai por
-- prioridade, com validade por mensagem e ritmo humano (modo lançamento no painel, D14).
-- O código de verificação não passa pela fila: é resposta imediata no webhook.

create table whatsapp_inbound (
  id            bigserial primary key,
  wa_message_id text not null unique check (length(wa_message_id) between 1 and 200),
  from_wa_id    text check (length(from_wa_id) <= 60),
  text          text check (length(text) <= 4096),
  received_at   timestamptz not null default app_now(),
  handled_as    text check (handled_as ~ '^[A-Z_]{2,40}$')
);

create index whatsapp_inbound_received_idx on whatsapp_inbound (received_at);

create table outbox_messages (
  id                  uuid primary key default gen_random_uuid(),
  dedupe_key          text not null unique check (length(dedupe_key) between 3 and 200),
  phone_e164          text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  template            text not null check (template ~ '^[a-z][a-z0-9_]{2,40}$'),
  -- Só o primeiro nome, nunca endereço nem telefone completo. O link da reserva (com a
  -- chave) sai daqui assim que a mensagem é enviada ou descartada.
  params              jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  priority            smallint not null default 2 check (priority in (1, 2)),
  valid_until         timestamptz,
  reservation_id      uuid references reservations (id),
  -- Descartada se a reserva já não estiver neste estado (ex.: lembrete depois do pagamento).
  requires_status     reservation_status,
  status              outbox_status not null default 'PENDENTE',
  attempts            integer not null default 0 check (attempts >= 0),
  next_attempt_at     timestamptz not null default app_now(),
  claimed_at          timestamptz,
  provider_message_id text check (length(provider_message_id) <= 200),
  last_error          text check (length(last_error) <= 500),
  created_at          timestamptz not null default app_now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  check (requires_status is null or reservation_id is not null)
);

create index outbox_fila_idx on outbox_messages (priority, next_attempt_at) where status = 'PENDENTE';
create index outbox_enviadas_idx on outbox_messages (sent_at) where sent_at is not null;
create index outbox_provider_idx on outbox_messages (provider_message_id) where provider_message_id is not null;

insert into app_settings (key, value, description) values
  ('fila_max_tentativas', '5', 'Tentativas de envio de cada mensagem da fila');

-- Enfileira. Mensagem opcional com as opcionais desligadas no painel não entra.
create function enqueue_message(
  p_dedupe_key      text,
  p_phone           text,
  p_template        text,
  p_params          jsonb,
  p_priority        smallint default 2,
  p_valid_until     timestamptz default null,
  p_reservation_id  uuid default null,
  p_requires_status reservation_status default null,
  p_optional        boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_optional and setting('notificacoes_opcionais') = 'false'::jsonb then
    return null;
  end if;
  insert into outbox_messages (dedupe_key, phone_e164, template, params, priority, valid_until, reservation_id, requires_status)
  values (p_dedupe_key, p_phone, p_template, coalesce(p_params, '{}'), p_priority, p_valid_until, p_reservation_id, p_requires_status)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Próxima mensagem a enviar, ou null se a fila está vazia ou o ritmo pede espera. Um
-- worker por vez (trava consultiva); o intervalo mínimo e o teto por hora seguem o modo.
create function outbox_claim() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lancamento boolean := setting('modo_lancamento') = 'true'::jsonb;
  v_teto integer := setting_int(case when v_lancamento then 'lancamento_teto_hora' else 'fila_teto_hora' end);
  v_intervalo integer := setting_int(case when v_lancamento then 'lancamento_intervalo_min_s' else 'fila_intervalo_min_s' end);
  v outbox_messages;
begin
  if not pg_try_advisory_xact_lock(hashtext('outbox_claim')) then
    return null;
  end if;

  -- Envio que travou no meio (worker caiu) volta para a fila.
  update outbox_messages set status = 'PENDENTE', claimed_at = null
   where status = 'ENVIANDO' and claimed_at < app_now() - interval '2 minutes';

  -- Validade vencida ou reserva que já mudou de estado: descarta, com registro.
  update outbox_messages o set status = 'DESCARTADA', params = o.params - 'link',
         last_error = case when o.valid_until < app_now() then 'validade vencida' else 'reserva mudou de estado' end
   where o.status = 'PENDENTE'
     and (o.valid_until < app_now()
          or (o.requires_status is not null
              and o.requires_status is distinct from (select r.status from reservations r where r.id = o.reservation_id)));

  if (select count(*) from outbox_messages where sent_at > app_now() - interval '1 hour') >= v_teto then
    return null;
  end if;
  if exists (select 1 from outbox_messages where sent_at > app_now() - make_interval(secs => v_intervalo)) then
    return null;
  end if;

  select * into v from outbox_messages
   where status = 'PENDENTE' and next_attempt_at <= app_now()
   order by priority, next_attempt_at, created_at
   limit 1
   for update skip locked;
  if not found then
    return null;
  end if;
  update outbox_messages set status = 'ENVIANDO', claimed_at = app_now(), attempts = attempts + 1 where id = v.id;
  return jsonb_build_object('id', v.id, 'telefone', v.phone_e164, 'template', v.template, 'params', v.params,
                            'intervalo', jsonb_build_object(
                              'minS', v_intervalo,
                              'maxS', setting_int(case when v_lancamento then 'lancamento_intervalo_max_s' else 'fila_intervalo_max_s' end)));
end $$;

-- Resultado do envio: enviada, nova tentativa (1, 5, 15 min…) ou falha definitiva.
create function outbox_result(p_id uuid, p_ok boolean, p_provider_message_id text default null, p_error text default null) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v outbox_messages;
begin
  select * into v from outbox_messages where id = p_id and status = 'ENVIANDO' for update;
  if not found then
    return;
  end if;
  if p_ok then
    update outbox_messages
       set status = 'ENVIADA', sent_at = app_now(), provider_message_id = p_provider_message_id, params = params - 'link', claimed_at = null
     where id = p_id;
  elsif v.attempts >= setting_int('fila_max_tentativas') then
    update outbox_messages set status = 'FALHOU', last_error = left(p_error, 500), params = params - 'link', claimed_at = null where id = p_id;
  else
    update outbox_messages
       set status = 'PENDENTE', last_error = left(p_error, 500), claimed_at = null,
           next_attempt_at = app_now() + (array[interval '1 minute', interval '5 minutes', interval '15 minutes'])[least(v.attempts, 3)]
     where id = p_id;
  end if;
end $$;

-- Status vindo do webhook (entregue, lida).
create function outbox_delivery(p_provider_message_id text, p_status outbox_status) returns void
language sql
security definer
set search_path = public
as $$
  update outbox_messages
     set status = p_status, delivered_at = coalesce(delivered_at, app_now())
   where provider_message_id = p_provider_message_id
     and p_status in ('ENTREGUE', 'LIDA')
     and status in ('ENVIADA', 'ENTREGUE')
$$;

-- Registra a mensagem recebida uma vez só e aplica o limite por remetente (20 em 10 min).
create function inbound_register(p_wa_message_id text, p_from text, p_text text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  insert into whatsapp_inbound (wa_message_id, from_wa_id, text)
  values (p_wa_message_id, left(p_from, 60), left(p_text, 4096))
  on conflict (wa_message_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('novo', false, 'dentroDoLimite', true);
  end if;
  return jsonb_build_object('novo', true,
                            -- o contador guarda só o hash do remetente, não o número
                            'dentroDoLimite', hit_rate_limit('wa_remetente:' || encode(extensions.digest(coalesce(p_from, 'sem-numero'), 'sha256'), 'hex'),
                                                             interval '10 minutes', 20));
end $$;

create function inbound_mark(p_wa_message_id text, p_handled_as text) returns void
language sql
security definer
set search_path = public
as $$ update whatsapp_inbound set handled_as = p_handled_as where wa_message_id = p_wa_message_id $$;

alter table whatsapp_inbound enable row level security;
alter table outbox_messages enable row level security;
