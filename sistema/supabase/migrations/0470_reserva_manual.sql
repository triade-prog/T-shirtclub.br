-- 0470 · Reserva manual pelo painel (02/10, pedido da loja)
-- A equipe cadastra a reserva de quem pediu pelo WhatsApp, Instagram ou na loja, de dois jeitos:
--   LINK: nasce RESERVADO, como a do site; a cliente recebe a mensagem com o link e paga por PIX
--         ou cartão no prazo (reserva_manual_minutos). Telefone bloqueado não recebe.
-- Nos dois, valem os limites de peças do site (9 por reserva e 2 por modelo, como o banco já
-- exige em cada item).
--   Já paga fora do site (DINHEIRO, PIX_DIRETO na conta da loja, MAQUININHA): nasce paga (T1 e
--         T2 de uma vez, como a conversão de pagamento em análise), baixa o estoque, entra no
--         faturamento e segue para a entrega. Na retirada, já vai para a preparação.
-- O preço é o do site (o motor de preço roda na api-admin e o banco confere tudo de novo, como
-- em create_reservation), mais um desconto manual opcional, sempre com motivo. A reserva guarda
-- quem cadastrou e o canal; a cliente vê o desconto como "Desconto da loja", sem o motivo.

alter type payment_method add value if not exists 'DINHEIRO';
alter type payment_method add value if not exists 'PIX_DIRETO';
alter type payment_method add value if not exists 'MAQUININHA';

insert into app_settings (key, value, description) values
  ('reserva_manual_minutos', '60', 'Prazo para pagar a reserva manual pelo link (quem pediu fora do site costuma levar mais que os 15 min da loja)');

alter table reservations
  add column channel text not null default 'SITE' check (channel in ('SITE', 'PAINEL')),
  add column created_by uuid references admin_users (id),
  add column manual_discount_cents integer not null default 0 check (manual_discount_cents >= 0),
  add column manual_discount_reason text check (manual_discount_reason is null or length(btrim(manual_discount_reason)) between 3 and 200),
  add constraint reservations_desconto_manual check (manual_discount_cents = 0 or manual_discount_reason is not null),
  add constraint reservations_canal_painel check (channel = 'SITE' or created_by is not null);

