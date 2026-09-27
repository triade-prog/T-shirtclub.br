-- 0330 · Dados para os textos novos do WhatsApp (27/09)
-- As mensagens de reserva usam o primeiro nome e o número de peças (lembrete, pagamento
-- confirmado, pedido entregue). Em vez de mudar cada função que enfileira, o enqueue
-- completa o que faltar a partir da reserva. A reserva criada com 1 peça a menos que um
-- "compre mais" por grupo ativo para todos os produtos (ex.: 2 de "3 por R$ 119,99") leva
-- a oferta; e o pagamento em análise diz quando o valor veio diferente do total.

create or replace function enqueue_message(
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
declare
  v_id uuid;
  v_params jsonb := coalesce(p_params, '{}');
  v_pecas integer;
  v_grupo record;
begin
  if p_optional and (setting('notificacoes_opcionais') = 'false'::jsonb or setting('notificacoes_desligadas') ? p_template) then
    return null;
  end if;

  if p_reservation_id is not null then
    if not v_params ? 'nome' then
      v_params := v_params || coalesce((select jsonb_build_object('nome', split_part(btrim(customer_name), ' ', 1))
                                          from reservations where id = p_reservation_id), '{}');
    end if;
    if not v_params ? 'pecas' then
      select sum(qty) into v_pecas from reservation_items where reservation_id = p_reservation_id;
      if v_pecas is not null then
        v_params := v_params || jsonb_build_object('pecas', v_pecas);
      end if;
    end if;
  end if;

  if p_template = 'reserva_criada' and jsonb_typeof(v_params -> 'pecas') = 'number' and (v_params ->> 'pecas')::int >= 2 then
    select group_qty, group_price_cents into v_grupo
      from promotions
     where type = 'COMPRE_MAIS' and buy_more_mode = 'PRECO_POR_GRUPO' and scope = 'TODOS'
       and promotion_state(starts_at, ends_at, ended_at) = 'ATIVA'
       and (budget_cents is null or budget_used_cents < budget_cents)
       and group_qty = (v_params ->> 'pecas')::int + 1
     order by group_price_cents
     limit 1;
    if found then
      v_params := v_params || jsonb_build_object('grupo', jsonb_build_object('qtd', v_grupo.group_qty, 'precoCentavos', v_grupo.group_price_cents));
    end if;
  end if;

  insert into outbox_messages (dedupe_key, phone_e164, template, params, priority, valid_until, reservation_id, requires_status)
  values (p_dedupe_key, p_phone, p_template, v_params, p_priority, p_valid_until, p_reservation_id, p_requires_status)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

create or replace function send_to_review(p_payment payments, p_reason review_reason, p_approved_at timestamptz) returns jsonb
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
                          jsonb_build_object('numero', r.number, 'frete', p_payment.purpose = 'FRETE', 'valorDivergente', p_reason = 'VALOR_DIVERGENTE'),
                          2::smallint, app_now() + interval '1 day', p_optional => true);
  perform log_audit('PROVEDOR', null, 'pagamento.em_analise', 'payment', p_payment.id::text, r.id, jsonb_build_object('motivo', p_reason));
  return jsonb_build_object('resultado', 'EM_ANALISE', 'motivo', p_reason);
end $$;

call lock_down_public();
