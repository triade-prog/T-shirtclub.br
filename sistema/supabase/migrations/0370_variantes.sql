-- 0370 · Variantes Único e Plus (27/09, decisão da loja)
-- A peça (products) continua sendo a página: preço, textos, fotos, coleção, promoções e looks.
-- O estoque passa para a variante (product_variants): cada tamanho tem SKU, estoque, medidas e
-- se está ativo. O preço é o mesmo nos dois tamanhos, então o Club ("3 por R$ 119,99") e o
-- desconto da peça valem igual para Único e Plus.
--   * Tamanhos fixos: UNICO e PLUS. O nome de cada um é da loja inteira (app_settings).
--   * Toda peça nasce com as duas variantes: Único ativo e Plus inativo (SKU <código>-UNI e
--     <código>-PLUS, editáveis). Peça só com um tamanho = o outro inativo.
--   * A reserva trava as variantes (e não mais a peça), sempre em ordem de id, e o CHECK de
--     estoque (reservado + vendido ≤ total) passa a valer por tamanho.
--   * max_por_produto continua por peça: somando os tamanhos.
-- Produção vazia em 27/09 (nenhuma peça, reserva ou movimento): a migração dos dados abaixo
-- cobre os bancos de teste e de desenvolvimento.

create type product_size as enum ('UNICO', 'PLUS');

insert into app_settings (key, value, description) values
  ('tamanho_rotulo_unico', '"Único · P ao 42"', 'Nome do tamanho Único na loja, no painel e no WhatsApp'),
  ('tamanho_rotulo_plus', '"Plus · 44 ao 48"', 'Nome do tamanho Plus na loja, no painel e no WhatsApp');

create function size_label(p_size product_size) returns text
language sql stable
set search_path = public
as $$
  select coalesce(setting(case p_size when 'UNICO' then 'tamanho_rotulo_unico' else 'tamanho_rotulo_plus' end) #>> '{}',
                  case p_size when 'UNICO' then 'Único' else 'Plus' end)
$$;

create table product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  size         product_size not null,
  sku          text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
  active       boolean not null default true,
  measurements jsonb not null default '{}'::jsonb check (jsonb_typeof(measurements) = 'object'),
  qty_total    integer not null default 0,
  qty_reserved integer not null default 0,
  qty_sold     integer not null default 0,
  created_at   timestamptz not null default app_now(),
  updated_at   timestamptz not null default app_now(),
  unique (product_id, size),
  -- alvo das chaves (variante, peça) de itens e movimentos: a variante é sempre da peça
  unique (id, product_id),
  constraint product_variants_estoque_check check (qty_reserved >= 0 and qty_sold >= 0 and qty_reserved + qty_sold <= qty_total)
);

create trigger product_variants_updated_at before update on product_variants
  for each row execute function touch_updated_at();
alter table product_variants enable row level security;

-- Os dados de antes: o estoque e as medidas da peça viram o Único; o Plus nasce inativo.
insert into product_variants (product_id, size, sku, active, measurements, qty_total, qty_reserved, qty_sold)
select id, 'UNICO', code || '-UNI', true, measurements, qty_total, qty_reserved, qty_sold from products;
insert into product_variants (product_id, size, sku, active)
select id, 'PLUS', code || '-PLUS', false from products;

create function trg_products_variantes() returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into product_variants (product_id, size, sku, active)
  values (new.id, 'UNICO', new.code || '-UNI', true), (new.id, 'PLUS', new.code || '-PLUS', false);
  return null;
end $$;

create trigger products_variantes after insert on products
  for each row execute function trg_products_variantes();

-- Movimentos de estoque: por variante (a peça fica junto, para o histórico da página).
alter table stock_movements add column variant_id uuid;
alter table stock_movements disable trigger stock_movements_sem_update;
update stock_movements m set variant_id = v.id from product_variants v where v.product_id = m.product_id and v.size = 'UNICO';
alter table stock_movements enable trigger stock_movements_sem_update;
alter table stock_movements alter column variant_id set not null,
  add constraint stock_movements_variante_fk foreign key (variant_id, product_id) references product_variants (id, product_id);
create index stock_movements_variant_idx on stock_movements (variant_id, created_at);

-- Itens da reserva: a variante e o tamanho no momento da reserva.
alter table reservation_items add column variant_id uuid, add column size_snapshot product_size;
update reservation_items i set variant_id = v.id, size_snapshot = v.size
  from product_variants v where v.product_id = i.product_id and v.size = 'UNICO';
alter table reservation_items alter column variant_id set not null, alter column size_snapshot set not null,
  drop constraint reservation_items_reservation_id_product_id_key,
  add constraint reservation_items_variante_unica unique (reservation_id, variant_id),
  add constraint reservation_items_variante_fk foreign key (variant_id, product_id) references product_variants (id, product_id);
create index reservation_items_variant_idx on reservation_items (variant_id);

-- O estoque e as medidas saem da peça.
drop view v_product_availability;
alter table products drop column qty_total, drop column qty_reserved, drop column qty_sold, drop column measurements;

