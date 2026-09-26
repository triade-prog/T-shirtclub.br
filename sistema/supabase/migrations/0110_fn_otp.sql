-- 0110 · Código pelo WhatsApp, verificação invertida (seção 07, W3, D10)
-- 1. A loja cria a tentativa com uma referência curta (create_reservation_attempt).
-- 2. A cliente manda "Quero meu código da reserva (ref. K7Q2)"; o webhook chama
--    otp_issue_code, que confere o remetente e registra o código (a Edge Function gera o
--    código, calcula o HMAC com o pepper e responde na conversa).
-- 3. A cliente digita o código no site: otp_verify.
-- Regras: 5 min por código, 2 tentativas por código, até 3 códigos por sessão (o primeiro
-- e 2 reenvios), 30 s entre códigos. O último código errado 2 vezes ou vencido, ou um
-- quarto pedido, bloqueia o telefone por 30 min, para as duas finalidades.
-- Resultados de negócio voltam em JSON (e não como exceção) para os contadores ficarem
-- gravados mesmo quando a resposta é um erro para a cliente.

create function gen_attempt_ref() returns text
language plpgsql volatile
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- sem 0, 1, I e O
  b bytea := extensions.gen_random_bytes(4);
  r text := '';
begin
  for i in 0 .. 3 loop
    r := r || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return r;
end $$;

-- Até quando o telefone está bloqueado para pedir código (qualquer finalidade), ou null.
create function otp_lock_until(p_phone text) returns timestamptz
language sql stable
set search_path = public
as $$
  select max(blocked_until) from otp_sessions
   where phone_e164 = p_phone and status = 'BLOQUEADA' and blocked_until > app_now()
$$;

-- Sessão aberta do telefone para a finalidade (travada), ou uma nova.
create function otp_session_for(p_phone text, p_purpose otp_purpose) returns otp_sessions
language plpgsql
set search_path = public
as $$
declare s otp_sessions;
begin
  perform pg_advisory_xact_lock(hashtext('otp:' || p_phone || ':' || p_purpose));
  select * into s from otp_sessions
   where phone_e164 = p_phone and purpose = p_purpose and status = 'ABERTA'
     and last_activity_at > app_now() - make_interval(mins => setting_int('otp_janela_minutos'))
   order by created_at desc limit 1
   for update;
  if not found then
    insert into otp_sessions (phone_e164, purpose) values (p_phone, p_purpose) returning * into s;
  end if;
  return s;
end $$;

create function otp_block_session(p_session_id uuid) returns timestamptz
language plpgsql
set search_path = public
as $$
declare v_ate timestamptz := app_now() + make_interval(mins => setting_int('otp_bloqueio_minutos'));
begin
  update otp_codes set status = 'VENCIDO' where session_id = p_session_id and status = 'ATIVO';
  update otp_sessions set status = 'BLOQUEADA', blocked_until = v_ate, last_activity_at = app_now() where id = p_session_id;
  perform log_audit('SISTEMA', null, 'otp.bloqueado', 'otp_session', p_session_id::text, null,
                    jsonb_build_object('minutos', setting_int('otp_bloqueio_minutos')));
  return v_ate;
end $$;

-- ─── 1. Tentativa ────────────────────────────────────────────────────────────────────
-- Antes de gastar uma mensagem: telefone bloqueado por abuso, reserva ativa e bloqueio do
-- código. Regras do carrinho, estoque aproximado e preço a api-public confere antes.

create function create_reservation_attempt(p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := p ->> 'telefone';
  v_ativa record;
  v_ate timestamptz;
  s otp_sessions;
  v_id uuid;
  v_ref text;
begin
  if phone_is_blocked(v_phone) then
    return jsonb_build_object('erro', 'PHONE_BLOCKED');
  end if;
  select r.number, r.expires_at into v_ativa
    from reservations r where r.phone_e164 = v_phone and r.status = 'RESERVADO' and reservation_is_live(r) limit 1;
  if found then
    return jsonb_build_object('erro', 'ACTIVE_RESERVATION_EXISTS',
                              'detalhes', jsonb_build_object('numeroReserva', v_ativa.number, 'expiraEm', v_ativa.expires_at));
  end if;
  v_ate := otp_lock_until(v_phone);
  if v_ate is not null then
    return jsonb_build_object('erro', 'OTP_LOCKED', 'detalhes', jsonb_build_object('ate', v_ate));
  end if;

  s := otp_session_for(v_phone, 'RESERVA');
  update otp_sessions set last_activity_at = app_now() where id = s.id;

  -- Só a tentativa mais nova do telefone fica em aberto.
  update reservation_attempts set status = 'ABANDONADA'
   where phone_e164 = v_phone and status in ('AGUARDANDO_VALIDACAO', 'VERIFICADA', 'FALHOU_ESTOQUE');

  for i in 1 .. 20 loop
    begin
      v_ref := gen_attempt_ref();
      insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, coupon_code,
                                        expected_total_cents, otp_session_id, ip_hash, browser_token_hash)
      values (v_ref, btrim(p ->> 'nome'), v_phone, (p ->> 'entrega')::delivery_mode, p -> 'itens', nullif(p ->> 'cupom', ''),
              (p ->> 'totalEsperadoCentavos')::int, s.id, p ->> 'ipHash', p ->> 'tokenHash')
      returning id into v_id;
      exit;
    exception when unique_violation then
      if i = 20 then raise; end if;
    end;
  end loop;

  perform log_audit('CLIENTE', null, 'tentativa.criada', 'reservation_attempt', v_id::text, null,
                    jsonb_build_object('pecas', (select sum((x ->> 'qtd')::int) from jsonb_array_elements(p -> 'itens') x)), p ->> 'ipHash');
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- ─── 2. Código pedido pelo WhatsApp ──────────────────────────────────────────────────
-- p_senders: o remetente nas formas com e sem o nono dígito (R17).

