-- 0170 · Pós-pagamento: modalidade, frete, substatus e Entregue (regras 17 a 19, D8, G2, G15)
-- Ordem de locks: reservations → fulfillments → shipping_quotes → payments. Toda função
-- trava a reserva primeiro, então o frete nunca disputa lock em ordem diferente.
-- Máquina do substatus (seção 03):
--   AGUARDANDO_MODALIDADE → EM_PREPARACAO (retirada) | AGUARDANDO_CALCULO_FRETE (motoboy, envio)
--   AGUARDANDO_CALCULO_FRETE → AGUARDANDO_PAGAMENTO_FRETE (painel informa o frete)
--   AGUARDANDO_PAGAMENTO_FRETE → EM_PREPARACAO (frete pago) | FRETE_VENCIDO (2 h)
--   FRETE_VENCIDO → AGUARDANDO_PAGAMENTO_FRETE (painel recalcula)
--   antes de pagar o frete ou confirmar a retirada, a cliente pode trocar a modalidade
--   EM_PREPARACAO → PRONTO_PARA_RETIRADA | SAIU_PARA_ENTREGA | ENVIADO → T5 ENTREGUE

create function gen_pickup_code() returns text
language plpgsql volatile
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- sem 0, 1, I e O
  b bytea := extensions.gen_random_bytes(6);
  r text := '';
begin
  for i in 0 .. 5 loop
    r := r || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return r;
end $$;

-- Cria a entrega no pagamento dos produtos (T2 ou conversão de análise), na modalidade da
-- reserva. O código de retirada é único entre os pedidos em aberto (G15).
create function ensure_fulfillment(r reservations) returns void
language plpgsql
set search_path = public
as $$
declare v_codigo text;
begin
  if exists (select 1 from fulfillments where reservation_id = r.id) then
    return;
  end if;
  loop
    v_codigo := gen_pickup_code();
    exit when not exists (select 1 from fulfillments where pickup_code = v_codigo and closed_at is null);
  end loop;
  insert into fulfillments (reservation_id, mode, pickup_code) values (r.id, r.delivery_intent, v_codigo);
end $$;

-- Erro de negócio da cliente conforme o estado da reserva.
create function fulfillment_status_error(r reservations) returns jsonb
language sql immutable
as $$
  select case when r.status = 'RESERVADO' then jsonb_build_object('erro', 'NOT_PAID')
              when r.status <> 'PAGAMENTO_CONFIRMADO' then jsonb_build_object('erro', 'RESERVATION_NOT_ACTIVE') end
$$;

-- ─── Cliente ─────────────────────────────────────────────────────────────────────────

