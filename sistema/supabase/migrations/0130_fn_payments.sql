-- 0130 · Pagamento da reserva (seção 08, D3, D5, D6, G2, G3, R11)
-- register_payment_attempt → a api-public cria a cobrança no provedor com o id do pagamento
-- como chave de idempotência → payment_created. O resultado (resposta imediata do cartão,
-- webhook, reconciliação ou fim da tolerância) sempre passa por apply_payment_result, que
-- confere referência, moeda, conta e valor com a consulta ao provedor, nunca com o corpo do
-- webhook. Ordem de locks: reservations → payments → products → promotions/coupons.

create function payment_json(p payments) returns jsonb
language sql stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id, 'reservaId', p.reservation_id, 'forma', p.method, 'status', p.status, 'valorCentavos', p.amount_cents,
    'criadoEm', p.created_at, 'aprovadoEm', p.approved_at,
    'pix', case when p.method = 'PIX' and p.pix_qr is not null
                then jsonb_build_object('copiaECola', p.pix_qr, 'qrBase64', p.pix_qr_base64, 'expiraEm', p.pix_expires_at) end))
$$;

-- ─── Tentativa de pagamento ──────────────────────────────────────────────────────────

create function register_payment_attempt(p_reservation_id uuid, p_phone text, p_method payment_method, p_idempotency_key uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
  p payments;
begin
  select * into r from reservations where id = p_reservation_id and phone_e164 = p_phone for update;
  if not found then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;

  -- 1ª camada: o mesmo clique (Idempotency-Key) devolve a mesma tentativa
  select * into p from payments where idempotency_key = p_idempotency_key;
  if found then
    if p.reservation_id <> r.id then
      return jsonb_build_object('erro', 'VALIDATION_ERROR');
    end if;
    return jsonb_build_object('pagamento', payment_json(p), 'repetido', true);
  end if;

  if r.status <> 'RESERVADO' then
    return jsonb_build_object('erro', 'RESERVATION_NOT_ACTIVE');
  end if;
  -- Nova cobrança só dentro dos 15 min; na tolerância, só a que já estava em andamento (D5)
  if app_now() >= r.expires_at then
    return jsonb_build_object('erro', 'DEADLINE_PASSED');
  end if;
  if r.payment_method is not null and r.payment_method <> p_method then
    return jsonb_build_object('erro', 'METHOD_LOCKED', 'detalhes', jsonb_build_object('forma', r.payment_method));
  end if;
  select * into p from payments where reservation_id = r.id and purpose = 'PRODUTOS' and status in ('CRIADO', 'PENDENTE');
  if found then
    return jsonb_build_object('erro', 'PAYMENT_IN_PROGRESS', 'detalhes', jsonb_build_object('pagamentoId', p.id));
  end if;

  insert into payments (reservation_id, method, idempotency_key, amount_cents)
  values (r.id, p_method, p_idempotency_key, r.total_cents)
  returning * into p;
  update reservations set payment_method = p_method where id = r.id and payment_method is null;
  perform log_audit('CLIENTE', null, 'pagamento.tentativa', 'payment', p.id::text, r.id, jsonb_build_object('forma', p_method));
  return jsonb_build_object('pagamento', payment_json(p));
end $$;

-- Cobrança criada no provedor (o QR do PIX, ou a resposta do cartão).
create function payment_created(p_payment_id uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v payments;
begin
  update payments
     set provider_payment_id = p ->> 'providerPaymentId', provider_status = p ->> 'statusProvedor',
         status = case when status = 'CRIADO' then 'PENDENTE'::payment_status else status end,
         pix_qr = p ->> 'pixCopiaECola', pix_qr_base64 = p ->> 'pixQrBase64', pix_expires_at = (p ->> 'pixExpiraEm')::timestamptz
   where id = p_payment_id
  returning * into v;
  return payment_json(v);
end $$;

-- O provedor não criou a cobrança: a cliente pode tentar de novo (pela mesma forma).
create function payment_failed(p_payment_id uuid, p_error text) returns void
language sql
security definer
set search_path = public
as $$
  update payments set status = 'FALHOU', error = left(p_error, 500) where id = p_payment_id and status = 'CRIADO'
$$;

-- Pagamento em andamento que segura a reserva: PIX (ou cartão em processamento) criado
-- dentro dos 15 min (D5). É o que inicia a tolerância na varredura (0140).
create function has_pending_payment(p_reservation_id uuid) returns boolean
language sql stable
set search_path = public
as $$
  select exists (select 1 from payments p join reservations r on r.id = p.reservation_id
                  where p.reservation_id = p_reservation_id and p.purpose = 'PRODUTOS'
                    and p.status in ('CRIADO', 'PENDENTE') and p.created_at < r.expires_at)
$$;

create function has_open_dispute(p_reservation_id uuid) returns boolean
language sql stable
set search_path = public
as $$ select exists (select 1 from payment_disputes where reservation_id = p_reservation_id and status = 'ABERTA') $$;

-- ─── Resultado do provedor ───────────────────────────────────────────────────────────
-- p: status (APROVADO, PENDENTE, RECUSADO, CANCELADO, ESTORNADO, CONTESTADO), aprovadoEm,
-- valorCentavos, moeda, referencia (o id do nosso pagamento), conta, statusProvedor.

create function send_to_review(p_payment payments, p_reason review_reason, p_approved_at timestamptz) returns jsonb
language plpgsql
set search_path = public
as $$
declare r reservations;
begin
  select * into r from reservations where id = p_payment.reservation_id;
  update payments set status = 'EM_ANALISE', review_reason = p_reason, approved_at = p_approved_at where id = p_payment.id;
  insert into payment_reviews (payment_id, reservation_id, reason) values (p_payment.id, r.id, p_reason)
  on conflict (payment_id) where status = 'ABERTA' do nothing;
  perform enqueue_message('pagamento_em_analise:' || p_payment.id, r.phone_e164, 'pagamento_em_analise',
                          jsonb_build_object('numero', r.number), 2::smallint, app_now() + interval '1 day', p_optional => true);
  perform log_audit('PROVEDOR', null, 'pagamento.em_analise', 'payment', p_payment.id::text, r.id, jsonb_build_object('motivo', p_reason));
  return jsonb_build_object('resultado', 'EM_ANALISE', 'motivo', p_reason);
end $$;

create function apply_payment_result(p_payment_id uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva uuid;
  r reservations;
  pg payments;
  v_status text := p ->> 'status';
  v_aprovado timestamptz := coalesce((p ->> 'aprovadoEm')::timestamptz, app_now());
  v_conta text := setting('mp_collector_id') #>> '{}';
  v_item record;
begin
  select reservation_id into v_reserva from payments where id = p_payment_id;
  if v_reserva is null then
    return jsonb_build_object('resultado', 'NAO_ENCONTRADO');
  end if;
  select * into r from reservations where id = v_reserva for update;
  select * into pg from payments where id = p_payment_id for update;

  -- Conferências (G3): nunca aplica pagamento de outra referência, moeda ou conta
  if (p ->> 'referencia') is distinct from pg.id::text or upper(coalesce(p ->> 'moeda', '')) <> 'BRL'
     or (coalesce(v_conta, '') <> '' and (p ->> 'conta') is distinct from v_conta) then
    perform log_audit('SISTEMA', null, 'pagamento.descartado', 'payment', pg.id::text, r.id,
                      jsonb_build_object('referencia_confere', (p ->> 'referencia') is not distinct from pg.id::text,
                                         'moeda', p ->> 'moeda', 'conta_confere', (p ->> 'conta') is not distinct from v_conta));
    return jsonb_build_object('resultado', 'DESCARTADO');
  end if;

  update payments set provider_status = p ->> 'statusProvedor', last_checked_at = app_now() where id = pg.id;

  -- Já aplicado: estorno, contestação ou cancelamento abrem disputa (G2); o resto é no-op
  if pg.applied then
    if v_status in ('ESTORNADO', 'CONTESTADO', 'CANCELADO') then
      insert into payment_disputes (payment_id, reservation_id, kind, provider_status)
      values (pg.id, r.id, case v_status when 'ESTORNADO' then 'ESTORNO' when 'CONTESTADO' then 'CONTESTACAO' else 'CANCELAMENTO' end::dispute_kind,
              p ->> 'statusProvedor')
      on conflict (payment_id) where status = 'ABERTA' do nothing;
      perform log_audit('PROVEDOR', null, 'pagamento.disputa', 'payment', pg.id::text, r.id, jsonb_build_object('status', v_status));
      return jsonb_build_object('resultado', 'DISPUTA_ABERTA');
    end if;
    return jsonb_build_object('resultado', 'ALREADY_APPLIED');
  end if;

  if pg.status = 'EM_ANALISE' then
    if v_status = 'ESTORNADO' then
      update payments set status = 'ESTORNADO' where id = pg.id;
    end if;
    return jsonb_build_object('resultado', 'EM_ANALISE');
  end if;

  if v_status <> 'APROVADO' then
    if v_status in ('RECUSADO', 'CANCELADO', 'ESTORNADO') and pg.status in ('CRIADO', 'PENDENTE') then
      update payments set status = v_status::payment_status where id = pg.id;
      perform log_audit('PROVEDOR', null, 'pagamento.' || lower(v_status), 'payment', pg.id::text, r.id);
    elsif v_status = 'PENDENTE' and pg.status = 'CRIADO' then
      update payments set status = 'PENDENTE' where id = pg.id;
    end if;
    return jsonb_build_object('resultado', 'ATUALIZADO', 'status', (select status from payments where id = pg.id));
  end if;

  -- Aprovado: só confirma se tudo confere e dentro do prazo efetivo
  if (p ->> 'valorCentavos')::int is distinct from pg.amount_cents then
    return send_to_review(pg, 'VALOR_DIVERGENTE', v_aprovado);
  end if;
  if r.status <> 'RESERVADO' then
    return send_to_review(pg, 'RESERVA_ENCERRADA', v_aprovado);
  end if;
  if v_aprovado > effective_deadline(r) then
    perform expire_reservation(r.id, 'PRAZO_ESGOTADO', 'PROVEDOR');
    return send_to_review(pg, 'APROVADO_APOS_TOLERANCIA', v_aprovado);
  end if;

  -- T2: reservado vira vendido, uma única vez
  perform set_transition_context('T2', 'PROVEDOR');
  update reservations set status = 'PAGAMENTO_CONFIRMADO', payment_confirmed_at = app_now() where id = r.id;
  update payments set status = 'APROVADO', applied = true, approved_at = v_aprovado where id = pg.id;
  for v_item in select product_id, qty from reservation_items where reservation_id = r.id order by product_id loop
    update products set qty_reserved = qty_reserved - v_item.qty, qty_sold = qty_sold + v_item.qty where id = v_item.product_id;
    insert into stock_movements (product_id, kind, qty, reservation_id, actor_type)
    values (v_item.product_id, 'VENDA', v_item.qty, r.id, 'PROVEDOR');
  end loop;
  update coupon_uses set status = 'USADO' where reservation_id = r.id and status = 'PRESO';
  update cancellation_requests set status = 'PREJUDICADA', decided_at = app_now() where reservation_id = r.id and status = 'PENDENTE';
  perform enqueue_message('pagamento_confirmado:' || r.id, r.phone_e164, 'pagamento_confirmado',
                          jsonb_build_object('nome', split_part(r.customer_name, ' ', 1), 'numero', r.number,
                                             'totalCentavos', r.total_cents, 'forma', pg.method),
                          1::smallint, app_now() + interval '1 day', r.id);
  perform log_audit('PROVEDOR', null, 'pagamento.confirmado', 'payment', pg.id::text, r.id,
                    jsonb_build_object('forma', pg.method, 'valor_cents', pg.amount_cents));
  return jsonb_build_object('resultado', 'CONFIRMADO');
end $$;

-- ─── O que o worker precisa resolver com o provedor ──────────────────────────────────

create function payments_to_check() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tolerancias jsonb;
  v_reconciliar jsonb;
  v_cancelar jsonb;
  v_eventos jsonb;
begin
  -- Fim da tolerância com pagamento ainda pendente: consultar, e cancelar se não aprovou
  select coalesce(jsonb_agg(jsonb_build_object('reservaId', r.id, 'pagamentos',
           (select jsonb_agg(jsonb_build_object('id', p.id, 'providerPaymentId', p.provider_payment_id))
              from payments p where p.reservation_id = r.id and p.status in ('CRIADO', 'PENDENTE')))), '[]')
    into v_tolerancias
    from reservations r
   where r.status = 'RESERVADO' and r.grace_until <= app_now() and has_pending_payment(r.id);

  -- Pagamento pendente de reserva que já saiu de RESERVADO: cancelar a cobrança
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'providerPaymentId', p.provider_payment_id)), '[]')
    into v_cancelar
    from payments p join reservations r on r.id = p.reservation_id
   where p.status = 'PENDENTE' and p.provider_payment_id is not null and r.status <> 'RESERVADO'
     and (p.last_checked_at is null or p.last_checked_at < app_now() - interval '1 minute');

  -- Pendente há mais de 2 min sem notícia do webhook: consultar (reconciliação)
  with escolhidos as (
    select p.id from payments p
     where p.status = 'PENDENTE' and p.provider_payment_id is not null and p.created_at < app_now() - interval '2 minutes'
       and (p.last_checked_at is null or p.last_checked_at < app_now() - interval '1 minute')
     order by p.created_at limit 50
     for update skip locked
  ), marcados as (
    update payments p set last_checked_at = app_now() from escolhidos e where p.id = e.id
    returning p.id, p.provider_payment_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'providerPaymentId', provider_payment_id)), '[]') into v_reconciliar from marcados;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'ref', e.payment_ref) order by e.received_at), '[]')
    into v_eventos
    from (select * from payment_events where processed_at is null and payment_ref is not null order by received_at limit 50) e;

  return jsonb_build_object('tolerancias', v_tolerancias, 'cancelar', v_cancelar, 'reconciliar', v_reconciliar, 'eventos', v_eventos);
