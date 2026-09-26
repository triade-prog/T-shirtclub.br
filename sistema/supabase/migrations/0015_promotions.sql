-- 0015 · Promoções e cupons (seção 05b, regra 28 da especificação, D19)
-- Três formatos: desconto do produto, compre e economize mais (em níveis ou preço por grupo)
-- e cupom. O cálculo fica no motor de preço (packages/domain); aqui ficam as regras que o
-- banco garante sozinho: formato de cada tipo, período, orçamento, nenhum produto em dois
-- descontos do produto ao mesmo tempo e os contadores do cupom.

create table promotions (
  id                uuid primary key default gen_random_uuid(),
  type              promotion_type not null,
  buy_more_mode     buy_more_mode,
  group_qty         integer check (group_qty between 2 and 9),
  group_price_cents integer check (group_price_cents between 1 and 10000000),
  name              text not null check (length(btrim(name)) between 1 and 50),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  scope             promotion_scope not null default 'TODOS',
  one_per_customer  boolean not null default false,
  budget_cents      integer check (budget_cents > 0),
  budget_used_cents integer not null default 0 check (budget_used_cents >= 0),
  ended_at          timestamptz,
  created_by        uuid,
  created_at        timestamptz not null default app_now(),
  updated_at        timestamptz not null default app_now(),
  check (ends_at > starts_at),
  check ((type = 'COMPRE_MAIS') = (buy_more_mode is not null)),
  check ((buy_more_mode is not distinct from 'PRECO_POR_GRUPO') = (group_qty is not null)),
  check ((group_qty is null) = (group_price_cents is null)),
  check (type <> 'DESCONTO_PRODUTO' or scope = 'ESPECIFICOS'),
  check (budget_cents is null or budget_used_cents <= budget_cents)
);

create trigger promotions_updated_at before update on promotions
  for each row execute function touch_updated_at();

-- Período em que a promoção vale de fato (encerrar antes do fim encurta o período).
create function promotion_period(p_starts timestamptz, p_ends timestamptz, p_ended timestamptz) returns tstzrange
language sql immutable
as $$
  select tstzrange(p_starts, greatest(p_starts, least(p_ends, coalesce(p_ended, p_ends))), '[)')
$$;

-- Situação calculada, pela hora da aplicação: AGENDADA, ATIVA ou ENCERRADA.
create function promotion_state(p_starts timestamptz, p_ends timestamptz, p_ended timestamptz) returns text
language sql stable
set search_path = public
as $$
  select case
    when app_now() >= least(p_ends, coalesce(p_ended, p_ends)) then 'ENCERRADA'
    when app_now() < p_starts then 'AGENDADA'
    else 'ATIVA'
  end
$$;

-- Produtos da promoção. Em DESCONTO_PRODUTO guardam o desconto de cada um; nos outros
-- tipos, só o escopo (ESPECIFICOS). period e product_discount são copiados da promoção
-- pelo gatilho, para a restrição de exclusão.
create table promotion_products (
  promotion_id     uuid not null references promotions (id) on delete cascade,
  product_id       uuid not null references products (id) on delete cascade,
  discount_kind    product_discount_kind,
  discount_value   integer,
  product_discount boolean not null default false,
  period           tstzrange not null default 'empty',
  primary key (promotion_id, product_id),
  check (product_discount = (discount_kind is not null)),
  check ((discount_kind is null) = (discount_value is null)),
  check (discount_kind is distinct from 'PERCENTUAL' or discount_value between 1 and 90),
  check (discount_kind is distinct from 'PRECO_FIXO' or discount_value > 0),
  -- um produto não entra em dois descontos do produto com períodos sobrepostos
  constraint promotion_products_sem_sobreposicao
    exclude using gist (product_id with =, period with &&) where (product_discount)
);

create index promotion_products_product_idx on promotion_products (product_id);

create function trg_promotion_products_copia() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v promotions;
  v_preco integer;
