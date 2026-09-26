-- 0197 · Operação (F11): alertas, verificador de invariantes do estoque, prazos de guarda
-- dos dados pessoais (G9, D15) e saúde dos jobs (F11.5).

-- ─── Alertas ─────────────────────────────────────────────────────────────────────────

create function open_alert(p_kind text, p_key text, p_message text, p_data jsonb default '{}') returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid;
begin
  insert into system_alerts (kind, key, message, data) values (p_kind, p_key, p_message, coalesce(p_data, '{}'))
  on conflict (key) where resolved_at is null
  do update set last_seen_at = app_now(), occurrences = system_alerts.occurrences + 1, data = excluded.data, message = excluded.message
  returning id into v_id;
  return v_id;
end $$;

-- A causa sumiu: o alerta automático se fecha sozinho.
create function close_alert(p_key text) returns boolean
language plpgsql
set search_path = public
as $$
begin
  update system_alerts set resolved_at = app_now(), resolution_note = 'Resolvido sozinho: a causa sumiu'
   where key = p_key and resolved_at is null;
  return found;
end $$;

create function alert_json(a system_alerts) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id, 'tipo', a.kind, 'mensagem', a.message, 'dados', nullif(a.data, '{}'::jsonb), 'abertoEm', a.opened_at,
    'vistoEm', a.last_seen_at, 'ocorrencias', a.occurrences, 'resolvidoEm', a.resolved_at,
    'resolvidoPor', admin_name(a.resolved_by), 'nota', a.resolution_note))
$$;

create function admin_list_alerts(p_open boolean default true) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(alert_json(a) order by a.opened_at desc), '[]')
    from (select * from system_alerts
           where (p_open and resolved_at is null) or (not p_open and resolved_at is not null)
           order by opened_at desc limit 200) a
$$;