-- ─── Disponibilidade ────────────────────────────────────────────────────────────────────

create function variant_available(v product_variants) returns integer
language sql immutable
as $$ select greatest(v.qty_total - v.qty_reserved - v.qty_sold, 0) $$;

/** Disponível na loja: a soma dos tamanhos ativos. */
create function product_available(p_product uuid) returns integer
language sql stable
set search_path = public
as $$
  select coalesce(sum(variant_available(v)) filter (where v.active), 0)::int from product_variants v where v.product_id = p_product
$$;

create view v_product_availability with (security_invoker = true) as
select p.id as product_id, product_available(p.id) as available, availability_label(product_available(p.id)) as label
from products p;

-- Tamanho na loja: só os ativos, na ordem Único, Plus.
create function variant_public_json(v product_variants) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', v.id, 'tamanho', v.size, 'rotulo', size_label(v.size),
                            'disponivel', variant_available(v), 'selo', availability_label(variant_available(v)))
$$;

create function product_sizes_json(p_product uuid, p_medidas boolean default false) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(variant_public_json(v) || case when p_medidas then jsonb_build_object('medidas', v.measurements) else '{}'::jsonb end
                            order by v.size), '[]')
    from product_variants v where v.product_id = p_product and v.active
$$;

-- Painel: todas as variantes, com o estoque de cada uma.
create function variant_admin_json(v product_variants) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', v.id, 'tamanho', v.size, 'rotulo', size_label(v.size), 'sku', v.sku, 'ativa', v.active,
                            'medidas', v.measurements,
                            'estoque', jsonb_build_object('total', v.qty_total, 'reservado', v.qty_reserved, 'vendido', v.qty_sold,
                                                          'disponivel', variant_available(v)))
$$;

-- ─── Loja: catálogo e sacola ────────────────────────────────────────────────────────────

create or replace function product_card_json(p products) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'nome', p.name, 'precoCentavos', p.price_cents,
    'colecao', (select jsonb_build_object('slug', c.slug, 'nome', c.name, 'cor', c.color_key) from collections c where c.id = p.collection_id),
    'capa', (select image_json(i) - 'id' - 'posicao' from product_images i where i.product_id = p.id order by i.position limit 1),
    'disponivel', product_available(p.id),
    'selo', availability_label(product_available(p.id)),
    'tamanhos', product_sizes_json(p.id))
$$;

create or replace function catalog_product(p_slug text) returns jsonb
language sql stable
set search_path = public
as $$
  select product_card_json(p) || jsonb_build_object(
    'descricao', p.description, 'composicao', p.composition, 'modelagem', p.fit, 'cuidados', p.care,
    'tamanhos', product_sizes_json(p.id, true),
    'colecao', (select collection_json(c) - 'ativa' - 'posicao' - 'id' from collections c where c.id = p.collection_id),
    'fotos', coalesce((select jsonb_agg(image_json(i) - 'id' order by i.position) from product_images i where i.product_id = p.id), '[]'),
    'looks', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'titulo', l.title, 'foto', jsonb_build_object('caminho', l.image_path, 'alt', l.image_alt)))
                         from looks l join look_products lp on lp.look_id = l.id where lp.product_id = p.id and l.active), '[]'))
  from products p
  where p.slug = p_slug and product_visible(p)
$$;

create or replace function catalog_products(p_collection text default null, p_availability text default null, p_limit integer default 200)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(product_card_json(x) order by x.published_at desc, x.name), '[]')
  from (
    select p.* from products p
     where product_visible(p)
       and (p_collection is null or exists (select 1 from collections c where c.id = p.collection_id and c.slug = p_collection))
       and (p_availability is distinct from 'DISPONIVEL' or product_available(p.id) > 0)
     order by p.published_at desc, p.name
     limit least(greatest(p_limit, 1), 200)
  ) x
$$;

-- Sacola: as variantes pedidas (só de peça visível e tamanho ativo), com a peça, o preço e o disponível.
drop function cart_products(uuid[]);
create function cart_products(p_variant_ids uuid[]) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'produtoId', p.id, 'nome', p.name, 'tamanho', v.size,
                                                               'rotulo', size_label(v.size), 'precoCentavos', p.price_cents,
                                                               'disponivel', variant_available(v)))
                             from product_variants v join products p on p.id = v.product_id
                            where v.id = any(p_variant_ids) and v.active and product_visible(p)), '[]'),
    'limites', jsonb_build_object('maxPecas', setting_int('max_pecas'), 'maxPorProduto', setting_int('max_por_produto')))
$$;

-- ─── Reserva, pagamento e expiração ─────────────────────────────────────────────────────

