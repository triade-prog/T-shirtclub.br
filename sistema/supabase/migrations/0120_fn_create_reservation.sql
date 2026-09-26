-- 0120 · Criação atômica da reserva (seção 05)
-- Com 1 unidade e N clientes confirmando ao mesmo tempo, exatamente 1 vence; as outras
-- recebem STOCK_UNAVAILABLE com a lista de itens. Não existe reserva parcial.
-- Ordem global de locks: customers → reservations → products (por id) → promotions/coupons.
-- O motor de preço (TypeScript) calcula as linhas; aqui se confere o que depende de
-- concorrência: estoque, preço de tabela, vigência, orçamento e limites do cupom.
-- Resultados de negócio voltam em JSON; nada é gravado nesses casos além da situação da
-- tentativa.

-- O que a Edge Function precisa para calcular o preço da tentativa.
create function attempt_for_confirm(p_attempt_id uuid, p_token_hash text) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', a.id, 'ref', a.ref, 'status', a.status, 'verificadaAte', a.verified_until,
                            'telefone', a.phone_e164, 'nome', a.customer_name, 'itens', a.items, 'cupom', a.coupon_code,
                            'totalEsperadoCentavos', a.expected_total_cents, 'reservaId', a.reservation_id)
    from reservation_attempts a
   where a.id = p_attempt_id and a.browser_token_hash = p_token_hash and a.status <> 'ABANDONADA'
$$;

-- Histórico da cliente que o motor de preço usa: usos do cupom e promoções "uma por cliente".
create function pricing_customer(p_phone text, p_coupon text default null) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usosDoCupom', (select count(*) from coupon_uses u join coupons c on c.promotion_id = u.coupon_id
                     where u.phone_e164 = p_phone and c.code = upper(btrim(p_coupon)) and u.status in ('PRESO', 'USADO')),
    'primeiroUsoDoCupom', (select min(u.first_used_at) from coupon_uses u join coupons c on c.promotion_id = u.coupon_id
                            where u.phone_e164 = p_phone and c.code = upper(btrim(p_coupon)) and u.status in ('PRESO', 'USADO')),
    'promocoesUsadas', coalesce((select jsonb_agg(distinct d.promotion_id)
                                   from reservation_discounts d join reservations r on r.id = d.reservation_id
                                   join promotions pr on pr.id = d.promotion_id
                                  where r.phone_e164 = p_phone and pr.one_per_customer
                                    and (r.status <> 'EXPIRADO')), '[]'))
$$;

-- Troca de itens depois de STOCK_UNAVAILABLE ou PRICE_CHANGED, sem outro código (R8).
create function attempt_update_items(p_attempt_id uuid, p_token_hash text, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a reservation_attempts;
begin
  select * into a from reservation_attempts where id = p_attempt_id and browser_token_hash = p_token_hash for update;
  if not found or a.status in ('ABANDONADA', 'CONVERTIDA') then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;
  if a.status not in ('VERIFICADA', 'FALHOU_ESTOQUE') or a.verified_until <= app_now() then
    return jsonb_build_object('erro', 'ATTEMPT_NOT_VERIFIED');
  end if;
  update reservation_attempts
     set items = p -> 'itens', expected_total_cents = (p ->> 'totalEsperadoCentavos')::int,
         coupon_code = nullif(p ->> 'cupom', ''), status = 'VERIFICADA'
   where id = a.id;
  return jsonb_build_object('ok', true, 'verificadaAte', a.verified_until);
end $$;

create function reservation_json(r reservations) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'numero', r.number, 'status', r.status, 'motivoEncerramento', r.closure_reason,
    'entrega', r.delivery_intent, 'nome', r.customer_name, 'telefone', r.phone_e164,
    'subtotalCentavos', r.subtotal_cents, 'descontoCentavos', r.discount_cents, 'totalCentavos', r.total_cents,
    'cupom', r.coupon_code, 'criadaEm', r.created_at, 'expiraEm', r.expires_at, 'toleranciaAte', r.grace_until,
    'pagaEm', r.payment_confirmed_at, 'expiradaEm', r.expired_at, 'entregueEm', r.delivered_at,
    'itens', (select jsonb_agg(jsonb_build_object('produtoId', i.product_id, 'nome', i.name_snapshot, 'qtd', i.qty,
                                                  'precoTabelaCentavos', i.list_price_cents, 'descontoCentavos', i.discount_cents,
                                                  'totalCentavos', i.total_cents,
                                                  'capa', (select image_json(pi) - 'id' - 'posicao' from product_images pi
                                                            where pi.product_id = i.product_id order by pi.position limit 1))
                               order by i.name_snapshot)
                from reservation_items i where i.reservation_id = r.id),
    'descontos', coalesce((select jsonb_agg(jsonb_build_object('tipo', d.type, 'valorCentavos', d.amount_cents, 'rotulo', d.detail ->> 'rotulo'))
                             from reservation_discounts d where d.reservation_id = r.id), '[]'),
    -- O pedido de cancelamento mais recente (a tela mostra "aguardando a loja" ou a decisão)
    'cancelamento', (select jsonb_strip_nulls(jsonb_build_object('status', c.status, 'solicitadoEm', c.requested_at,
                                                                 'decididoEm', c.decided_at, 'motivoDecisao', c.decision_reason))
                       from cancellation_requests c where c.reservation_id = r.id order by c.status = 'PENDENTE' desc, c.requested_at desc limit 1),
    'agora', app_now())
