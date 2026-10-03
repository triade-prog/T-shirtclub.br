-- 0510 · Avisos da loja no WhatsApp da equipe (02/10): nova reserva do site, pagamento aprovado,
-- inscrição na lista VIP, frete para calcular, pedido de cancelamento, pagamento em análise,
-- contestação, cliente falando em troca e alerta do sistema. O número (pessoal, diferente do
-- WhatsApp da loja) e os avisos desligados ficam nas configurações do painel. Cada aviso entra
-- na fila como as mensagens das clientes (modelo aviso_loja), com prioridade 2: as das clientes
-- saem antes. Os gatilhos nunca derrubam a operação que os disparou: erro no aviso é engolido.

insert into app_settings (key, value, description) values
  ('avisos_loja_telefone', 'null', 'WhatsApp da equipe que recebe os avisos da loja (E.164); null desliga todos'),
  ('avisos_loja_desligados', '[]', 'Avisos da loja que a equipe desligou no painel');

-- Os tipos que o painel conhece; o texto de cada um fica no domínio (aviso_loja).
create function store_alert_types() returns text[]
language sql immutable
as $$
  select array['nova_reserva', 'pagamento_aprovado', 'lista_vip', 'frete_calcular', 'cancelamento',
               'pagamento_analise', 'contestacao', 'troca', 'sistema']
$$;

create function store_alert(p_tipo text, p_chave text, p_params jsonb default '{}') returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_tel text := setting('avisos_loja_telefone') #>> '{}';
begin
  if v_tel is null or setting('avisos_loja_desligados') ? p_tipo then
    return null;
  end if;
  -- Um aviso de 12 horas atrás já não ajuda: o painel mostra tudo
  return enqueue_message('aviso:' || p_tipo || ':' || p_chave, v_tel, 'aviso_loja',
                         coalesce(p_params, '{}') || jsonb_build_object('tipo', p_tipo), 2::smallint, app_now() + interval '12 hours');
exception when others then
  -- O aviso é um extra: a reserva, o pagamento ou a inscrição seguem mesmo se ele falhar
  return null;
end $$;

-- ─── Gatilhos ─────────────────────────────────────────────────────────────────────────

-- Nova reserva do site (a do painel a equipe mesma criou). No fim da transação, para as peças
-- já estarem gravadas.
create function trg_alert_reservation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.channel = 'SITE' then
    perform store_alert('nova_reserva', new.id::text, jsonb_build_object(
      'numero', new.number, 'nome', split_part(btrim(new.customer_name), ' ', 1), 'totalCentavos', new.total_cents,
      'pecas', (select coalesce(sum(qty), 0) from reservation_items where reservation_id = new.id),
      'retirada', new.delivery_intent = 'RETIRADA', 'expiraEm', new.expires_at));
  end if;
  return null;
end $$;

create constraint trigger aviso_nova_reserva after insert on reservations
  deferrable initially deferred for each row execute function trg_alert_reservation();

create function trg_alert_payment() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r reservations;
begin
  if new.status = 'APROVADO' and old.status is distinct from 'APROVADO' then
    select * into r from reservations where id = new.reservation_id;
    perform store_alert('pagamento_aprovado', new.id::text, jsonb_build_object(
      'numero', r.number, 'nome', split_part(btrim(r.customer_name), ' ', 1), 'valorCentavos', new.amount_cents,
      'forma', new.method, 'frete', new.purpose = 'FRETE'));
  end if;
  return null;
end $$;

create trigger aviso_pagamento_aprovado after update of status on payments
  for each row execute function trg_alert_payment();

create function trg_alert_vip() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform store_alert('lista_vip', new.id::text, jsonb_build_object(
    'nome', nullif(split_part(btrim(coalesce(new.name, '')), ' ', 1), ''), 'origem', new.source,
    'total', (select count(*) from vip_signups)));
  return null;
end $$;

create trigger aviso_lista_vip after insert on vip_signups
  for each row execute function trg_alert_vip();

create function trg_alert_fulfillment() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.substatus = 'AGUARDANDO_CALCULO_FRETE' and (tg_op = 'INSERT' or old.substatus is distinct from new.substatus) then
    perform store_alert('frete_calcular', new.reservation_id::text || ':' || extract(epoch from app_now())::bigint, jsonb_build_object(
      'numero', (select number from reservations where id = new.reservation_id), 'modalidade', new.mode));
  end if;
  return null;
end $$;

create trigger aviso_frete_calcular after insert or update of substatus on fulfillments
  for each row execute function trg_alert_fulfillment();