end $$;

create function has_payment_work() returns boolean
language sql stable
set search_path = public
as $$
  select exists (select 1 from reservations r where r.status = 'RESERVADO' and r.grace_until <= app_now() and has_pending_payment(r.id))
      or exists (select 1 from payments p where p.status = 'PENDENTE' and p.provider_payment_id is not null
                   and p.created_at < app_now() - interval '2 minutes'
                   and (p.last_checked_at is null or p.last_checked_at < app_now() - interval '1 minute'))
      or exists (select 1 from payment_events where processed_at is null and payment_ref is not null)
$$;

-- ─── Webhook: inbox ──────────────────────────────────────────────────────────────────

-- Grava o evento (já com a assinatura conferida) e devolve o id, ou null se é reenvio.
create function payment_event_register(p_provider text, p_event_id text, p_ref text, p_payload jsonb) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  insert into payment_events (provider, provider_event_id, payment_ref, payload, signature_ok)
  values (p_provider, p_event_id, p_ref, p_payload, true)
  on conflict (provider, provider_event_id) do nothing
  returning id into v_id;
  return v_id;
end $$;

create function payment_event_done(p_id bigint, p_error text default null) returns void
language sql
security definer
set search_path = public
as $$
  update payment_events
     set processed_at = case when p_error is null then app_now() else processed_at end, error = left(p_error, 500)
   where id = p_id