create function admin_create_reservation(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modo text := p ->> 'pagamento';
  v_pago boolean;
  v_forma payment_method;
  v_telefone text := p ->> 'telefone';
  v_nome text := btrim(coalesce(p ->> 'nome', ''));
  v_entrega delivery_mode := (p ->> 'entrega')::delivery_mode;
  v_linhas jsonb := p -> 'linhas';
  v_aplicada jsonb := p -> 'aplicada';
  v_promo_desc integer := coalesce((p ->> 'descontoCentavos')::int, 0);
  v_manual integer := coalesce((p ->> 'descontoManualCentavos')::int, 0);
  v_motivo text := nullif(btrim(coalesce(p ->> 'motivoDesconto', '')), '');
  v_subtotal integer := (p ->> 'subtotalCentavos')::int;
  v_total integer := (p ->> 'totalCentavos')::int;
  v_customer uuid;
  v_ativa reservations;
  v_ids uuid[];
  v_var product_variants;
  v_faltando jsonb;
  v_linha jsonb;
  v_promo promotions;
  v_cupom coupons;
  v_pecas integer;
  r reservations;
begin
  perform admin_guard(p_admin);
  if v_modo not in ('LINK', 'DINHEIRO', 'PIX_DIRETO', 'MAQUININHA') or v_entrega is null
     or v_telefone is null or v_telefone !~ '^\+55[0-9]{10,11}$' or length(v_nome) not between 1 and 60
     or jsonb_typeof(v_linhas) <> 'array' or jsonb_array_length(v_linhas) = 0 then
    return jsonb_build_object('erro', 'VALIDATION_ERROR');
  end if;
  v_pago := v_modo <> 'LINK';
  v_forma := case when v_pago then v_modo::payment_method end;
  if v_manual < 0 or (v_manual > 0 and (v_motivo is null or length(v_motivo) not between 3 and 200)) then
    return jsonb_build_object('erro', 'VALIDATION_ERROR', 'detalhes', jsonb_build_object('campo', 'motivoDesconto'));
  end if;

  -- Contas da linha: o total é a tabela menos o desconto da promoção e a parte do desconto manual
  if exists (select 1 from jsonb_array_elements(v_linhas) x
              where (x ->> 'qtd')::int < 1
                 or coalesce((x ->> 'descontoPromoCentavos')::int, 0) < 0 or coalesce((x ->> 'descontoManualCentavos')::int, 0) < 0
                 or (x ->> 'descontoCentavos')::int <> coalesce((x ->> 'descontoPromoCentavos')::int, 0) + coalesce((x ->> 'descontoManualCentavos')::int, 0)
                 or (x ->> 'totalCentavos')::int <> (x ->> 'precoTabelaCentavos')::int * (x ->> 'qtd')::int - (x ->> 'descontoCentavos')::int
                 or (x ->> 'totalCentavos')::int < 0)
     or (select count(distinct x ->> 'varianteId') from jsonb_array_elements(v_linhas) x) <> jsonb_array_length(v_linhas)
     or v_subtotal <> (select sum((x ->> 'precoTabelaCentavos')::int * (x ->> 'qtd')::int) from jsonb_array_elements(v_linhas) x)
     or v_promo_desc <> (select sum(coalesce((x ->> 'descontoPromoCentavos')::int, 0)) from jsonb_array_elements(v_linhas) x)
     or v_manual <> (select sum(coalesce((x ->> 'descontoManualCentavos')::int, 0)) from jsonb_array_elements(v_linhas) x)
     or v_total <> v_subtotal - v_promo_desc - v_manual or v_total < 0 then
    return jsonb_build_object('erro', 'PRICE_CHANGED');
  end if;
  select sum((x ->> 'qtd')::int) into v_pecas from jsonb_array_elements(v_linhas) x;

  -- 1. Cliente (serializa pedidos do mesmo telefone)
  insert into customers (phone_e164, last_name_informed) values (v_telefone, v_nome)
  on conflict (phone_e164) do update set last_name_informed = excluded.last_name_informed
  returning id into v_customer;
  perform 1 from customers where id = v_customer for update;

  -- 2. Guardas: o bloqueio (3 reservas expiradas) vale para a reserva pelo link; a venda já paga
  --    é decisão da loja. Os limites de peças valem para as duas.
  if not v_pago and phone_is_blocked(v_telefone) then
    return jsonb_build_object('erro', 'PHONE_BLOCKED');
  end if;
  if v_pecas > setting_int('max_pecas') then
    return jsonb_build_object('erro', 'MAX_ITEMS', 'detalhes', jsonb_build_object('maxPecas', setting_int('max_pecas')));
  end if;
  if exists (select 1 from jsonb_array_elements(v_linhas) x group by x ->> 'produtoId' having sum((x ->> 'qtd')::int) > setting_int('max_por_produto')) then
    return jsonb_build_object('erro', 'MAX_PER_MODEL', 'detalhes', jsonb_build_object('maxPorProduto', setting_int('max_por_produto')));
  end if;
  -- Uma reserva aberta por telefone (também na venda paga: ela nasce RESERVADO por um instante)
  select * into v_ativa from reservations where customer_id = v_customer and status = 'RESERVADO';
  if found and not expire_if_overdue(v_ativa.id) then
    return jsonb_build_object('erro', 'ACTIVE_RESERVATION_EXISTS',
                              'detalhes', jsonb_build_object('numeroReserva', v_ativa.number, 'expiraEm', v_ativa.expires_at));
  end if;

  -- 3. Estoque: libera reservas vencidas destes tamanhos e trava as variantes em ordem
  select array_agg((x ->> 'varianteId')::uuid order by (x ->> 'varianteId')::uuid) into v_ids from jsonb_array_elements(v_linhas) x;
  perform expire_overdue_holding(v_ids);
  for v_var in select * from product_variants where id = any(v_ids) order by id for update loop
    null;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('produtoId', x ->> 'produtoId', 'varianteId', x ->> 'varianteId',
                                               'nome', pr.name || coalesce(' · ' || size_label(v.size), ''),
                                               'disponivel', coalesce(variant_available(v), 0))), '[]')
    into v_faltando
    from jsonb_array_elements(v_linhas) x
    left join product_variants v on v.id = (x ->> 'varianteId')::uuid and v.product_id = (x ->> 'produtoId')::uuid
    left join products pr on pr.id = v.product_id
   where v.id is null or not v.active or not product_visible(pr) or variant_available(v) < (x ->> 'qtd')::int;
  if jsonb_array_length(v_faltando) > 0 then
    return jsonb_build_object('erro', 'STOCK_UNAVAILABLE', 'detalhes', jsonb_build_object(
      'produtos', (select jsonb_agg(f ->> 'nome') from jsonb_array_elements(v_faltando) f where f ->> 'nome' is not null),
      'itens', (select jsonb_agg(f - 'nome') from jsonb_array_elements(v_faltando) f)));
  end if;

  -- 4. Preço: tabela atual, promoção vigente, orçamento e cupom (as mesmas conferências do site)
  if exists (select 1 from jsonb_array_elements(v_linhas) x join products pr on pr.id = (x ->> 'produtoId')::uuid
              where pr.price_cents <> (x ->> 'precoTabelaCentavos')::int) then
    return jsonb_build_object('erro', 'PRICE_CHANGED');
  end if;
  if jsonb_typeof(v_aplicada) = 'object' then
    select * into v_promo from promotions where id = (v_aplicada ->> 'promocaoId')::uuid for update;
    if not found or promotion_state(v_promo.starts_at, v_promo.ends_at, v_promo.ended_at) <> 'ATIVA'
       or (v_promo.budget_cents is not null and v_promo.budget_used_cents + v_promo_desc > v_promo.budget_cents) then
      return jsonb_build_object('erro', 'PRICE_CHANGED');
    end if;
    if v_promo.one_per_customer and exists (
         select 1 from reservation_discounts d join reservations rr on rr.id = d.reservation_id
          where d.promotion_id = v_promo.id and rr.customer_id = v_customer and rr.status <> 'EXPIRADO') then
      return jsonb_build_object('erro', 'PRICE_CHANGED');
    end if;
    if v_promo.type = 'CUPOM' then
      select * into v_cupom from coupons where promotion_id = v_promo.id for update;
      if v_cupom.used_quantity >= v_cupom.total_quantity
         or (select count(*) from coupon_uses u where u.coupon_id = v_cupom.promotion_id and u.phone_e164 = v_telefone
               and u.status in ('PRESO', 'USADO')) >= v_cupom.per_customer_limit
         or (select min(u.first_used_at) from coupon_uses u where u.coupon_id = v_cupom.promotion_id and u.phone_e164 = v_telefone
               and u.status in ('PRESO', 'USADO')) < app_now() - make_interval(days => v_cupom.validity_days) then
        return jsonb_build_object('erro', 'PRICE_CHANGED');
      end if;
    end if;
  elsif v_promo_desc > 0 then
    return jsonb_build_object('erro', 'PRICE_CHANGED');
  end if;

  -- 5. Reserva (T1 pela loja), itens e estoque
  perform set_transition_context('T1', 'ADMIN', p_admin, 'Reserva manual pelo painel');
  insert into reservations (access_key_hash, payment_method, coupon_code, customer_id, phone_e164, customer_name, status, delivery_intent,
                            subtotal_cents, discount_cents, total_cents, expires_at, channel, created_by,
                            manual_discount_cents, manual_discount_reason)
  values (p ->> 'chaveHash', v_forma, case when v_promo.type = 'CUPOM' then v_cupom.code end, v_customer, v_telefone, v_nome,
          'RESERVADO', v_entrega, v_subtotal, v_promo_desc + v_manual, v_total,
          app_now() + case when v_pago then interval '1 minute' else make_interval(mins => setting_int('reserva_manual_minutos')) end,
          'PAINEL', p_admin, v_manual, case when v_manual > 0 then v_motivo end)
  returning * into r;

  for v_linha in select x from jsonb_array_elements(v_linhas) x order by x ->> 'varianteId' loop
    insert into reservation_items (reservation_id, product_id, variant_id, size_snapshot, name_snapshot, qty, list_price_cents,
                                   discount_cents, total_cents, discounts)
    select r.id, pr.id, v.id, v.size, pr.name, (v_linha ->> 'qtd')::int, pr.price_cents, (v_linha ->> 'descontoCentavos')::int,
           (v_linha ->> 'totalCentavos')::int,
           (case when coalesce((v_linha ->> 'descontoPromoCentavos')::int, 0) > 0
                 then jsonb_build_array(jsonb_build_object('promocaoId', v_aplicada ->> 'promocaoId', 'valorCentavos', (v_linha ->> 'descontoPromoCentavos')::int))
                 else '[]'::jsonb end)
           || (case when coalesce((v_linha ->> 'descontoManualCentavos')::int, 0) > 0
                    then jsonb_build_array(jsonb_build_object('manual', true, 'valorCentavos', (v_linha ->> 'descontoManualCentavos')::int))
                    else '[]'::jsonb end)
      from product_variants v join products pr on pr.id = v.product_id
     where v.id = (v_linha ->> 'varianteId')::uuid;
    if not v_pago then
      update product_variants set qty_reserved = qty_reserved + (v_linha ->> 'qtd')::int where id = (v_linha ->> 'varianteId')::uuid;
      insert into stock_movements (product_id, variant_id, kind, qty, reservation_id, actor_type, actor_id)
      values ((v_linha ->> 'produtoId')::uuid, (v_linha ->> 'varianteId')::uuid, 'RESERVA', (v_linha ->> 'qtd')::int, r.id, 'ADMIN', p_admin);
    end if;
  end loop;

  if jsonb_typeof(v_aplicada) = 'object' and v_promo_desc > 0 then
    insert into reservation_discounts (reservation_id, promotion_id, type, amount_cents, detail)
    values (r.id, v_promo.id, v_promo.type, v_promo_desc, jsonb_build_object('rotulo', v_aplicada ->> 'rotulo'));
    if v_promo.budget_cents is not null then
      update promotions set budget_used_cents = budget_used_cents + v_promo_desc where id = v_promo.id;
    end if;
    if v_promo.type = 'CUPOM' then
      update coupons set used_quantity = used_quantity + 1 where promotion_id = v_cupom.promotion_id;
      insert into coupon_uses (coupon_id, phone_e164, reservation_id, status, first_used_at)
      values (v_cupom.promotion_id, v_telefone, r.id, case when v_pago then 'USADO' else 'PRESO' end::coupon_use_status,
              coalesce((select min(u.first_used_at) from coupon_uses u where u.coupon_id = v_cupom.promotion_id
                          and u.phone_e164 = v_telefone and u.status in ('PRESO', 'USADO')), app_now()));
    end if;
  end if;

  if v_pago then
    -- 6a. Paga fora do site: T2 na hora, venda no estoque e a entrega aberta
    perform set_transition_context('T2', 'ADMIN', p_admin, 'Pago fora do site');
    update reservations set status = 'PAGAMENTO_CONFIRMADO', payment_confirmed_at = app_now() where id = r.id returning * into r;
    for v_linha in select x from jsonb_array_elements(v_linhas) x order by x ->> 'varianteId' loop
      update product_variants set qty_sold = qty_sold + (v_linha ->> 'qtd')::int where id = (v_linha ->> 'varianteId')::uuid;
      insert into stock_movements (product_id, variant_id, kind, qty, reservation_id, actor_type, actor_id)
      values ((v_linha ->> 'produtoId')::uuid, (v_linha ->> 'varianteId')::uuid, 'VENDA', (v_linha ->> 'qtd')::int, r.id, 'ADMIN', p_admin);
    end loop;
    perform ensure_fulfillment(r);
    -- Retirada já combinada com a loja: vai direto para a preparação. Motoboy e envio precisam do
    -- endereço, que a cliente informa no site (como depois de pagar pelo link).
    if v_entrega = 'RETIRADA' then
      update fulfillments set substatus = 'EM_PREPARACAO', confirmed_at = app_now(), updated_at = app_now() where reservation_id = r.id;
    end if;
    perform enqueue_message('pagamento_confirmado:' || r.id, r.phone_e164, 'pagamento_confirmado',
                            jsonb_build_object('nome', split_part(r.customer_name, ' ', 1), 'numero', r.number, 'pecas', v_pecas,
                                               'totalCentavos', r.total_cents, 'forma', v_forma, 'retirada', v_entrega = 'RETIRADA'),
                            1::smallint, app_now() + interval '1 day', r.id);
  else
    -- 6b. Pelo link: a mesma mensagem da reserva do site, com o prazo da reserva manual
    perform enqueue_message('reserva_criada:' || r.id, r.phone_e164, 'reserva_criada',
                            jsonb_build_object('nome', split_part(r.customer_name, ' ', 1), 'pecas', v_pecas,
                                               'numero', r.number, 'totalCentavos', r.total_cents, 'expiraEm', r.expires_at,
                                               'link', p ->> 'link'),
                            1::smallint, r.expires_at, r.id, 'RESERVADO');
  end if;

  perform log_audit('ADMIN', p_admin, 'reserva.manual', 'reservation', r.id::text, r.id,
                    jsonb_strip_nulls(jsonb_build_object('numero', r.number, 'pagamento', v_modo, 'entrega', v_entrega, 'pecas', v_pecas,
                                                         'total_cents', r.total_cents, 'desconto_promocao_cents', nullif(v_promo_desc, 0),
                                                         'desconto_manual_cents', nullif(v_manual, 0), 'motivo_desconto', v_motivo)));
  return jsonb_build_object('reserva', reservation_json(r));