drop function expire_overdue_holding(uuid[]);
create function expire_overdue_holding(p_variant_ids uuid[]) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  n integer := 0;
begin
  for v_id in
    select distinct r.id from reservations r join reservation_items i on i.reservation_id = r.id
     where i.variant_id = any(p_variant_ids) and r.status = 'RESERVADO' and app_now() >= effective_deadline(r)
     order by r.id
  loop
    if expire_if_overdue(v_id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- p.linhas: [{produtoId, varianteId, qtd, precoTabelaCentavos, descontoCentavos, totalCentavos}]
create or replace function create_reservation(p_attempt_id uuid, p_token_hash text, p jsonb) returns jsonb
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
  v_var product_variants;
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

  -- As linhas precisam ser exatamente os itens da tentativa (peça, tamanho e quantidade).
  if (select jsonb_agg(jsonb_build_object('p', x ->> 'produtoId', 'v', x ->> 'varianteId', 'q', (x ->> 'qtd')::int) order by x ->> 'varianteId') from jsonb_array_elements(v_linhas) x)
     is distinct from
     (select jsonb_agg(jsonb_build_object('p', x ->> 'produtoId', 'v', x ->> 'varianteId', 'q', (x ->> 'qtd')::int) order by x ->> 'varianteId') from jsonb_array_elements(a.items) x) then
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
  -- O limite por peça soma os tamanhos
  if exists (select 1 from jsonb_array_elements(v_linhas) x group by x ->> 'produtoId' having sum((x ->> 'qtd')::int) > setting_int('max_por_produto')) then
    return jsonb_build_object('erro', 'MAX_PER_MODEL', 'detalhes', jsonb_build_object('maxPorProduto', setting_int('max_por_produto')));
  end if;

  -- 3. Libera as reservas vencidas que ainda seguram estes tamanhos (o estoque não espera a
  --    próxima varredura) e trava as variantes sempre em ordem crescente de id (sem deadlock)
  select array_agg((x ->> 'varianteId')::uuid order by (x ->> 'varianteId')::uuid) into v_ids from jsonb_array_elements(v_linhas) x;
  perform expire_overdue_holding(v_ids);
  for v_var in select * from product_variants where id = any(v_ids) order by id for update loop
    null;
  end loop;

  -- 4. Confere todos; se algum faltar, nada é reservado. Variante de outra peça, inativa ou de
  --    peça fora da loja conta como indisponível.
  select coalesce(jsonb_agg(jsonb_build_object('produtoId', x ->> 'produtoId', 'varianteId', x ->> 'varianteId',
                                               'nome', pr.name || coalesce(' · ' || size_label(v.size), ''),
                                               'disponivel', coalesce(variant_available(v), 0))), '[]')
    into v_faltando
    from jsonb_array_elements(v_linhas) x
    left join product_variants v on v.id = (x ->> 'varianteId')::uuid and v.product_id = (x ->> 'produtoId')::uuid
    left join products pr on pr.id = v.product_id
   where v.id is null or not v.active or not product_visible(pr) or variant_available(v) < (x ->> 'qtd')::int;
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

  for v_linha in select x from jsonb_array_elements(v_linhas) x order by x ->> 'varianteId' loop
    insert into reservation_items (reservation_id, product_id, variant_id, size_snapshot, name_snapshot, qty, list_price_cents,
                                   discount_cents, total_cents, discounts)
    select r.id, pr.id, v.id, v.size, pr.name, (v_linha ->> 'qtd')::int, pr.price_cents, (v_linha ->> 'descontoCentavos')::int,
           (v_linha ->> 'totalCentavos')::int,
           case when (v_linha ->> 'descontoCentavos')::int > 0 and jsonb_typeof(v_aplicada) = 'object'
                then jsonb_build_array(jsonb_build_object('promocaoId', v_aplicada ->> 'promocaoId', 'valorCentavos', (v_linha ->> 'descontoCentavos')::int))
                else '[]'::jsonb end
      from product_variants v join products pr on pr.id = v.product_id
     where v.id = (v_linha ->> 'varianteId')::uuid;
    update product_variants set qty_reserved = qty_reserved + (v_linha ->> 'qtd')::int where id = (v_linha ->> 'varianteId')::uuid;
    insert into stock_movements (product_id, variant_id, kind, qty, reservation_id, actor_type)
    values ((v_linha ->> 'produtoId')::uuid, (v_linha ->> 'varianteId')::uuid, 'RESERVA', (v_linha ->> 'qtd')::int, r.id, 'CLIENTE');
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

-- ─── Funções que só trocam a peça pela variante (a partir das definições em produção) ─────

-- apply_payment_result: a venda baixa o reservado da variante

CREATE OR REPLACE FUNCTION public.apply_payment_result(p_payment_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Frete (F8): confirma a cotação e libera a preparação (0170)
  if pg.purpose = 'FRETE' then
    return apply_shipping_approval(r, pg, (p ->> 'valorCentavos')::int, v_aprovado);
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
  perform ensure_fulfillment(r);
  for v_item in select product_id, variant_id, qty from reservation_items where reservation_id = r.id order by variant_id loop
    update product_variants set qty_reserved = qty_reserved - v_item.qty, qty_sold = qty_sold + v_item.qty where id = v_item.variant_id;
    insert into stock_movements (product_id, variant_id, kind, qty, reservation_id, actor_type)
    values (v_item.product_id, v_item.variant_id, 'VENDA', v_item.qty, r.id, 'PROVEDOR');
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
end $function$;


-- expire_reservation: devolve o reservado de cada variante

CREATE OR REPLACE FUNCTION public.expire_reservation(p_id uuid, p_reason closure_reason, p_actor_type actor_type DEFAULT 'SISTEMA'::actor_type, p_actor_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r reservations;
  v_item record;
  v_desconto record;
begin
  select * into r from reservations where id = p_id for update;
  if not found or r.status <> 'RESERVADO' then
    return false; -- já foi paga, expirada ou não existe: nada a fazer
  end if;

  perform set_transition_context(case when p_reason = 'PRAZO_ESGOTADO' then 'T3' else 'T4' end, p_actor_type, p_actor_id, p_note);
  update reservations set status = 'EXPIRADO', closure_reason = p_reason, expired_at = app_now() where id = r.id;

  -- Estoque: variantes em ordem de id, como em toda função
  for v_item in
    select i.product_id, i.variant_id, i.qty from reservation_items i where i.reservation_id = r.id order by i.variant_id
  loop
    update product_variants set qty_reserved = qty_reserved - v_item.qty where id = v_item.variant_id;
    insert into stock_movements (product_id, variant_id, kind, qty, reservation_id, actor_type, actor_id)
    values (v_item.product_id, v_item.variant_id, 'LIBERACAO', v_item.qty, r.id, p_actor_type, p_actor_id);
  end loop;

  -- Cupom e orçamento voltam (regra 28)
  for v_desconto in
    select d.promotion_id, d.amount_cents, p.type, p.budget_cents
      from reservation_discounts d join promotions p on p.id = d.promotion_id
     where d.reservation_id = r.id order by d.promotion_id
  loop
    perform 1 from promotions where id = v_desconto.promotion_id for update;
    if v_desconto.budget_cents is not null then
      update promotions set budget_used_cents = greatest(budget_used_cents - v_desconto.amount_cents, 0) where id = v_desconto.promotion_id;
    end if;
    if v_desconto.type = 'CUPOM' then
      update coupons set used_quantity = greatest(used_quantity - 1, 0) where promotion_id = v_desconto.promotion_id;
      update coupon_uses set status = 'DEVOLVIDO' where reservation_id = r.id and status = 'PRESO';
    end if;
  end loop;

  if p_reason = 'PRAZO_ESGOTADO' then
    update cancellation_requests set status = 'PREJUDICADA', decided_at = app_now()
     where reservation_id = r.id and status = 'PENDENTE';
    perform enqueue_message('reserva_expirada:' || r.id, r.phone_e164, 'reserva_expirada',
                            jsonb_build_object('numero', r.number, 'expiradaEm', effective_deadline(r)),
                            1::smallint, app_now() + interval '1 hour', r.id, 'EXPIRADO');
  end if;

  perform log_audit(p_actor_type, p_actor_id, 'reserva.expirada', 'reservation', r.id::text, r.id,
                    jsonb_build_object('motivo', p_reason, 'numero', r.number));

  if p_reason = 'PRAZO_ESGOTADO' then
    perform check_phone_block(r.customer_id, r.id);
  end if;
  return true;
end $function$;


-- review_convert: confere e vende por variante

CREATE OR REPLACE FUNCTION public.review_convert(p_review_id uuid, p_admin uuid, p_note text, p_key_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if pg.purpose = 'FRETE' then
    raise exception 'Pagamento de frete não vira pedido: estorne' using errcode = 'TS164';
  end if;

  perform 1 from product_variants where id in (select variant_id from reservation_items where reservation_id = velha.id) order by id for update;
  select jsonb_agg(i.name_snapshot || ' · ' || size_label(i.size_snapshot)) into v_faltando
    from reservation_items i join product_variants pv on pv.id = i.variant_id
   where i.reservation_id = velha.id and variant_available(pv) < i.qty;
  if v_faltando is not null then
    raise exception 'Sem estoque para: %', v_faltando using errcode = 'TS163';
  end if;

  perform set_transition_context('T1', 'ADMIN', p_admin, 'Convertido de pagamento em análise');
  insert into reservations (access_key_hash, payment_method, coupon_code, customer_id, phone_e164, customer_name, status,
                            delivery_intent, subtotal_cents, discount_cents, total_cents, expires_at)
  values (p_key_hash, pg.method, velha.coupon_code, velha.customer_id, velha.phone_e164, velha.customer_name, 'RESERVADO',
          velha.delivery_intent, velha.subtotal_cents, velha.discount_cents, velha.total_cents, app_now() + interval '1 minute')
  returning * into nova;
  insert into reservation_items (reservation_id, product_id, variant_id, size_snapshot, name_snapshot, qty, list_price_cents, discount_cents, total_cents, discounts)
  select nova.id, product_id, variant_id, size_snapshot, name_snapshot, qty, list_price_cents, discount_cents, total_cents, discounts
    from reservation_items where reservation_id = velha.id;

  perform set_transition_context('T2', 'ADMIN', p_admin, 'Convertido de pagamento em análise');
  update reservations set status = 'PAGAMENTO_CONFIRMADO', payment_confirmed_at = app_now() where id = nova.id;
  update payments set reservation_id = nova.id, status = 'APROVADO', applied = true, review_reason = null where id = pg.id;
  perform ensure_fulfillment(nova);
  for v_item in select product_id, variant_id, qty from reservation_items where reservation_id = nova.id order by variant_id loop
    update product_variants set qty_sold = qty_sold + v_item.qty where id = v_item.variant_id;
    insert into stock_movements (product_id, variant_id, kind, qty, reservation_id, actor_type, actor_id)
    values (v_item.product_id, v_item.variant_id, 'VENDA', v_item.qty, nova.id, 'ADMIN', p_admin);
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
end $function$;


-- reservation_json: cada item com o tamanho

CREATE OR REPLACE FUNCTION public.reservation_json(r reservations)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', r.id, 'numero', r.number, 'status', r.status, 'motivoEncerramento', r.closure_reason,
    'entrega', r.delivery_intent, 'nome', r.customer_name, 'telefone', r.phone_e164,
    'subtotalCentavos', r.subtotal_cents, 'descontoCentavos', r.discount_cents, 'totalCentavos', r.total_cents,
    'cupom', r.coupon_code, 'criadaEm', r.created_at, 'expiraEm', r.expires_at, 'toleranciaAte', r.grace_until,
    'pagaEm', r.payment_confirmed_at, 'expiradaEm', r.expired_at, 'entregueEm', r.delivered_at,
    'itens', (select jsonb_agg(jsonb_build_object('produtoId', i.product_id, 'varianteId', i.variant_id, 'nome', i.name_snapshot,
                                                  'tamanho', i.size_snapshot, 'rotuloTamanho', size_label(i.size_snapshot), 'qtd', i.qty,
                                                  'precoTabelaCentavos', i.list_price_cents, 'descontoCentavos', i.discount_cents,
                                                  'totalCentavos', i.total_cents,
                                                  'capa', (select image_json(pi) - 'id' - 'posicao' from product_images pi
                                                            where pi.product_id = i.product_id order by pi.position limit 1))
                               order by i.name_snapshot, i.size_snapshot)
                from reservation_items i where i.reservation_id = r.id),
    'descontos', coalesce((select jsonb_agg(jsonb_build_object('tipo', d.type, 'valorCentavos', d.amount_cents, 'rotulo', d.detail ->> 'rotulo'))
                             from reservation_discounts d where d.reservation_id = r.id), '[]'),
    -- O pedido de cancelamento mais recente (a tela mostra "aguardando a loja" ou a decisão)
    'cancelamento', (select jsonb_strip_nulls(jsonb_build_object('status', c.status, 'solicitadoEm', c.requested_at,
                                                                 'decididoEm', c.decided_at, 'motivoDecisao', c.decision_reason))
                       from cancellation_requests c where c.reservation_id = r.id order by c.status = 'PENDENTE' desc, c.requested_at desc limit 1),
    -- Depois do pagamento: modalidade, endereço resumido, frete e código de retirada (F8)
    'logistica', (select fulfillment_json(f, false) from fulfillments f where f.reservation_id = r.id),
    'agora', app_now())
$function$;


-- Verificador de invariantes: por variante

CREATE OR REPLACE FUNCTION public.check_stock_invariants()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record;
  v_divergentes jsonb := '[]';
begin
  for v in
    select pv.id, pv.sku as code, pv.product_id, pv.qty_total, pv.qty_reserved, pv.qty_sold,
           coalesce(sum(i.qty) filter (where r.status = 'RESERVADO'), 0)::int as reservado,
           coalesce(sum(i.qty) filter (where r.status in ('PAGAMENTO_CONFIRMADO', 'ENTREGUE')), 0)::int as vendido
      from product_variants pv
      left join reservation_items i on i.variant_id = pv.id
      left join reservations r on r.id = i.reservation_id
     group by pv.id
     order by pv.sku
  loop
    if v.qty_reserved <> v.reservado or v.qty_sold <> v.vendido or v.qty_total < v.qty_reserved + v.qty_sold then
      perform open_alert('ESTOQUE_DIVERGENTE', 'estoque:' || v.id, 'Estoque divergente no SKU ' || v.code,
                         jsonb_build_object('produtoId', v.product_id, 'varianteId', v.id, 'codigo', v.code, 'total', v.qty_total, 'reservado', v.qty_reserved,
                                            'reservadoPelasReservas', v.reservado, 'vendido', v.qty_sold, 'vendidoPelasReservas', v.vendido));
      v_divergentes := v_divergentes || jsonb_build_object('codigo', v.code, 'reservado', v.qty_reserved, 'esperadoReservado', v.reservado,
                                                           'vendido', v.qty_sold, 'esperadoVendido', v.vendido);
    else
      perform close_alert('estoque:' || v.id);
    end if;
  end loop;
  perform job_heartbeat('invariantes');
  return jsonb_build_object('divergencias', jsonb_array_length(v_divergentes), 'produtos', v_divergentes);
end $function$;


-- Painel: a linha da peça soma os tamanhos e diz quais estão ativos

CREATE OR REPLACE FUNCTION public.admin_product_row_json(p products)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', p.id, 'codigo', p.code, 'slug', p.slug, 'nome', p.name, 'precoCentavos', p.price_cents,
    'colecaoId', p.collection_id, 'ativo', p.active, 'publicado', p.published_at is not null, 'publicadoEm', p.published_at,
    'capa', (select image_json(i) from product_images i where i.product_id = p.id order by i.position limit 1),
    'fotos', (select count(*) from product_images i where i.product_id = p.id),
    'estoque', (select jsonb_build_object('total', coalesce(sum(v.qty_total), 0), 'reservado', coalesce(sum(v.qty_reserved), 0),
                                          'vendido', coalesce(sum(v.qty_sold), 0), 'disponivel', product_available(p.id))
                  from product_variants v where v.product_id = p.id),
    'tamanhos', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'tamanho', v.size, 'rotulo', size_label(v.size), 'ativa', v.active,
                                                             'disponivel', variant_available(v)) order by v.size), '[]')
                   from product_variants v where v.product_id = p.id))