$$;

-- ─── Loja ────────────────────────────────────────────────────────────────────────────

create function payment_for_customer(p_reservation_id uuid, p_payment_id uuid, p_phone text) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select payment_json(p) || jsonb_build_object('reservaStatus', r.status)
    from payments p join reservations r on r.id = p.reservation_id
   where p.id = p_payment_id and r.id = p_reservation_id and r.phone_e164 = p_phone
$$;

-- ─── Painel: análise (D6) e disputas (G2) ────────────────────────────────────────────

create function admin_list_payment_reviews(p_status review_status default 'ABERTA') returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'motivo', v.reason, 'status', v.status, 'resolucao', v.resolution, 'nota', v.note, 'criadaEm', v.created_at,
    'novaReservaId', v.new_reservation_id,
    'pagamento', payment_json(p) - 'pix',
    'reserva', jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'nome', r.customer_name, 'telefone', r.phone_e164,
                                  'totalCentavos', r.total_cents, 'expiraEm', r.expires_at, 'expiradaEm', r.expired_at))
    order by v.created_at), '[]')
  from payment_reviews v join payments p on p.id = v.payment_id join reservations r on r.id = v.reservation_id
  where p_status is null or v.status = p_status
$$;

-- O que a api-admin precisa para estornar no provedor.
create function review_payment_ref(p_review_id uuid) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object('reviewId', v.id, 'status', v.status, 'pagamentoId', p.id, 'providerPaymentId', p.provider_payment_id)
    from payment_reviews v join payments p on p.id = v.payment_id where v.id = p_review_id
