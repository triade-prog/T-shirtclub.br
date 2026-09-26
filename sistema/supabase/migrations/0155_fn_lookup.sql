-- 0155 · Consulta (F9): pelo site com código, pelo link da reserva e pelo WhatsApp
-- (seção 07, regra 22, G6, G13, D13, R17). O código usa o mesmo núcleo da reserva
-- (otp_emit e otp_check, 0110), com a sessão de finalidade CONSULTA e o mesmo bloqueio de
-- 30 min por telefone. Nenhuma resposta revela se o telefone tem reservas antes do código.

-- ─── Tentativa de consulta ───────────────────────────────────────────────────────────

create function create_lookup_attempt(p_phone text, p_reason lookup_reason, p_reservation_id uuid, p_token_hash text,
                                      p_ip_hash text default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ate timestamptz;
  s otp_sessions;
  v_id uuid;
  v_ref text;
begin
  v_ate := otp_lock_until(p_phone);
  if v_ate is not null then
    return jsonb_build_object('erro', 'OTP_LOCKED', 'detalhes', jsonb_build_object('ate', v_ate));
  end if;

  s := otp_session_for(p_phone, 'CONSULTA');
  update otp_sessions set last_activity_at = app_now() where id = s.id;
  -- Só a consulta mais nova do telefone fica em aberto
  update lookup_attempts set status = 'ABANDONADA' where phone_e164 = p_phone and status = 'AGUARDANDO_VALIDACAO';

  for i in 1 .. 20 loop
    begin
      v_ref := gen_attempt_ref();
      insert into lookup_attempts (ref, reason, phone_e164, reservation_id, otp_session_id, browser_token_hash, ip_hash)
      values (v_ref, p_reason, p_phone, p_reservation_id, s.id, p_token_hash, p_ip_hash)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if i = 20 then raise; end if;
    end;
  end loop;

  perform log_audit('CLIENTE', null, 'consulta.criada', 'lookup_attempt', v_id::text, p_reservation_id,
                    jsonb_build_object('motivo', p_reason), p_ip_hash);
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- Código pedido pelo WhatsApp com a referência da consulta.
create function otp_issue_lookup_code(p_ref text, p_senders text[], p_code_hash text, p_wa_message_id text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l lookup_attempts;
  r jsonb;
begin
  select * into l from lookup_attempts
   where ref = upper(btrim(p_ref)) and status = 'AGUARDANDO_VALIDACAO'
     and created_at > app_now() - make_interval(mins => setting_int('otp_janela_minutos'))
   for update;
  if not found then
    return jsonb_build_object('acao', 'REFERENCIA_INVALIDA');
  end if;
  if not (l.phone_e164 = any(p_senders)) then
    return jsonb_build_object('acao', 'NUMERO_DIFERENTE');
  end if;

  r := otp_emit(l.phone_e164, l.otp_session_id, 'CONSULTA', p_code_hash, p_wa_message_id);
  if r ? 'sessaoId' and (r ->> 'sessaoId')::uuid <> l.otp_session_id then
    update lookup_attempts set otp_session_id = (r ->> 'sessaoId')::uuid where id = l.id;
  end if;
  return r - 'sessaoId';
end $$;

-- A tela acompanha a consulta a cada 2 s (mesmas situações da tentativa de reserva).
create function lookup_status(p_id uuid, p_token_hash text) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  l lookup_attempts;
  s otp_sessions;
  c otp_codes;
  v_ate timestamptz;
  v_situacao text;
begin
  select * into l from lookup_attempts where id = p_id and browser_token_hash = p_token_hash;
  if not found then
    return null;
  end if;
  select * into s from otp_sessions where id = l.otp_session_id;
  select * into c from otp_codes where session_id = s.id and status = 'ATIVO';
  v_ate := otp_lock_until(l.phone_e164);

  v_situacao := case
    when l.status <> 'AGUARDANDO_VALIDACAO' then l.status::text
    when v_ate is not null then 'BLOQUEADA'
    when c.id is not null and c.expires_at > app_now() then 'CODIGO_ENVIADO'
    when s.codes_sent > 0 then 'CODIGO_VENCIDO'
    else 'AGUARDANDO_MENSAGEM'
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', l.id, 'ref', l.ref, 'motivo', l.reason, 'situacao', v_situacao, 'telefone', l.phone_e164, 'reservaId', l.reservation_id,
    'codigo', case when v_situacao = 'CODIGO_ENVIADO' then jsonb_build_object(
      'expiraEm', c.expires_at,
      'tentativasRestantes', setting_int('otp_tentativas') - c.attempts_used,
      'codigosRestantes', setting_int('otp_codigos_max') - s.codes_sent) end,
    'bloqueadoAte', v_ate,
    'agora', app_now()));