$$;

create function create_reservation(p_attempt_id uuid, p_token_hash text, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a reservation_attempts;
  v_customer uuid;
  v_ativa reservations;
  v_linhas jsonb := p -> 'linhas';
  v_ids uuid[];
  v_prod products;
  v_faltando jsonb := '[]';
  v_linha jsonb;
  v_aplicada jsonb := p -> 'aplicada';
  v_promo promotions;
  v_cupom coupons;
  v_desconto integer := (p ->> 'descontoCentavos')::int;
  r reservations;
begin
  -- 0. Tentativa: idempotente (duplo clique devolve a mesma reserva) e verificada (R8)
  select * into a from reservation_attempts where id = p_attempt_id and browser_token_hash = p_token_hash for update;
  if not found or a.status = 'ABANDONADA' then
    return jsonb_build_object('erro', 'NOT_FOUND');
  end if;
  if a.status = 'CONVERTIDA' then
    select * into r from reservations where id = a.reservation_id;
    return jsonb_build_object('reserva', reservation_json(r), 'repetida', true);
  end if;
  if a.status not in ('VERIFICADA', 'FALHOU_ESTOQUE') or a.verified_until <= app_now() then
    return jsonb_build_object('erro', 'ATTEMPT_NOT_VERIFIED');
  end if;

  -- As linhas precisam ser exatamente os itens da tentativa.
  if (select jsonb_agg(jsonb_build_object('p', x ->> 'produtoId', 'q', (x ->> 'qtd')::int) order by x ->> 'produtoId') from jsonb_array_elements(v_linhas) x)
     is distinct from
     (select jsonb_agg(jsonb_build_object('p', x ->> 'produtoId', 'q', (x ->> 'qtd')::int) order by x ->> 'produtoId') from jsonb_array_elements(a.items) x) then
    raise exception 'Linhas diferentes dos itens da tentativa' using errcode = 'TS150';
  end if;

  -- 1. Serializa pedidos do mesmo telefone (duas abas, duplo clique)
  insert into customers (phone_e164, last_name_informed) values (a.phone_e164, a.customer_name)
  on conflict (phone_e164) do update set last_name_informed = excluded.last_name_informed
  returning id into v_customer;
  perform 1 from customers where id = v_customer for update;

  -- 2. Guardas
  if phone_is_blocked(a.phone_e164) then
    return jsonb_build_object('erro', 'PHONE_BLOCKED');
  end if;
  -- Reserva vencida (sem pagamento em andamento) não conta como ativa: expira aqui mesmo.
  select * into v_ativa from reservations where customer_id = v_customer and status = 'RESERVADO';
  if found and not expire_if_overdue(v_ativa.id) then
    return jsonb_build_object('erro', 'ACTIVE_RESERVATION_EXISTS',
                              'detalhes', jsonb_build_object('numeroReserva', v_ativa.number, 'expiraEm', v_ativa.expires_at));
  end if;
  if (select sum((x ->> 'qtd')::int) from jsonb_array_elements(v_linhas) x) > setting_int('max_pecas') then
    return jsonb_build_object('erro', 'MAX_ITEMS', 'detalhes', jsonb_build_object('maxPecas', setting_int('max_pecas')));
  end if;
  if exists (select 1 from jsonb_array_elements(v_linhas) x where (x ->> 'qtd')::int > setting_int('max_por_produto')) then
    return jsonb_build_object('erro', 'MAX_PER_MODEL', 'detalhes', jsonb_build_object('maxPorProduto', setting_int('max_por_produto')));
  end if;

  -- 3. Libera as reservas vencidas que ainda seguram estes produtos (o estoque não espera a
  --    próxima varredura) e trava os produtos sempre em ordem crescente de id (sem deadlock)
  select array_agg((x ->> 'produtoId')::uuid order by (x ->> 'produtoId')::uuid) into v_ids from jsonb_array_elements(v_linhas) x;
  perform expire_overdue_holding(v_ids);
  for v_prod in select * from products where id = any(v_ids) order by id for update loop
    null;
  end loop;

  -- 4. Confere todos; se algum faltar, nada é reservado
  select coalesce(jsonb_agg(jsonb_build_object('produtoId', x ->> 'produtoId', 'nome', pr.name,
                                               'disponivel', greatest(coalesce(pr.qty_total - pr.qty_reserved - pr.qty_sold, 0), 0))), '[]')
    into v_faltando
    from jsonb_array_elements(v_linhas) x
    left join products pr on pr.id = (x ->> 'produtoId')::uuid
   where pr.id is null or not product_visible(pr) or pr.qty_total - pr.qty_reserved - pr.qty_sold < (x ->> 'qtd')::int;
  if jsonb_array_length(v_faltando) > 0 then
    update reservation_attempts set status = 'FALHOU_ESTOQUE' where id = a.id;
    return jsonb_build_object('erro', 'STOCK_UNAVAILABLE', 'detalhes', jsonb_build_object(
      'produtos', (select jsonb_agg(f ->> 'nome') from jsonb_array_elements(v_faltando) f where f ->> 'nome' is not null),
      'itens', (select jsonb_agg(f - 'nome') from jsonb_array_elements(v_faltando) f)));
  end if;

  -- 5. Preço: tabela atual, promoção ainda vigente, orçamento e cupom (travados depois dos produtos)
  if exists (select 1 from jsonb_array_elements(v_linhas) x join products pr on pr.id = (x ->> 'produtoId')::uuid
              where pr.price_cents <> (x ->> 'precoTabelaCentavos')::int) then
    return jsonb_build_object('erro', 'PRICE_CHANGED');
  end if;
  if jsonb_typeof(v_aplicada) = 'object' then
    select * into v_promo from promotions where id = (v_aplicada ->> 'promocaoId')::uuid for update;
    if not found or promotion_state(v_promo.starts_at, v_promo.ends_at, v_promo.ended_at) <> 'ATIVA'
       or (v_promo.budget_cents is not null and v_promo.budget_used_cents + v_desconto > v_promo.budget_cents) then
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
         or (select count(*) from coupon_uses u where u.coupon_id = v_cupom.promotion_id and u.phone_e164 = a.phone_e164
               and u.status in ('PRESO', 'USADO')) >= v_cupom.per_customer_limit
         or (select min(u.first_used_at) from coupon_uses u where u.coupon_id = v_cupom.promotion_id and u.phone_e164 = a.phone_e164
               and u.status in ('PRESO', 'USADO')) < app_now() - make_interval(days => v_cupom.validity_days) then
        return jsonb_build_object('erro', 'PRICE_CHANGED');
      end if;
    end if;
  end if;
  if (p ->> 'totalCentavos')::int <> a.expected_total_cents then
    return jsonb_build_object('erro', 'PRICE_CHANGED', 'detalhes', jsonb_build_object('totalCentavos', (p ->> 'totalCentavos')::int));
  end if;

  -- 6 e 7. Reserva, itens, estoque, descontos, cupom, mensagem, auditoria
  perform set_transition_context('T1', 'CLIENTE');
  insert into reservations (access_key_hash, coupon_code, customer_id, phone_e164, customer_name, status, delivery_intent,
                            subtotal_cents, discount_cents, total_cents, expires_at, attempt_id)
  values (p ->> 'chaveHash', case when v_promo.type = 'CUPOM' then v_cupom.code end, v_customer, a.phone_e164, a.customer_name,
          'RESERVADO', a.delivery_intent, (p ->> 'subtotalCentavos')::int, v_desconto, (p ->> 'totalCentavos')::int,
          app_now() + make_interval(mins => setting_int('reserva_minutos')), a.id)
  returning * into r;

  for v_linha in select * from jsonb_array_elements(v_linhas) loop
    insert into reservation_items (reservation_id, product_id, name_snapshot, qty, list_price_cents, discount_cents, total_cents, discounts)
    select r.id, pr.id, pr.name, (v_linha ->> 'qtd')::int, pr.price_cents, (v_linha ->> 'descontoCentavos')::int,
           (v_linha ->> 'totalCentavos')::int,
           case when (v_linha ->> 'descontoCentavos')::int > 0 and jsonb_typeof(v_aplicada) = 'object'
                then jsonb_build_array(jsonb_build_object('promocaoId', v_aplicada ->> 'promocaoId', 'valorCentavos', (v_linha ->> 'descontoCentavos')::int))
                else '[]'::jsonb end
      from products pr where pr.id = (v_linha ->> 'produtoId')::uuid;
    update products set qty_reserved = qty_reserved + (v_linha ->> 'qtd')::int where id = (v_linha ->> 'produtoId')::uuid;
    insert into stock_movements (product_id, kind, qty, reservation_id, actor_type)
    values ((v_linha ->> 'produtoId')::uuid, 'RESERVA', (v_linha ->> 'qtd')::int, r.id, 'CLIENTE');
  end loop;

  if jsonb_typeof(v_aplicada) = 'object' and v_desconto > 0 then
    insert into reservation_discounts (reservation_id, promotion_id, type, amount_cents, detail)
    values (r.id, v_promo.id, v_promo.type, v_desconto, jsonb_build_object('rotulo', v_aplicada ->> 'rotulo'));
    if v_promo.budget_cents is not null then
      update promotions set budget_used_cents = budget_used_cents + v_desconto where id = v_promo.id;
    end if;
    if v_promo.type = 'CUPOM' then
      update coupons set used_quantity = used_quantity + 1 where promotion_id = v_cupom.promotion_id;
      insert into coupon_uses (coupon_id, phone_e164, reservation_id, first_used_at)
      values (v_cupom.promotion_id, a.phone_e164, r.id,
              coalesce((select min(u.first_used_at) from coupon_uses u where u.coupon_id = v_cupom.promotion_id
                          and u.phone_e164 = a.phone_e164 and u.status in ('PRESO', 'USADO')), app_now()));
    end if;
  end if;

  perform enqueue_message('reserva_criada:' || r.id, a.phone_e164, 'reserva_criada',
                          jsonb_build_object('nome', split_part(a.customer_name, ' ', 1), 'pecas',
                                             (select sum((x ->> 'qtd')::int) from jsonb_array_elements(v_linhas) x),
                                             'numero', r.number, 'totalCentavos', r.total_cents, 'expiraEm', r.expires_at,
                                             'link', p ->> 'link'),
                          1::smallint, r.expires_at, r.id, 'RESERVADO');
  perform log_audit('CLIENTE', null, 'reserva.criada', 'reservation', r.id::text, r.id,
                    jsonb_build_object('numero', r.number, 'pecas', (select sum((x ->> 'qtd')::int) from jsonb_array_elements(v_linhas) x),
                                       'total_cents', r.total_cents, 'desconto_cents', v_desconto));
  update reservation_attempts set status = 'CONVERTIDA', reservation_id = r.id where id = a.id;

  return jsonb_build_object('reserva', reservation_json(r));
end $$;

-- Reserva vista pela cliente: só do telefone da sessão; de outro telefone, null (404, nunca 403).
create function reservation_for_customer(p_id uuid, p_phone text) returns jsonb
language sql stable
security definer
set search_path = public
as $$ select reservation_json(r) from reservations r where r.id = p_id and r.phone_e164 = p_phone $$;