create function admin_resolve_alert(p_id uuid, p_admin uuid, p_note text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a system_alerts;
begin
  perform admin_guard(p_admin);
  if length(btrim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'Resolver o alerta pede uma observação' using errcode = 'TS121';
  end if;
  update system_alerts set resolved_at = app_now(), resolved_by = p_admin, resolution_note = btrim(p_note)
   where id = p_id and resolved_at is null
  returning * into a;
  if not found then
    if exists (select 1 from system_alerts where id = p_id) then
      raise exception 'Alerta já resolvido' using errcode = 'TS161';
    end if;
    raise exception 'Alerta não encontrado' using errcode = 'TS130';
  end if;
  perform log_audit('ADMIN', p_admin, 'alerta.resolvido', 'system_alert', a.id::text, null, jsonb_build_object('tipo', a.kind));
  return alert_json(a);
end $$;

-- ─── Pulso dos jobs ──────────────────────────────────────────────────────────────────

create function job_heartbeat(p_job text, p_error text default null) returns void
language sql
security definer
set search_path = public
as $$
  update job_heartbeats
     set last_ok_at = case when p_error is null then app_now() else last_ok_at end,
         last_error_at = case when p_error is null then last_error_at else app_now() end,
         last_error = case when p_error is null then last_error else left(p_error, 500) end
   where job = p_job
$$;

-- Jobs atrasados, fila do WhatsApp parada, eventos de pagamento sem processar e execuções
-- do pg_cron que falharam: cada um vira alerta (e fecha sozinho quando volta ao normal).
create function check_job_health() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j job_heartbeats;
  v_problemas jsonb := '[]';
  v_fila timestamptz;
  v_eventos timestamptz;
  v_falha record;
begin
  for j in select * from job_heartbeats order by job loop
    if coalesce(j.last_ok_at, j.created_at) < app_now() - j.max_age then
      perform open_alert('JOB_ATRASADO', 'job:' || j.job, 'Job atrasado: ' || j.description,
                         jsonb_build_object('job', j.job, 'ultimoOk', j.last_ok_at, 'ultimoErro', j.last_error));
      v_problemas := v_problemas || jsonb_build_object('tipo', 'JOB_ATRASADO', 'job', j.job);
    else
      perform close_alert('job:' || j.job);
    end if;
  end loop;

  -- Mensagem esperando há mais de 10 min: WhatsApp fora do ar ou worker sem rodar
  select min(created_at) into v_fila from outbox_messages where status = 'PENDENTE' and next_attempt_at <= app_now();
  if v_fila < app_now() - interval '10 minutes' then
    perform open_alert('FILA_PARADA', 'fila_whatsapp', 'A fila do WhatsApp está parada há mais de 10 minutos',
                       jsonb_build_object('desde', v_fila));
    v_problemas := v_problemas || jsonb_build_object('tipo', 'FILA_PARADA');
  else
    perform close_alert('fila_whatsapp');
  end if;

  select min(received_at) into v_eventos from payment_events where processed_at is null and payment_ref is not null;
  if v_eventos < app_now() - interval '10 minutes' then
    perform open_alert('PAGAMENTOS_PARADOS', 'eventos_pagamento', 'Há avisos do Mercado Pago sem processar há mais de 10 minutos',
                       jsonb_build_object('desde', v_eventos));
    v_problemas := v_problemas || jsonb_build_object('tipo', 'PAGAMENTOS_PARADOS');
  else
    perform close_alert('eventos_pagamento');
  end if;

  -- Só no Supabase (o banco de testes não tem pg_cron)
  if to_regclass('cron.job_run_details') is not null then
    for v_falha in execute
      'select j.jobname, count(*) as falhas, max(d.return_message) as mensagem
         from cron.job_run_details d join cron.job j on j.jobid = d.jobid
        where d.status = ''failed'' and d.start_time > now() - interval ''30 minutes''
        group by j.jobname' loop
      perform open_alert('CRON_FALHOU', 'cron:' || v_falha.jobname, 'Job do banco falhou: ' || v_falha.jobname,
                         jsonb_build_object('falhas', v_falha.falhas, 'mensagem', left(v_falha.mensagem, 200)));
      v_problemas := v_problemas || jsonb_build_object('tipo', 'CRON_FALHOU', 'job', v_falha.jobname);
    end loop;
  end if;

  return jsonb_build_object('ok', jsonb_array_length(v_problemas) = 0, 'problemas', v_problemas, 'agora', app_now());
end $$;

-- ─── Verificador de invariantes do estoque (seção 05, job noturno) ───────────────────
-- qty_reserved = Σ itens de reservas RESERVADO; qty_sold = Σ itens de PAGAMENTO_CONFIRMADO
-- e ENTREGUE; qty_total ≥ reservado + vendido. Divergência vira alerta por produto.

create function check_stock_invariants() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_divergentes jsonb := '[]';
begin
  for v in
    select p.id, p.code, p.qty_total, p.qty_reserved, p.qty_sold,
           coalesce(sum(i.qty) filter (where r.status = 'RESERVADO'), 0)::int as reservado,
           coalesce(sum(i.qty) filter (where r.status in ('PAGAMENTO_CONFIRMADO', 'ENTREGUE')), 0)::int as vendido
      from products p
      left join reservation_items i on i.product_id = p.id
      left join reservations r on r.id = i.reservation_id
     group by p.id
     order by p.code
  loop
    if v.qty_reserved <> v.reservado or v.qty_sold <> v.vendido or v.qty_total < v.qty_reserved + v.qty_sold then
      perform open_alert('ESTOQUE_DIVERGENTE', 'estoque:' || v.id, 'Estoque divergente no produto ' || v.code,
                         jsonb_build_object('produtoId', v.id, 'codigo', v.code, 'total', v.qty_total, 'reservado', v.qty_reserved,
                                            'reservadoPelasReservas', v.reservado, 'vendido', v.qty_sold, 'vendidoPelasReservas', v.vendido));
      v_divergentes := v_divergentes || jsonb_build_object('codigo', v.code, 'reservado', v.qty_reserved, 'esperadoReservado', v.reservado,
                                                           'vendido', v.qty_sold, 'esperadoVendido', v.vendido);
    else
      perform close_alert('estoque:' || v.id);
    end if;
  end loop;
  perform job_heartbeat('invariantes');
  return jsonb_build_object('divergencias', jsonb_array_length(v_divergentes), 'produtos', v_divergentes);
end $$;

-- ─── Prazos de guarda (seção 13, G9, D15) ────────────────────────────────────────────
-- OTP, tentativas, consultas e sessões da cliente: 30 dias. IP em hash (inclusive na
-- auditoria): 30 dias. Texto das mensagens recebidas e mensagens já enviadas da fila:
-- 90 dias. Endereço: 90 dias depois da entrega, fica só cidade e UF. Reservas, pagamentos
-- e auditoria ficam (5 anos, a confirmar com a contabilidade).

create function purge_personal_data() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otp timestamptz := app_now() - make_interval(days => setting_int('guarda_otp_dias'));
  v_ip timestamptz := app_now() - make_interval(days => setting_int('guarda_ip_dias'));
  v_msg timestamptz := app_now() - make_interval(days => setting_int('guarda_whatsapp_recebidas_dias'));
  v_end timestamptz := app_now() - make_interval(days => setting_int('guarda_endereco_dias'));
  n jsonb := '{}';
  c integer;
begin
  delete from reservation_attempts where status <> 'CONVERTIDA' and updated_at < v_otp;
  get diagnostics c = row_count; n := n || jsonb_build_object('tentativas', c);
  -- A convertida fica (é a origem da reserva), sem a sessão do código e sem o IP
  update reservation_attempts set otp_session_id = null, ip_hash = null
   where status = 'CONVERTIDA' and updated_at < v_otp and (otp_session_id is not null or ip_hash is not null);
  delete from lookup_attempts where created_at < v_otp;
  get diagnostics c = row_count; n := n || jsonb_build_object('consultas', c);
  delete from otp_sessions s
   where s.last_activity_at < v_otp
     and not exists (select 1 from reservation_attempts a where a.otp_session_id = s.id)
     and not exists (select 1 from lookup_attempts l where l.otp_session_id = s.id);
  get diagnostics c = row_count; n := n || jsonb_build_object('sessoesCodigo', c);
  delete from customer_sessions where coalesce(revoked_at, expires_at) < v_otp;
  get diagnostics c = row_count; n := n || jsonb_build_object('sessoesCliente', c);

  perform set_config('app.purga_ip', 'on', true);
  update audit_log set ip_hash = null where ip_hash is not null and occurred_at < v_ip;
  get diagnostics c = row_count; n := n || jsonb_build_object('ipsAuditoria', c);
  perform set_config('app.purga_ip', 'off', true);

  update whatsapp_inbound set text = null where text is not null and received_at < v_msg;
  get diagnostics c = row_count; n := n || jsonb_build_object('textosRecebidos', c);
  delete from outbox_messages where status in ('ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU', 'DESCARTADA') and created_at < v_msg;
  get diagnostics c = row_count; n := n || jsonb_build_object('mensagensEnviadas', c);

  update fulfillments set address = jsonb_strip_nulls(jsonb_build_object('cidade', address ->> 'cidade', 'uf', address ->> 'uf')), updated_at = app_now()
   where closed_at < v_end and address ? 'rua';
  get diagnostics c = row_count; n := n || jsonb_build_object('enderecos', c);

  perform purge_rate_limits();
  perform purge_admin_login_guards();
  perform job_heartbeat('purga');
  perform log_audit('SISTEMA', null, 'dados.purga', 'app_settings', 'guarda', null, n);
  return n;
end $$;