end $$;

-- Código certo: a consulta fica VERIFICADA e a api-public abre a sessão do telefone.
-- Repetir a chamada logo depois (rede caiu) devolve o mesmo resultado por 10 min.
create function verify_lookup(p_id uuid, p_token_hash text, p_code_hash text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l lookup_attempts;
  r jsonb;
begin
  select * into l from lookup_attempts where id = p_id and browser_token_hash = p_token_hash for update;
  if not found or l.status = 'ABANDONADA' or (l.status = 'VERIFICADA' and l.verified_at < app_now() - interval '10 minutes') then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;
  if l.status = 'AGUARDANDO_VALIDACAO' then
    r := otp_check(l.phone_e164, l.otp_session_id, p_code_hash);
    if not r ? 'ok' then
      return r;
    end if;
    update lookup_attempts set status = 'VERIFICADA', verified_at = app_now() where id = l.id;
    perform log_audit('CLIENTE', null, 'consulta.verificada', 'lookup_attempt', l.id::text, l.reservation_id);
  end if;
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'telefone', l.phone_e164, 'reservaId', l.reservation_id));
end $$;

-- ─── Reservas do telefone (GET /v1/me/reservations) ──────────────────────────────────

create function reservation_summary_json(r reservations) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', r.id, 'numero', r.number, 'status', r.status, 'motivoEncerramento', r.closure_reason,
    'totalCentavos', r.total_cents, 'criadaEm', r.created_at,
    'pecas', (select sum(qty) from reservation_items where reservation_id = r.id),
    'expiraEm', case when r.status = 'RESERVADO' then r.expires_at end,
    'substatus', (select f.substatus from fulfillments f where f.reservation_id = r.id and f.closed_at is null),
    'modalidade', (select f.mode from fulfillments f where f.reservation_id = r.id),
    'cancelamentoPendente', exists (select 1 from cancellation_requests c where c.reservation_id = r.id and c.status = 'PENDENTE')))
$$;

create function customer_reservations(p_phone text) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(reservation_summary_json(r) order by r.created_at desc, r.number desc), '[]')
    from (select * from reservations where phone_e164 = p_phone order by created_at desc, number desc limit 50) r
$$;

-- ─── Link da reserva (POST /v1/r, G6) ────────────────────────────────────────────────
-- O banco só tem o hash da chave; a chave em si vem no corpo, lida do fragmento do link.

create function reservation_by_key(p_key_hash text) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', r.id, 'telefone', r.phone_e164) from reservations r where r.access_key_hash = p_key_hash
$$;

-- ─── "Minha reserva" pelo WhatsApp (seção 07, regra 22, R17) ─────────────────────────
-- O remetente é a prova: responde na conversa, sem código. As abertas (reservada no prazo
-- ou paga e ainda não entregue); sem nenhuma, a última encerrada nos últimos 30 dias.

create function whatsapp_my_reservations(p_senders text[]) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with abertas as (
    select r.* from reservations r
     where r.phone_e164 = any(p_senders)
       and ((r.status = 'RESERVADO' and reservation_is_live(r)) or r.status = 'PAGAMENTO_CONFIRMADO')
     order by r.created_at desc, r.number desc limit 5
  ), recente as (
    select r.* from reservations r
     where r.phone_e164 = any(p_senders) and not exists (select 1 from abertas)
       and r.status in ('ENTREGUE', 'EXPIRADO')
       and coalesce(r.delivered_at, r.expired_at) > app_now() - interval '30 days'
     order by coalesce(r.delivered_at, r.expired_at) desc limit 1
  )
  select coalesce(jsonb_agg(reservation_summary_json(x) order by x.created_at desc, x.number desc), '[]')
    from (select * from abertas union all select * from recente) x
$$;