begin
  select * into v from promotions where id = new.promotion_id;
  if v.scope <> 'ESPECIFICOS' then
    raise exception 'Promoção para todos os produtos não tem lista de produtos' using errcode = 'TS110';
  end if;
  new.product_discount := v.type = 'DESCONTO_PRODUTO';
  new.period := promotion_period(v.starts_at, v.ends_at, v.ended_at);
  if new.discount_kind = 'PRECO_FIXO' then
    select price_cents into v_preco from products where id = new.product_id;
    if new.discount_value >= v_preco then
      raise exception 'O preço promocional precisa ser menor que o preço do produto' using errcode = 'TS111';
    end if;
  end if;
  return new;
end $$;

create trigger promotion_products_copia before insert or update on promotion_products
  for each row execute function trg_promotion_products_copia();

-- Mudou o período ou encerrou: atualiza a cópia (e a exclusão confere de novo).
create function trg_promotions_periodo() returns trigger
language plpgsql
set search_path = public
as $$
begin
  update promotion_products
     set period = promotion_period(new.starts_at, new.ends_at, new.ended_at)
   where promotion_id = new.id;
  return null;
end $$;

create trigger promotions_periodo after update of starts_at, ends_at, ended_at on promotions
  for each row execute function trg_promotions_periodo();

-- Níveis do "compre e economize mais" (só no modo NIVEIS).
create table promotion_tiers (
  promotion_id uuid not null references promotions (id) on delete cascade,
  level        integer not null check (level between 1 and 3),
  min_qty      integer not null check (min_qty between 2 and 9),
  percent      integer not null check (percent between 1 and 90),
  primary key (promotion_id, level)
);

create table coupons (
  promotion_id       uuid primary key references promotions (id) on delete cascade,
  code               text not null unique check (code ~ '^[A-Z0-9]{4,20}$'),
  kind               coupon_kind not null,
  value              integer not null,
  max_discount_cents integer check (max_discount_cents > 0),
  min_spend_cents    integer check (min_spend_cents > 0),
  total_quantity     integer not null check (total_quantity between 1 and 9999999),
  used_quantity      integer not null default 0 check (used_quantity >= 0),
  per_customer_limit integer not null default 1 check (per_customer_limit between 1 and 99),
  validity_days      integer not null check (validity_days between 1 and 90),
  check (used_quantity <= total_quantity),
  check (case kind when 'VALOR' then value between 1 and 10000000 else value between 1 and 90 end),
  check (kind = 'PERCENTUAL' or max_discount_cents is null)
);

-- Uso do cupom: PRESO enquanto a reserva está em RESERVADO, USADO quando paga,
-- DEVOLVIDO se ela expirar. O limite por cliente conta PRESO + USADO do telefone.
-- A chave estrangeira para reservations entra em 0030 (F4).
create table coupon_uses (
  id             uuid primary key default gen_random_uuid(),
  coupon_id      uuid not null references coupons (promotion_id),
  phone_e164     text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  reservation_id uuid not null,
  status         coupon_use_status not null default 'PRESO',
  first_used_at  timestamptz not null default app_now(),
  created_at     timestamptz not null default app_now(),
  unique (coupon_id, reservation_id)
);

create index coupon_uses_telefone_idx on coupon_uses (coupon_id, phone_e164) where status in ('PRESO', 'USADO');