create function trg_alert_cancellation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform store_alert('cancelamento', new.id::text, jsonb_build_object(
    'numero', (select number from reservations where id = new.reservation_id)));
  return null;
end $$;

create trigger aviso_cancelamento after insert on cancellation_requests
  for each row execute function trg_alert_cancellation();

create function trg_alert_review() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform store_alert('pagamento_analise', new.id::text, jsonb_build_object(
    'numero', (select number from reservations where id = new.reservation_id), 'motivo', new.reason));
  return null;
end $$;

create trigger aviso_pagamento_analise after insert on payment_reviews
  for each row execute function trg_alert_review();

create function trg_alert_dispute() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform store_alert('contestacao', new.id::text, jsonb_build_object(
    'numero', (select number from reservations where id = new.reservation_id), 'motivo', new.kind));
  return null;
end $$;

create trigger aviso_contestacao after insert on payment_disputes
  for each row execute function trg_alert_dispute();

-- Cliente falou em troca ou devolução no WhatsApp da loja (0460): a equipe responde por lá.
create function trg_alert_exchange() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.handled_as = 'TROCAS' and old.handled_as is distinct from 'TROCAS' then
    perform store_alert('troca', new.id::text);
  end if;
  return null;
end $$;

create trigger aviso_troca after update of handled_as on whatsapp_inbound
  for each row execute function trg_alert_exchange();

-- Alerta novo do sistema (cron falhou, pagamentos parados, estoque divergente...). A mensagem
-- do alerta não tem dado pessoal (0085).
create function trg_alert_system() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform store_alert('sistema', new.id::text, jsonb_build_object('mensagem', new.message));
  return null;
end $$;

create trigger aviso_sistema after insert on system_alerts
  for each row execute function trg_alert_system();

-- ─── Painel ───────────────────────────────────────────────────────────────────────────

create function admin_store_alerts() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object('telefone', setting('avisos_loja_telefone'), 'desligados', setting('avisos_loja_desligados'))
$$;

-- p: {telefone?: "+55…" | null, desligados?: [tipos]}. Cada mudança vai para a auditoria (sem o
-- número: ele é dado pessoal da equipe).
create function admin_update_store_alerts(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_mudou text[] := '{}';
begin
  perform admin_guard(p_admin);
  if p ? 'telefone' then
    if jsonb_typeof(p -> 'telefone') not in ('string', 'null')
       or (jsonb_typeof(p -> 'telefone') = 'string' and (p ->> 'telefone') !~ '^\+[1-9][0-9]{7,14}$') then
      raise exception 'Número dos avisos inválido' using errcode = 'TS185';
    end if;
    if set_setting('avisos_loja_telefone', p -> 'telefone', p_admin) then
      v_mudou := v_mudou || 'telefone'::text;
    end if;
  end if;
  if p ? 'desligados' then
    if jsonb_typeof(p -> 'desligados') <> 'array'
       or exists (select 1 from jsonb_array_elements(p -> 'desligados') x
                   where jsonb_typeof(x) <> 'string' or not (x #>> '{}') = any (store_alert_types())) then
      raise exception 'Lista de avisos inválida' using errcode = 'TS185';
    end if;
    if set_setting('avisos_loja_desligados',
                   (select coalesce(jsonb_agg(distinct x order by x), '[]') from jsonb_array_elements(p -> 'desligados') x), p_admin) then
      v_mudou := v_mudou || 'desligados'::text;
    end if;
  end if;
  if cardinality(v_mudou) > 0 then
    perform log_audit('ADMIN', p_admin, 'avisos_loja.configuracao', 'app_settings', 'avisos_loja', null,
                      jsonb_build_object('mudou', to_jsonb(v_mudou), 'ligado', setting('avisos_loja_telefone') <> 'null'::jsonb,
                                         'desligados', setting('avisos_loja_desligados')));
  end if;
  return admin_store_alerts();
end $$;

-- Aviso de teste para o número gravado: entra na fila como os outros.
create function admin_store_alert_test(p_admin uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_tel text := setting('avisos_loja_telefone') #>> '{}';
begin
  perform admin_guard(p_admin);
  if v_tel is null then
    raise exception 'Grave o número dos avisos antes do teste' using errcode = 'TS186';
  end if;
  perform log_audit('ADMIN', p_admin, 'avisos_loja.teste', 'app_settings', 'avisos_loja');
  return enqueue_message('aviso:teste:' || gen_random_uuid(), v_tel, 'aviso_loja', jsonb_build_object('tipo', 'teste'),
                         1::smallint, app_now() + interval '1 hour');
end $$;

call lock_down_public();