$function$;


-- Painel: a peça com as variantes; os movimentos dizem o tamanho

CREATE OR REPLACE FUNCTION public.admin_get_product(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select admin_product_row_json(p) || jsonb_build_object(
    'descricao', p.description, 'composicao', p.composition, 'modelagem', p.fit, 'cuidados', p.care,
    'variantes', (select coalesce(jsonb_agg(variant_admin_json(v) order by v.size), '[]') from product_variants v where v.product_id = p.id),
    'fotos', coalesce((select jsonb_agg(image_json(i) order by i.position) from product_images i where i.product_id = p.id), '[]'),
    'movimentos', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.kind, 'qtd', m.qty, 'motivo', m.reason, 'em', m.created_at,
                                                       'tamanho', (select v.size from product_variants v where v.id = m.variant_id)) order by m.id desc)
                              from (select * from stock_movements m where m.product_id = p.id order by m.id desc limit 20) m), '[]'))
  from products p where p.id = p_id
$function$;


-- Dashboard: estoque em atenção por tamanho e vendas por tamanho

CREATE OR REPLACE FUNCTION public.admin_sales_dashboard(p_periodo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agora timestamptz := app_now();
  -- Até agora, o instante de agora incluído (a janela é [início, fim))
  v_fim timestamptz := app_now() + interval '1 microsecond';
  v_hoje timestamptz := inicio_do_dia();
  v_local timestamp := app_now() at time zone 'America/Bahia';
  v_ini timestamptz;
  v_passo interval;
  v_meta integer;
begin
  case p_periodo
    when 'HOJE' then v_ini := v_hoje; v_passo := interval '1 day'; v_meta := setting_int('meta_vendas_dia_centavos');
    when '7_DIAS' then v_ini := v_hoje - interval '6 days'; v_passo := interval '7 days'; v_meta := setting_int('meta_vendas_dia_centavos') * 7;
    when '30_DIAS' then v_ini := v_hoje - interval '29 days'; v_passo := interval '30 days'; v_meta := setting_int('meta_vendas_dia_centavos') * 30;
    when 'MES' then v_ini := date_trunc('month', v_local) at time zone 'America/Bahia'; v_passo := interval '1 month';
                    v_meta := setting_int('meta_vendas_mes_centavos');
    when 'ANO' then v_ini := date_trunc('year', v_local) at time zone 'America/Bahia'; v_passo := interval '1 year';
                    v_meta := setting_int('meta_vendas_ano_centavos');
    else raise exception 'Período inválido' using errcode = 'TS182';
  end case;

  return jsonb_build_object(
    'periodo', p_periodo, 'inicio', v_ini, 'agora', v_agora,
    'atual', sales_totals(v_ini, v_fim),
    'anterior', sales_totals(v_ini - v_passo, v_fim - v_passo),
    'meta', nullif(v_meta, 0),
    -- Receita líquida dos últimos 7 dias, hoje incluído
    'serie', (select jsonb_agg(jsonb_build_object('dia', to_char(d at time zone 'America/Bahia', 'YYYY-MM-DD'),
                                                  'receitaLiquidaCentavos', sales_totals(d, least(d + interval '1 day', v_fim)) -> 'receitaLiquidaCentavos')
                               order by d)
                from generate_series(v_hoje - interval '6 days', v_hoje, interval '1 day') d),
    'colecoes', (select coalesce(jsonb_agg(x order by (x ->> 'receitaCentavos')::integer desc), '[]') from (
                   select jsonb_build_object('nome', c.name, 'receitaCentavos', sum(i.total_cents), 'pecas', sum(i.qty)) as x
                     from reservations r
                     join reservation_items i on i.reservation_id = r.id
                     join products p on p.id = i.product_id
                     join collections c on c.id = p.collection_id
                    where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim
                    group by c.id, c.name
                    order by sum(i.total_cents) desc
                    limit 5) t),
    'mix', jsonb_build_object(
      'tamanho', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                    select i.size_snapshot::text as k, sum(i.qty) as n from reservations r join reservation_items i on i.reservation_id = r.id
                     where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim
                     group by 1) t),
      'pagamento', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                      select r.payment_method::text as k, count(*) as n from reservations r
                       where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim and r.payment_method is not null
                       group by 1) t),
      'entrega', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                    select coalesce(f.mode, r.delivery_intent)::text as k, count(*) as n
                      from reservations r left join fulfillments f on f.reservation_id = r.id
                     where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim
                     group by 1) t)),
    -- Estoque em atenção: publicados com até 1 peça disponível (D26)
    'estoque', (select coalesce(jsonb_agg(x order by (x ->> 'disponivel')::integer, x ->> 'nome', x ->> 'tamanho'), '[]') from (
                  select jsonb_build_object('id', p.id, 'nome', p.name, 'colecao', c.name, 'tamanho', v.size, 'rotuloTamanho', size_label(v.size),
                                            'disponivel', variant_available(v)) as x
                    from product_variants v join products p on p.id = v.product_id join collections c on c.id = p.collection_id
                   where p.published_at is not null and v.active and variant_available(v) <= 1
                   order by variant_available(v), p.name, v.size
                   limit 10) t),
    'estoqueTotal', (select count(*) from product_variants v join products p on p.id = v.product_id
                      where p.published_at is not null and v.active and variant_available(v) <= 1),
    'pulso', admin_operation_board() -> 'resumo'
             || jsonb_build_object('entreguesHoje', (select count(*) from reservations where status = 'ENTREGUE' and delivered_at >= v_hoje),
                                   'freteParaCalcular', (select count(*) from fulfillments where closed_at is null and substatus = 'AGUARDANDO_CALCULO_FRETE')));