end $$;

-- A reserva mostra a forma de pagamento, o canal e o desconto manual como "Desconto da loja"
create or replace function reservation_json(r reservations) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'numero', r.number, 'status', r.status, 'motivoEncerramento', r.closure_reason,
    'entrega', r.delivery_intent, 'nome', r.customer_name, 'telefone', r.phone_e164,
    'subtotalCentavos', r.subtotal_cents, 'descontoCentavos', r.discount_cents, 'totalCentavos', r.total_cents,
    'cupom', r.coupon_code, 'criadaEm', r.created_at, 'expiraEm', r.expires_at, 'toleranciaAte', r.grace_until,
    'pagaEm', r.payment_confirmed_at, 'expiradaEm', r.expired_at, 'entregueEm', r.delivered_at,
    'forma', r.payment_method, 'canal', r.channel,
    'itens', (select jsonb_agg(jsonb_build_object('produtoId', i.product_id, 'varianteId', i.variant_id, 'nome', i.name_snapshot,
                                                  'tamanho', i.size_snapshot, 'rotuloTamanho', size_label(i.size_snapshot), 'qtd', i.qty,
                                                  'precoTabelaCentavos', i.list_price_cents, 'descontoCentavos', i.discount_cents,
                                                  'totalCentavos', i.total_cents,
                                                  'capa', (select image_json(pi) - 'id' - 'posicao' from product_images pi
                                                            where pi.product_id = i.product_id order by pi.position limit 1))
                               order by i.name_snapshot, i.size_snapshot)
                from reservation_items i where i.reservation_id = r.id),
    'descontos', coalesce((select jsonb_agg(jsonb_build_object('tipo', d.type, 'valorCentavos', d.amount_cents, 'rotulo', d.detail ->> 'rotulo'))
                             from reservation_discounts d where d.reservation_id = r.id), '[]')
                 || case when r.manual_discount_cents > 0
                         then jsonb_build_array(jsonb_build_object('tipo', 'MANUAL', 'valorCentavos', r.manual_discount_cents, 'rotulo', 'Desconto da loja'))
                         else '[]'::jsonb end,
    -- O pedido de cancelamento mais recente (a tela mostra "aguardando a loja" ou a decisão)
    'cancelamento', (select jsonb_strip_nulls(jsonb_build_object('status', c.status, 'solicitadoEm', c.requested_at,
                                                                 'decididoEm', c.decided_at, 'motivoDecisao', c.decision_reason))
                       from cancellation_requests c where c.reservation_id = r.id order by c.status = 'PENDENTE' desc, c.requested_at desc limit 1),
    -- Depois do pagamento: modalidade, endereço resumido, frete e código de retirada (F8)
    'logistica', (select fulfillment_json(f, false) from fulfillments f where f.reservation_id = r.id),
    'agora', app_now())