create function otp_issue_code(p_ref text, p_senders text[], p_code_hash text, p_wa_message_id text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a reservation_attempts;
  s otp_sessions;
  v_ultimo timestamptz;
  v_ate timestamptz;
  v_validade integer := setting_int('otp_validade_minutos');
begin
  select * into a from reservation_attempts
   where ref = upper(btrim(p_ref)) and status = 'AGUARDANDO_VALIDACAO'
     and created_at > app_now() - make_interval(mins => setting_int('otp_janela_minutos'))
   for update;
  if not found then
    return jsonb_build_object('acao', 'REFERENCIA_INVALIDA');
  end if;
  if not (a.phone_e164 = any(p_senders)) then
    return jsonb_build_object('acao', 'NUMERO_DIFERENTE');
  end if;

  v_ate := otp_lock_until(a.phone_e164);
  if v_ate is not null then
    return jsonb_build_object('acao', 'BLOQUEADO', 'ate', v_ate);
  end if;

  select * into s from otp_sessions where id = a.otp_session_id for update;
  if s.status <> 'ABERTA' or s.last_activity_at < app_now() - make_interval(mins => setting_int('otp_janela_minutos')) then
    s := otp_session_for(a.phone_e164, 'RESERVA');
    update reservation_attempts set otp_session_id = s.id where id = a.id;
  end if;

  select max(created_at) into v_ultimo from otp_codes where session_id = s.id;
  if v_ultimo > app_now() - make_interval(secs => setting_int('otp_intervalo_segundos')) then
    return jsonb_build_object('acao', 'AGUARDE');
  end if;

  if s.codes_sent >= setting_int('otp_codigos_max') then
    return jsonb_build_object('acao', 'BLOQUEADO', 'ate', otp_block_session(s.id));
  end if;

  update otp_codes set status = 'SUBSTITUIDO' where session_id = s.id and status = 'ATIVO';
  insert into otp_codes (session_id, code_hash, expires_at, wa_message_id)
  values (s.id, p_code_hash, app_now() + make_interval(mins => v_validade), p_wa_message_id);
  update otp_sessions set codes_sent = codes_sent + 1, last_activity_at = app_now() where id = s.id;
  perform log_audit('SISTEMA', null, 'otp.enviado', 'otp_session', s.id::text, null, jsonb_build_object('codigo', s.codes_sent + 1));

  return jsonb_build_object('acao', 'ENVIAR_CODIGO', 'telefone', a.phone_e164, 'validadeMinutos', v_validade,
                            'codigosRestantes', setting_int('otp_codigos_max') - s.codes_sent - 1);
end $$;

-- ─── 3. Verificação ──────────────────────────────────────────────────────────────────

create function otp_verify(p_attempt_id uuid, p_token_hash text, p_code_hash text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a reservation_attempts;
  s otp_sessions;
  c otp_codes;
  v_ate timestamptz;
  v_max integer := setting_int('otp_tentativas');
begin
  select * into a from reservation_attempts where id = p_attempt_id and browser_token_hash = p_token_hash for update;
  if not found or a.status = 'ABANDONADA' then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;
  if a.status = 'CONVERTIDA' then
    return jsonb_build_object('ok', true, 'reservaId', a.reservation_id);
  end if;
  if a.status in ('VERIFICADA', 'FALHOU_ESTOQUE') and a.verified_until > app_now() then
    return jsonb_build_object('ok', true);
  end if;

  v_ate := otp_lock_until(a.phone_e164);
  if v_ate is not null then
    return jsonb_build_object('erro', 'OTP_LOCKED', 'detalhes', jsonb_build_object('ate', v_ate));
  end if;

  select * into s from otp_sessions where id = a.otp_session_id for update;
  select * into c from otp_codes where session_id = s.id and status = 'ATIVO' for update;
  if not found then
    return jsonb_build_object('erro', case when s.codes_sent > 0 then 'OTP_EXPIRED' else 'ATTEMPT_NOT_VERIFIED' end);
  end if;

  if c.expires_at <= app_now() then
    update otp_codes set status = 'VENCIDO' where id = c.id;
    if s.codes_sent >= setting_int('otp_codigos_max') then
      return jsonb_build_object('erro', 'OTP_LOCKED', 'detalhes', jsonb_build_object('ate', otp_block_session(s.id)));
    end if;
    return jsonb_build_object('erro', 'OTP_EXPIRED');
  end if;

  if c.code_hash = p_code_hash then
    update otp_codes set status = 'USADO', attempts_used = attempts_used + 1 where id = c.id;
    update otp_sessions set status = 'VERIFICADA', verified_at = app_now(), last_activity_at = app_now() where id = s.id;
    update reservation_attempts
       set status = 'VERIFICADA', verified_until = app_now() + make_interval(mins => setting_int('tentativa_verificada_minutos'))
     where id = a.id;
    perform log_audit('CLIENTE', null, 'otp.verificado', 'otp_session', s.id::text);
    return jsonb_build_object('ok', true);
  end if;

  update otp_codes set attempts_used = attempts_used + 1,
                       status = case when attempts_used + 1 >= v_max then 'ESGOTADO'::otp_code_status else status end
   where id = c.id;
  update otp_sessions set last_activity_at = app_now() where id = s.id;
  if c.attempts_used + 1 >= v_max then
    if s.codes_sent >= setting_int('otp_codigos_max') then
      return jsonb_build_object('erro', 'OTP_LOCKED', 'detalhes', jsonb_build_object('ate', otp_block_session(s.id)));
    end if;
    return jsonb_build_object('erro', 'OTP_INVALID', 'detalhes', jsonb_build_object('tentativasRestantes', 0, 'podePedirOutro', true));
  end if;
  return jsonb_build_object('erro', 'OTP_INVALID', 'detalhes', jsonb_build_object('tentativasRestantes', v_max - c.attempts_used - 1));
end $$;

-- ─── Acompanhamento da tentativa (a tela consulta a cada 2 s) ─────────────────────────

create function attempt_status(p_attempt_id uuid, p_token_hash text) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  a reservation_attempts;
  s otp_sessions;
  c otp_codes;
  v_ate timestamptz;
  v_situacao text;
begin
  select * into a from reservation_attempts where id = p_attempt_id and browser_token_hash = p_token_hash;
  if not found then
    return null;
  end if;
  select * into s from otp_sessions where id = a.otp_session_id;
  select * into c from otp_codes where session_id = s.id and status = 'ATIVO';
  v_ate := otp_lock_until(a.phone_e164);

  v_situacao := case
    when a.status = 'CONVERTIDA' then 'CONVERTIDA'
    when a.status = 'ABANDONADA' then 'ABANDONADA'
    when a.status in ('VERIFICADA', 'FALHOU_ESTOQUE') and a.verified_until > app_now() then a.status::text
    when a.status in ('VERIFICADA', 'FALHOU_ESTOQUE') then 'VERIFICACAO_VENCIDA'
    when v_ate is not null then 'BLOQUEADA'
    when c.id is not null and c.expires_at > app_now() then 'CODIGO_ENVIADO'
    when s.codes_sent > 0 then 'CODIGO_VENCIDO'
    else 'AGUARDANDO_MENSAGEM'
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', a.id,
    'ref', a.ref,
    'situacao', v_situacao,
    'telefone', a.phone_e164,
    'codigo', case when v_situacao = 'CODIGO_ENVIADO' then jsonb_build_object(
      'expiraEm', c.expires_at,
      'tentativasRestantes', setting_int('otp_tentativas') - c.attempts_used,
      'codigosRestantes', setting_int('otp_codigos_max') - s.codes_sent) end,
    'bloqueadoAte', v_ate,
    'verificadaAte', case when a.status in ('VERIFICADA', 'FALHOU_ESTOQUE') then a.verified_until end,
    'reservaId', a.reservation_id,
    'agora', app_now()));
end $$;

-- ─── Sessão da cliente ───────────────────────────────────────────────────────────────

create function create_customer_session(p_phone text, p_token_hash text, p_scope text) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_expira timestamptz := app_now() + make_interval(hours => setting_int('sessao_cliente_horas'));
begin
  insert into customer_sessions (phone_e164, token_hash, scope, expires_at) values (p_phone, p_token_hash, p_scope, v_expira);
  return v_expira;
end $$;

create function customer_session_get(p_token_hash text) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object('telefone', phone_e164, 'escopo', scope, 'expiraEm', expires_at)
    from customer_sessions
   where token_hash = p_token_hash and revoked_at is null and expires_at > app_now()
$$;