end $function$;


-- ─── Painel: ajuste de estoque, cadastro da peça e nomes dos tamanhos ──────────────────

-- Ajuste de estoque por tamanho: a variante tem de ser da peça (senão, "não encontrado").
drop function adjust_stock(uuid, integer, text, uuid, stock_movement_kind);
create function adjust_stock(
  p_product_id uuid,
  p_variant_id uuid,
  p_delta      integer,
  p_reason     text,
  p_admin_id   uuid,
  p_kind       stock_movement_kind default 'AJUSTE'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v product_variants;
  v_motivo text := btrim(coalesce(p_reason, ''));
begin
  if p_kind not in ('ENTRADA', 'AJUSTE') then
    raise exception 'Ajuste manual só como ENTRADA ou AJUSTE' using errcode = 'TS120';
  end if;
  if p_delta is null or p_delta = 0 or (p_kind = 'ENTRADA' and p_delta < 0) then
    raise exception 'Quantidade do ajuste inválida' using errcode = 'TS120';
  end if;
  if length(v_motivo) not between 3 and 200 then
    raise exception 'O ajuste precisa de um motivo (3 a 200 caracteres)' using errcode = 'TS121';
  end if;
  if not admin_is_active(p_admin_id) then
    raise exception 'Administrador inativo' using errcode = 'TS122';
  end if;

  select * into v from product_variants where id = p_variant_id and product_id = p_product_id for update;
  if not found then
    raise exception 'Tamanho não encontrado' using errcode = 'TS123';
  end if;
  if v.qty_total + p_delta < v.qty_reserved + v.qty_sold then
    raise exception 'O estoque não pode ficar abaixo do reservado + vendido (%)', v.qty_reserved + v.qty_sold
      using errcode = 'TS124';
  end if;

  update product_variants set qty_total = qty_total + p_delta where id = v.id;
  insert into stock_movements (product_id, variant_id, kind, qty, actor_type, actor_id, reason)
  values (p_product_id, v.id, p_kind, p_delta, 'ADMIN', p_admin_id, v_motivo);
  perform log_audit('ADMIN', p_admin_id, 'estoque.ajustado', 'product', p_product_id::text, null,
                    jsonb_build_object('tamanho', v.size, 'sku', v.sku, 'tipo', p_kind, 'delta', p_delta,
                                       'antes', v.qty_total, 'depois', v.qty_total + p_delta, 'motivo', v_motivo));
  return v.qty_total + p_delta;
end $$;

-- p: os dados da peça e p.variantes: [{tamanho, sku, ativa, medidas}] (os tamanhos que vierem;
-- os outros ficam como estão). Publicar pede pelo menos um tamanho ativo.
create or replace function admin_save_product(p_admin uuid, p_id uuid, p jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v products;
  v_id uuid;
  v_publicar boolean := coalesce((p ->> 'publicado')::boolean, false);
  v_var jsonb;
  v_mudou jsonb := '[]';
begin
  perform admin_guard(p_admin);
  if p_id is null then
    insert into products (collection_id, code, slug, name, price_cents, description, composition, fit, care, active)
    values ((p ->> 'colecaoId')::uuid, p ->> 'codigo', p ->> 'slug', texto(p, 'nome'), (p ->> 'precoCentavos')::int,
            texto(p, 'descricao'), texto(p, 'composicao'), texto(p, 'modelagem'), texto(p, 'cuidados'),
            coalesce((p ->> 'ativo')::boolean, true))
    returning id into v_id;
  else
    select * into v from products where id = p_id for update;
    if not found then
      raise exception 'Produto não encontrado' using errcode = 'TS130';
    end if;
    v_id := p_id;
  end if;

  -- Tamanhos (a peça nova já tem os dois, pelo gatilho)
  for v_var in select x from jsonb_array_elements(coalesce(p -> 'variantes', '[]')) x loop
    update product_variants
       set sku = upper(v_var ->> 'sku'), active = coalesce((v_var ->> 'ativa')::boolean, active),
           measurements = coalesce(v_var -> 'medidas', measurements)
     where product_id = v_id and size = (v_var ->> 'tamanho')::product_size
       and (sku, active, measurements) is distinct from (upper(v_var ->> 'sku'), coalesce((v_var ->> 'ativa')::boolean, active), coalesce(v_var -> 'medidas', measurements));
    if found then
      v_mudou := v_mudou || jsonb_build_object('tamanho', v_var ->> 'tamanho', 'sku', upper(v_var ->> 'sku'), 'ativa', (v_var ->> 'ativa')::boolean);
    end if;
  end loop;

  if v_publicar and not exists (select 1 from product_variants where product_id = v_id and active) then
    raise exception 'Ative pelo menos um tamanho para publicar' using errcode = 'TS183';
  end if;

  if p_id is null then
    -- Publica depois dos tamanhos (o gatilho da foto continua valendo)
    if v_publicar then
      update products set published_at = app_now() where id = v_id;
    end if;
    perform log_audit('ADMIN', p_admin, 'produto.criado', 'product', v_id::text, null,
                      jsonb_build_object('preco_centavos', (p ->> 'precoCentavos')::int, 'tamanhos', v_mudou));
    return v_id;
  end if;

  update products
     set collection_id = (p ->> 'colecaoId')::uuid, code = p ->> 'codigo', slug = p ->> 'slug', name = texto(p, 'nome'),
         price_cents = (p ->> 'precoCentavos')::int, description = texto(p, 'descricao'), composition = texto(p, 'composicao'),
         fit = texto(p, 'modelagem'), care = texto(p, 'cuidados'),
         active = coalesce((p ->> 'ativo')::boolean, true),
         published_at = case when v_publicar then coalesce(v.published_at, app_now()) end
   where id = p_id;
  perform log_audit('ADMIN', p_admin, 'produto.editado', 'product', p_id::text, null,
                    jsonb_strip_nulls(jsonb_build_object(
                      'preco_antes', case when v.price_cents <> (p ->> 'precoCentavos')::int then v.price_cents end,
                      'preco_depois', case when v.price_cents <> (p ->> 'precoCentavos')::int then (p ->> 'precoCentavos')::int end,
                      'publicado', v_publicar,
                      'tamanhos', nullif(v_mudou, '[]'::jsonb))));
  return p_id;
end $$;

-- Nomes dos tamanhos (Minha conta › Tamanhos): a loja inteira usa os mesmos.
create function admin_size_labels() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object('unico', size_label('UNICO'), 'plus', size_label('PLUS'))
$$;

create function admin_update_size_labels(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo text;
  v_texto text;
  v_mudou text[] := '{}';
begin
  perform admin_guard(p_admin);
  foreach v_campo in array array['unico', 'plus'] loop
    continue when not p ? v_campo;
    v_texto := btrim(coalesce(p ->> v_campo, ''));
    if jsonb_typeof(p -> v_campo) <> 'string' or length(v_texto) not between 2 and 40 then
      raise exception 'Nome de tamanho inválido: %', v_campo using errcode = 'TS184';
    end if;
    if set_setting(case v_campo when 'unico' then 'tamanho_rotulo_unico' else 'tamanho_rotulo_plus' end, to_jsonb(v_texto), p_admin) then
      v_mudou := v_mudou || v_campo;
    end if;
  end loop;
  if cardinality(v_mudou) > 0 then
    perform log_audit('ADMIN', p_admin, 'tamanhos.alterados', 'app_settings', 'tamanhos', null,
                      jsonb_build_object('mudou', to_jsonb(v_mudou)) || admin_size_labels());
  end if;
  return admin_size_labels();
end $$;

call lock_down_public();