$$;

-- Estornado no provedor pela api-admin: registra e fecha a análise.
create function review_refunded(p_review_id uuid, p_admin uuid, p_note text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v payment_reviews;
begin
  perform admin_guard(p_admin);
  select * into v from payment_reviews where id = p_review_id for update;
  if not found then raise exception 'Análise não encontrada' using errcode = 'TS130'; end if;
  if v.status <> 'ABERTA' then raise exception 'Análise já resolvida' using errcode = 'TS161'; end if;
  update payments set status = 'ESTORNADO' where id = v.payment_id;
  update payment_reviews set status = 'RESOLVIDA', resolution = 'ESTORNAR', decided_by = p_admin, decided_at = app_now(),
                             note = nullif(btrim(p_note), '') where id = v.id;
  perform log_audit('ADMIN', p_admin, 'pagamento.estornado', 'payment', v.payment_id::text, v.reservation_id);
end $$;

-- Converter em novo pedido: se as peças ainda estão disponíveis, nasce uma reserva nova já
-- paga com este pagamento (T1 e T2 na mesma transação). Sem estoque, a loja estorna.
create function review_convert(p_review_id uuid, p_admin uuid, p_note text, p_key_hash text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v payment_reviews;
  pg payments;
  velha reservations;
  nova reservations;
  v_item record;
  v_faltando jsonb;
begin
  perform admin_guard(p_admin);
  select * into v from payment_reviews where id = p_review_id for update;
  if not found then raise exception 'Análise não encontrada' using errcode = 'TS130'; end if;
  if v.status <> 'ABERTA' then raise exception 'Análise já resolvida' using errcode = 'TS161'; end if;
  select * into velha from reservations where id = v.reservation_id;
  if velha.status = 'RESERVADO' or exists (select 1 from reservations where customer_id = velha.customer_id and status = 'RESERVADO') then
    raise exception 'A cliente tem uma reserva ativa' using errcode = 'TS162';
  end if;
  select * into pg from payments where id = v.payment_id for update;

  perform 1 from products where id in (select product_id from reservation_items where reservation_id = velha.id) order by id for update;
  select jsonb_agg(i.name_snapshot) into v_faltando
    from reservation_items i join products p on p.id = i.product_id
   where i.reservation_id = velha.id and p.qty_total - p.qty_reserved - p.qty_sold < i.qty;
  if v_faltando is not null then
    raise exception 'Sem estoque para: %', v_faltando using errcode = 'TS163';
  end if;

  perform set_transition_context('T1', 'ADMIN', p_admin, 'Convertido de pagamento em análise');
  insert into reservations (access_key_hash, payment_method, coupon_code, customer_id, phone_e164, customer_name, status,
                            delivery_intent, subtotal_cents, discount_cents, total_cents, expires_at)
  values (p_key_hash, pg.method, velha.coupon_code, velha.customer_id, velha.phone_e164, velha.customer_name, 'RESERVADO',
          velha.delivery_intent, velha.subtotal_cents, velha.discount_cents, velha.total_cents, app_now() + interval '1 minute')
  returning * into nova;
  insert into reservation_items (reservation_id, product_id, name_snapshot, qty, list_price_cents, discount_cents, total_cents, discounts)
  select nova.id, product_id, name_snapshot, qty, list_price_cents, discount_cents, total_cents, discounts
    from reservation_items where reservation_id = velha.id;

  perform set_transition_context('T2', 'ADMIN', p_admin, 'Convertido de pagamento em análise');
  update reservations set status = 'PAGAMENTO_CONFIRMADO', payment_confirmed_at = app_now() where id = nova.id;
  update payments set reservation_id = nova.id, status = 'APROVADO', applied = true, review_reason = null where id = pg.id;
  for v_item in select product_id, qty from reservation_items where reservation_id = nova.id order by product_id loop
    update products set qty_sold = qty_sold + v_item.qty where id = v_item.product_id;
    insert into stock_movements (product_id, kind, qty, reservation_id, actor_type, actor_id)
    values (v_item.product_id, 'VENDA', v_item.qty, nova.id, 'ADMIN', p_admin);
  end loop;
  update payment_reviews set status = 'RESOLVIDA', resolution = 'CONVERTER_EM_PEDIDO', new_reservation_id = nova.id,
                             decided_by = p_admin, decided_at = app_now(), note = nullif(btrim(p_note), '') where id = v.id;
  perform enqueue_message('pagamento_confirmado:' || nova.id, nova.phone_e164, 'pagamento_confirmado',
                          jsonb_build_object('nome', split_part(nova.customer_name, ' ', 1), 'numero', nova.number,
                                             'totalCentavos', nova.total_cents, 'forma', pg.method),
                          1::smallint, app_now() + interval '1 day', nova.id);
  perform log_audit('ADMIN', p_admin, 'pagamento.convertido', 'payment', pg.id::text, nova.id,
                    jsonb_build_object('reserva_anterior', velha.number, 'reserva_nova', nova.number));
  return reservation_json(nova) || jsonb_build_object('status', 'PAGAMENTO_CONFIRMADO');
end $$;

create function admin_list_payment_disputes(p_status review_status default 'ABERTA') returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'tipo', d.kind, 'status', d.status, 'statusProvedor', d.provider_status, 'abertaEm', d.opened_at,
    'resolvidaEm', d.resolved_at, 'nota', d.note, 'pagamento', payment_json(p) - 'pix',
    'reserva', jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'nome', r.customer_name, 'telefone', r.phone_e164))
    order by d.opened_at), '[]')
  from payment_disputes d join payments p on p.id = d.payment_id join reservations r on r.id = d.reservation_id
  where p_status is null or d.status = p_status
$$;

create function resolve_dispute(p_dispute_id uuid, p_admin uuid, p_note text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare d payment_disputes;
begin
  perform admin_guard(p_admin);
  if length(btrim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'A resolução precisa de uma observação' using errcode = 'TS121';
  end if;
  select * into d from payment_disputes where id = p_dispute_id for update;
  if not found then raise exception 'Disputa não encontrada' using errcode = 'TS130'; end if;
  if d.status <> 'ABERTA' then raise exception 'Disputa já resolvida' using errcode = 'TS161'; end if;
  update payment_disputes set status = 'RESOLVIDA', resolved_at = app_now(), resolved_by = p_admin, note = btrim(p_note) where id = d.id;
  perform log_audit('ADMIN', p_admin, 'pagamento.disputa_resolvida', 'payment', d.payment_id::text, d.reservation_id);
end $$;