-- Formato de cada tipo, conferido no fim da transação (a promoção e as linhas filhas
-- são gravadas juntas):
--   NIVEIS: de 1 a 3 níveis, em sequência, com quantidade e porcentagem crescentes.
--   PRECO_POR_GRUPO e demais tipos: nenhum nível.
--   ESPECIFICOS: ao menos um produto; DESCONTO_PRODUTO: todos com desconto.
--   CUPOM: exatamente um cupom; os outros tipos, nenhum.
create function check_promotion_shape(p_id uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  v promotions;
  v_niveis integer;
  v_ok boolean;
begin
  select * into v from promotions where id = p_id;
  if not found then
    return; -- apagada na mesma transação
  end if;

  select count(*) into v_niveis from promotion_tiers where promotion_id = p_id;
  if v.buy_more_mode = 'NIVEIS' then
    select bool_and(t.level = t.ordem
                    and (t.min_qty_anterior is null or t.min_qty > t.min_qty_anterior)
                    and (t.percent_anterior is null or t.percent > t.percent_anterior))
      into v_ok
      from (select level, min_qty, percent,
                   row_number() over (order by level) as ordem,
                   lag(min_qty) over (order by level) as min_qty_anterior,
                   lag(percent) over (order by level) as percent_anterior
              from promotion_tiers where promotion_id = p_id) t;
    if v_niveis = 0 or not v_ok then
      raise exception 'Níveis precisam começar em 1, com quantidade e porcentagem crescentes' using errcode = 'TS112';
    end if;
  elsif v_niveis > 0 then
    raise exception 'Só o modo em níveis tem níveis' using errcode = 'TS112';
  end if;

  if v.scope = 'ESPECIFICOS' and not exists (select 1 from promotion_products where promotion_id = p_id) then
    raise exception 'Escolha ao menos um produto' using errcode = 'TS113';
  end if;
  if v.type = 'DESCONTO_PRODUTO'
     and exists (select 1 from promotion_products where promotion_id = p_id and discount_kind is null) then
    raise exception 'Todo produto do desconto precisa do valor do desconto' using errcode = 'TS113';
  end if;
  if v.type <> 'DESCONTO_PRODUTO'
     and exists (select 1 from promotion_products where promotion_id = p_id and discount_kind is not null) then
    raise exception 'Só o desconto do produto guarda desconto por produto' using errcode = 'TS113';
  end if;

  if (v.type = 'CUPOM') <> exists (select 1 from coupons where promotion_id = p_id) then
    raise exception 'Cupom precisa de exatamente um código; outros tipos, nenhum' using errcode = 'TS114';
  end if;
end $$;

create function trg_promotion_shape() returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- IF, não CASE: cada ramo só lê o campo que existe na tabela do gatilho
  if tg_table_name = 'promotions' then
    perform check_promotion_shape(new.id);
  elsif tg_op = 'DELETE' then
    perform check_promotion_shape(old.promotion_id);
  else
    perform check_promotion_shape(new.promotion_id);
  end if;
  return null;
end $$;

create constraint trigger promotions_shape after insert or update on promotions
  deferrable initially deferred for each row execute function trg_promotion_shape();
create constraint trigger promotion_tiers_shape after insert or update or delete on promotion_tiers
  deferrable initially deferred for each row execute function trg_promotion_shape();
create constraint trigger promotion_products_shape after insert or update or delete on promotion_products
  deferrable initially deferred for each row execute function trg_promotion_shape();
create constraint trigger coupons_shape after insert or update or delete on coupons
  deferrable initially deferred for each row execute function trg_promotion_shape();

-- Encerrar antes do fim. Não mexe em reservas já criadas: preço e descontos ficam congelados nelas.
create function end_promotion(p_id uuid, p_admin_id uuid) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v promotions;
begin
  select * into v from promotions where id = p_id for update;
  if not found then
    raise exception 'Promoção não encontrada' using errcode = 'TS115';
  end if;
  if promotion_state(v.starts_at, v.ends_at, v.ended_at) = 'ENCERRADA' then
    raise exception 'Promoção já encerrada' using errcode = 'TS116';
  end if;
  update promotions set ended_at = app_now() where id = p_id;
  perform log_audit('ADMIN', p_admin_id, 'promocao.encerrada', 'promotion', p_id::text, null,
                    jsonb_build_object('tipo', v.type, 'situacao_anterior', promotion_state(v.starts_at, v.ends_at, v.ended_at)));
  return app_now();
end $$;

alter table promotions enable row level security;
alter table promotion_products enable row level security;
alter table promotion_tiers enable row level security;
alter table coupons enable row level security;
alter table coupon_uses enable row level security;