-- Confirma ou troca a modalidade (e o endereço) antes de pagar o frete ou confirmar a
-- retirada. A api-public só chama com a sessão de escopo TELEFONE (D13).
create function set_fulfillment(p_reservation_id uuid, p_phone text, p_mode delivery_mode, p_address jsonb default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
  f fulfillments;
begin
  select * into r from reservations where id = p_reservation_id and phone_e164 = p_phone for update;
  if not found then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;
  if fulfillment_status_error(r) is not null then
    return fulfillment_status_error(r);
  end if;
  select * into f from fulfillments where reservation_id = r.id for update;
  if exists (select 1 from shipping_quotes where reservation_id = r.id and status = 'PAGO') then
    return jsonb_build_object('erro', 'SHIPPING_ALREADY_PAID');
  end if;
  if f.substatus not in ('AGUARDANDO_MODALIDADE', 'AGUARDANDO_CALCULO_FRETE', 'AGUARDANDO_PAGAMENTO_FRETE', 'FRETE_VENCIDO') then
    return jsonb_build_object('erro', 'DELIVERY_LOCKED');
  end if;
  if p_mode <> 'RETIRADA' and (p_address is null or not address_ok(p_address)) then
    return jsonb_build_object('erro', 'VALIDATION_ERROR', 'detalhes', jsonb_build_object('campo', 'endereco'));
  end if;

  -- A cotação anterior perde o valor; uma cobrança dela em aberto é cancelada pelo worker
  update shipping_quotes set status = 'SUBSTITUIDO' where reservation_id = r.id and status in ('AGUARDANDO_PAGAMENTO', 'VENCIDO');
  update fulfillments
     set mode = p_mode,
         address = case when p_mode = 'RETIRADA' then null else p_address end,
         substatus = case when p_mode = 'RETIRADA' then 'EM_PREPARACAO' else 'AGUARDANDO_CALCULO_FRETE' end::fulfillment_substatus,
         confirmed_at = app_now(), updated_at = app_now()
   where reservation_id = r.id
  returning * into f;

  perform enqueue_message('entrega_confirmada:' || r.id || ':' || extract(epoch from app_now())::bigint, r.phone_e164, 'entrega_confirmada',
                          jsonb_build_object('numero', r.number, 'modalidade', p_mode), 2::smallint, app_now() + interval '1 day',
                          r.id, 'PAGAMENTO_CONFIRMADO', p_optional => true);
  -- Sem endereço na auditoria (G9)
  perform log_audit('CLIENTE', null, 'entrega.confirmada', 'reservation', r.id::text, r.id, jsonb_build_object('modalidade', p_mode));
  return jsonb_build_object('logistica', fulfillment_json(f, false));
end $$;

-- Segundo pagamento: o frete da cotação ativa, pela mesma forma dos produtos.
create function register_shipping_payment(p_reservation_id uuid, p_phone text, p_method payment_method, p_idempotency_key uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
  q shipping_quotes;
  p payments;
begin
  select * into r from reservations where id = p_reservation_id and phone_e164 = p_phone for update;
  if not found then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;

  select * into p from payments where idempotency_key = p_idempotency_key;
  if found then
    if p.reservation_id <> r.id or p.purpose <> 'FRETE' then
      return jsonb_build_object('erro', 'VALIDATION_ERROR');
    end if;
    return jsonb_build_object('pagamento', payment_json(p), 'repetido', true);
  end if;

  if fulfillment_status_error(r) is not null then
    return fulfillment_status_error(r);
  end if;
  select * into q from shipping_quotes where reservation_id = r.id and status <> 'SUBSTITUIDO' for update;
  if not found then
    return jsonb_build_object('erro', 'DELIVERY_LOCKED');
  end if;
  if q.status = 'PAGO' then
    return jsonb_build_object('erro', 'SHIPPING_ALREADY_PAID');
  end if;
  if q.status = 'VENCIDO' or app_now() >= q.pay_until then
    return jsonb_build_object('erro', 'QUOTE_EXPIRED');
  end if;
  if r.payment_method is not null and r.payment_method <> p_method then
    return jsonb_build_object('erro', 'METHOD_LOCKED', 'detalhes', jsonb_build_object('forma', r.payment_method));
  end if;
  select * into p from payments where reservation_id = r.id and purpose = 'FRETE' and status in ('CRIADO', 'PENDENTE');
  if found then
    return jsonb_build_object('erro', 'PAYMENT_IN_PROGRESS', 'detalhes', jsonb_build_object('pagamentoId', p.id));
  end if;

  insert into payments (reservation_id, purpose, shipping_quote_id, method, idempotency_key, amount_cents)
  values (r.id, 'FRETE', q.id, p_method, p_idempotency_key, q.amount_cents)
  returning * into p;
  perform log_audit('CLIENTE', null, 'frete.tentativa', 'payment', p.id::text, r.id, jsonb_build_object('forma', p_method));
  return jsonb_build_object('pagamento', payment_json(p), 'pagarAte', q.pay_until);
end $$;

-- Frete aprovado no provedor (chamado por apply_payment_result, com a reserva e o
-- pagamento já travados). Pago depois das 2 h ainda vale: o prazo vencido é só alerta (D8).
-- Cotação substituída ou pedido fora de PAGAMENTO_CONFIRMADO: análise, para estornar.
create function apply_shipping_approval(r reservations, pg payments, p_valor integer, p_aprovado timestamptz) returns jsonb
language plpgsql
set search_path = public
as $$
declare q shipping_quotes;
begin
  select * into q from shipping_quotes where id = pg.shipping_quote_id for update;
  if p_valor is distinct from pg.amount_cents then
    return send_to_review(pg, 'VALOR_DIVERGENTE', p_aprovado);
  end if;
  if r.status <> 'PAGAMENTO_CONFIRMADO' or q.status not in ('AGUARDANDO_PAGAMENTO', 'VENCIDO') then
    return send_to_review(pg, 'FRETE_ENCERRADO', p_aprovado);
  end if;

  update payments set status = 'APROVADO', applied = true, approved_at = p_aprovado where id = pg.id;
  update shipping_quotes set status = 'PAGO', paid_at = app_now() where id = q.id;
  update fulfillments set substatus = 'EM_PREPARACAO', updated_at = app_now() where reservation_id = r.id;
  perform enqueue_message('frete_confirmado:' || q.id, r.phone_e164, 'frete_confirmado', jsonb_build_object('numero', r.number),
                          2::smallint, app_now() + interval '1 day', r.id, 'PAGAMENTO_CONFIRMADO', p_optional => true);
  perform log_audit('PROVEDOR', null, 'frete.pago', 'payment', pg.id::text, r.id,
                    jsonb_build_object('valor_cents', pg.amount_cents, 'apos_prazo', q.status = 'VENCIDO'));
  return jsonb_build_object('resultado', 'CONFIRMADO');
end $$;

-- ─── Job: frete não pago em 2 h (D8) ─────────────────────────────────────────────────
-- Nada automático além de marcar: o pedido continua pago e aparece como alerta no painel.

create function sweep_shipping_quotes() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  q shipping_quotes;
  n integer := 0;
begin
  for v in select id, reservation_id from shipping_quotes where status = 'AGUARDANDO_PAGAMENTO' and pay_until <= app_now() order by pay_until limit 200 loop
    perform 1 from reservations where id = v.reservation_id for update skip locked;
    if not found then
      continue;
    end if;
    select * into q from shipping_quotes where id = v.id for update;
    if q.status <> 'AGUARDANDO_PAGAMENTO' then
      continue;
    end if;
    update shipping_quotes set status = 'VENCIDO' where id = q.id;
    update fulfillments set substatus = 'FRETE_VENCIDO', updated_at = app_now()
     where reservation_id = q.reservation_id and substatus = 'AGUARDANDO_PAGAMENTO_FRETE';
    perform log_audit('SISTEMA', null, 'frete.vencido', 'reservation', q.reservation_id::text, q.reservation_id);
    n := n + 1;
  end loop;
  perform job_heartbeat('frete');
  return n;
end $$;

-- ─── Painel ──────────────────────────────────────────────────────────────────────────

-- Trava a reserva e a entrega para uma ação do painel.
create function lock_fulfillment(p_reservation_id uuid, p_admin uuid, out r reservations, out f fulfillments)
language plpgsql
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  select * into r from reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reserva não encontrada' using errcode = 'TS130';
  end if;
  if r.status = 'ENTREGUE' then
    raise exception 'Pedido já entregue' using errcode = 'TS161';
  end if;
  if r.status <> 'PAGAMENTO_CONFIRMADO' then
    raise exception 'O pedido não está pago' using errcode = 'TS170';
  end if;
  select * into f from fulfillments where reservation_id = r.id for update;
end $$;

-- Informa (ou recalcula) o frete: começa o prazo de 2 h para pagar.
create function admin_shipping_quote(p_reservation_id uuid, p_admin uuid, p_amount_cents integer, p_days integer default null,
                                     p_note text default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  r reservations;
  f fulfillments;
  q shipping_quotes;
begin
  select * into v from lock_fulfillment(p_reservation_id, p_admin);
  r := v.r;
  f := v.f;
  if f.mode = 'RETIRADA' or f.substatus not in ('AGUARDANDO_CALCULO_FRETE', 'AGUARDANDO_PAGAMENTO_FRETE', 'FRETE_VENCIDO') then
    raise exception 'O frete só é informado com o endereço da cliente e antes do pagamento (%)', f.substatus using errcode = 'TS172';
  end if;

  update shipping_quotes set status = 'SUBSTITUIDO' where reservation_id = r.id and status in ('AGUARDANDO_PAGAMENTO', 'VENCIDO');
  insert into shipping_quotes (reservation_id, mode, amount_cents, delivery_days, note, calculated_by, pay_until)
  values (r.id, f.mode, p_amount_cents, p_days, nullif(btrim(p_note), ''), p_admin,
          app_now() + make_interval(hours => setting_int('frete_prazo_horas')))
  returning * into q;
  update fulfillments set substatus = 'AGUARDANDO_PAGAMENTO_FRETE', updated_at = app_now() where reservation_id = r.id returning * into f;

  perform enqueue_message('frete_calculado:' || q.id, r.phone_e164, 'frete_calculado',
                          jsonb_build_object('numero', r.number, 'valorCentavos', q.amount_cents, 'pagarAte', q.pay_until),
                          1::smallint, q.pay_until, r.id, 'PAGAMENTO_CONFIRMADO', p_optional => true);
  perform log_audit('ADMIN', p_admin, 'frete.calculado', 'reservation', r.id::text, r.id,
                    jsonb_build_object('valor_cents', q.amount_cents, 'prazo_dias', q.delivery_days));
  return fulfillment_json(f, true);
end $$;

-- Avança o substatus depois da preparação: pronto para retirada, saiu para entrega ou
-- enviado, conforme a modalidade. Cada mudança avisa a cliente (opcional).
create function admin_set_substatus(p_reservation_id uuid, p_admin uuid, p_substatus fulfillment_substatus,
                                    p_tracking text default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  r reservations;
  f fulfillments;
  v_proximo fulfillment_substatus;
  v_modelo text;
  v_params jsonb;
begin
  select * into v from lock_fulfillment(p_reservation_id, p_admin);
  r := v.r;
  f := v.f;
  v_proximo := case f.mode when 'RETIRADA' then 'PRONTO_PARA_RETIRADA' when 'MOTOBOY' then 'SAIU_PARA_ENTREGA' else 'ENVIADO' end;
  if f.substatus <> 'EM_PREPARACAO' or p_substatus <> v_proximo then
    raise exception 'De % com % só se vai para %', f.substatus, f.mode, v_proximo using errcode = 'TS172';
  end if;
  if p_tracking is not null and f.mode <> 'ENVIO' then
    raise exception 'Código de rastreio só no envio' using errcode = 'TS121';
  end if;

  update fulfillments set substatus = p_substatus, tracking_code = nullif(upper(btrim(p_tracking)), ''), updated_at = app_now()
   where reservation_id = r.id
  returning * into f;

  v_modelo := case p_substatus when 'PRONTO_PARA_RETIRADA' then 'pronto_retirada' when 'SAIU_PARA_ENTREGA' then 'saiu_entrega' else 'pedido_enviado' end;
  v_params := jsonb_strip_nulls(jsonb_build_object(
    'numero', r.number,
    'codigo', case when f.mode = 'RETIRADA' then f.pickup_code end,
    'endereco', case when f.mode = 'RETIRADA' then nullif(setting('loja_endereco_retirada') #>> '{}', '') end,
    'horario', case when f.mode = 'RETIRADA' then nullif(setting('loja_horario_retirada') #>> '{}', '') end,
    'rastreio', f.tracking_code));
  perform enqueue_message(v_modelo || ':' || r.id, r.phone_e164, v_modelo, v_params, 2::smallint, app_now() + interval '1 day',
                          r.id, 'PAGAMENTO_CONFIRMADO', p_optional => true);
  perform log_audit('ADMIN', p_admin, 'entrega.substatus', 'reservation', r.id::text, r.id, jsonb_build_object('substatus', p_substatus));
  return fulfillment_json(f, true);
end $$;

-- T5: Entregue, estado final. Só com o pedido pronto, saído ou enviado (o que implica o
-- frete pago, quando existe) e sem disputa de pagamento aberta (G2).
create function deliver_reservation(p_reservation_id uuid, p_admin uuid, p_note text default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  r reservations;
  f fulfillments;
begin
  select * into v from lock_fulfillment(p_reservation_id, p_admin);
  r := v.r;
  f := v.f;
  if f.substatus not in ('PRONTO_PARA_RETIRADA', 'SAIU_PARA_ENTREGA', 'ENVIADO')
     or (f.mode <> 'RETIRADA' and not exists (select 1 from shipping_quotes where reservation_id = r.id and status = 'PAGO')) then
    raise exception 'O pedido ainda não está pronto, saído ou enviado (%)', f.substatus using errcode = 'TS174';
  end if;
  if has_open_dispute(r.id) then
    raise exception 'Há uma disputa de pagamento aberta' using errcode = 'TS173';
  end if;

  perform set_transition_context('T5', 'ADMIN', p_admin, nullif(btrim(p_note), ''));
  update reservations set status = 'ENTREGUE', delivered_at = app_now(), delivered_by = p_admin where id = r.id returning * into r;
  update fulfillments set closed_at = app_now(), updated_at = app_now() where reservation_id = r.id;
  perform enqueue_message('pedido_entregue:' || r.id, r.phone_e164, 'pedido_entregue', jsonb_build_object('numero', r.number),
                          2::smallint, app_now() + interval '1 day', r.id, p_optional => true);
  perform log_audit('ADMIN', p_admin, 'reserva.entregue', 'reservation', r.id::text, r.id);
  return jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'entregueEm', r.delivered_at);
end $$;

-- Pedidos pagos e em aberto, para a tela de frete e a operação (filtro por substatus).
create function admin_list_fulfillments(p_substatus fulfillment_substatus default null) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(fulfillment_json(f, true) || jsonb_build_object(
    'reserva', jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'nome', r.customer_name, 'telefone', r.phone_e164,
                                  'totalCentavos', r.total_cents, 'pagaEm', r.payment_confirmed_at),
    'disputaAberta', has_open_dispute(r.id))
    order by r.payment_confirmed_at), '[]')
  from fulfillments f join reservations r on r.id = f.reservation_id
  where r.status = 'PAGAMENTO_CONFIRMADO' and (p_substatus is null or f.substatus = p_substatus)
$$;