$$;

-- Painel: quem cadastrou a reserva manual e o motivo do desconto (a cliente não vê o motivo)
create or replace function admin_reservation_detail(p_id uuid) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select reservation_json(r) || jsonb_build_object(
    'logistica', (select fulfillment_json(f, true) from fulfillments f where f.reservation_id = r.id),
    'entregueEm', r.delivered_at, 'entreguePor', admin_name(r.delivered_by),
    'manual', case when r.channel = 'PAINEL' then jsonb_strip_nulls(jsonb_build_object(
                'criadaPor', admin_name(r.created_by), 'motivoDesconto', r.manual_discount_reason)) end,
    'transicoes', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'evento', t.event, 'de', t.from_status, 'para', t.to_status, 'ator', t.actor_type,
                     'atorNome', admin_name(t.actor_id), 'motivo', t.reason, 'em', t.created_at)) order by t.id), '[]')
                     from reservation_transitions t where t.reservation_id = r.id),
    'pagamentos', (select coalesce(jsonb_agg(payment_json(p) - 'pix' || jsonb_strip_nulls(jsonb_build_object(
                     'statusProvedor', p.provider_status, 'motivoAnalise', p.review_reason)) order by p.created_at), '[]')
                     from payments p where p.reservation_id = r.id),
    'cancelamentos', (select coalesce(jsonb_agg(cancellation_json(c) || jsonb_strip_nulls(jsonb_build_object('decididoPor', admin_name(c.decided_by)))
                        order by c.requested_at), '[]')
                        from cancellation_requests c where c.reservation_id = r.id),
    'analises', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', v.id, 'motivo', v.reason, 'status', v.status,
                   'resolucao', v.resolution, 'nota', v.note, 'criadaEm', v.created_at)) order by v.created_at), '[]')
                   from payment_reviews v where v.reservation_id = r.id),
    'disputas', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', d.id, 'tipo', d.kind, 'status', d.status,
                   'abertaEm', d.opened_at, 'nota', d.note)) order by d.opened_at), '[]')
                   from payment_disputes d where d.reservation_id = r.id),
    'cliente', jsonb_build_object(
      'bloqueado', phone_is_blocked(r.phone_e164),
      'reservas', (select count(*) from reservations x where x.customer_id = r.customer_id),
      'expiracoes30Dias', (select count(*) from reservations x where x.customer_id = r.customer_id and x.status = 'EXPIRADO'
                             and x.closure_reason = 'PRAZO_ESGOTADO' and x.expired_at > app_now() - interval '30 days')),
    'auditoria', (select coalesce(jsonb_agg(audit_json(a) order by a.occurred_at, a.id), '[]')
                    from (select * from audit_log where reservation_id = r.id order by occurred_at desc, id desc limit 100) a))
  from reservations r where r.id = p_id
$$;

call lock_down_public();
