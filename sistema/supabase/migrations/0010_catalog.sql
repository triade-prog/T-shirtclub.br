-- 0010 · Catálogo e estoque (seção 04 do desenho técnico, regra 30 da especificação)
-- Tamanho único: o estoque fica no produto. Disponível = total − reservado − vendido, e o
-- CHECK é a última barreira contra estoque negativo. Quem mexe nos saldos são as funções de
-- domínio (ajuste em 0180, reserva em 0120), sempre com o produto travado.

-- Comuns: carimbo de atualização e tabelas somente de inserção.
create function touch_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := app_now();
  return new;
end $$;

create function somente_insercao() returns trigger
language plpgsql
as $$
begin
  raise exception '% é somente de inserção (% bloqueado)', tg_table_name, tg_op using errcode = 'TS010';
end $$;

-- Coleções: a cor vem da lista já validada (D20); a loja escolhe, não digita.
create table collections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 60),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  description text check (length(description) <= 160),
  color_key   collection_color not null,
  cover_path  text check (cover_path ~ '^[a-z0-9][a-z0-9/_.-]{1,200}$'),
  cover_alt   text check (length(btrim(cover_alt)) between 1 and 200),
  position    integer not null default 0 check (position >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default app_now(),
  updated_at  timestamptz not null default app_now(),
  -- a capa sempre tem texto alternativo
  check ((cover_path is null) = (cover_alt is null))
);

create trigger collections_updated_at before update on collections
  for each row execute function touch_updated_at();

create table products (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections (id),
  code          text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name          text not null check (length(btrim(name)) between 1 and 80),
  price_cents   integer not null check (price_cents between 1 and 10000000),
  description   text check (length(description) <= 2000),
  composition   text check (length(composition) <= 200),
  fit           text check (length(fit) <= 200),
  measurements  jsonb not null default '{}'::jsonb check (jsonb_typeof(measurements) = 'object'),
  care          text check (length(care) <= 500),
  published_at  timestamptz,
  active        boolean not null default true,
  qty_total     integer not null default 0,
  qty_reserved  integer not null default 0,
  qty_sold      integer not null default 0,
  created_at    timestamptz not null default app_now(),
  updated_at    timestamptz not null default app_now(),
  constraint products_estoque_check check (qty_reserved >= 0 and qty_sold >= 0 and qty_reserved + qty_sold <= qty_total)
);

create index products_collection_idx on products (collection_id);
create index products_vitrine_idx on products (published_at) where active and published_at is not null;

create trigger products_updated_at before update on products
  for each row execute function touch_updated_at();

-- Fotos do produto: de 1 a 10, na ordem da loja; a de menor posição é a capa.
create table product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products (id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[a-z0-9][a-z0-9/_.-]{1,200}$'),
  kind         product_image_kind not null,
  alt_text     text not null check (length(btrim(alt_text)) between 1 and 200),
  width        integer not null check (width between 1 and 10000),
  height       integer not null check (height between 1 and 10000),
  position     integer not null check (position between 1 and 10),
  created_at   timestamptz not null default app_now(),
  -- adiável: reordenar troca posições dentro de uma transação
  constraint product_images_posicao_unica unique (product_id, position) deferrable initially immediate
);

-- Publicar exige ao menos uma foto (a vitrine nunca mostra produto sem imagem).
create function trg_products_publicacao() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active and new.published_at is not null
     and not exists (select 1 from product_images where product_id = new.id) then
    raise exception 'Produto publicado precisa de pelo menos 1 foto' using errcode = 'TS101';
  end if;
  return new;
end $$;

create trigger products_publicacao before insert or update of active, published_at on products
  for each row execute function trg_products_publicacao();

-- No máximo 10 fotos; a trava no produto serializa envios simultâneos.
create function trg_product_images_limite() returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1 from products where id = new.product_id for update;
  if (select count(*) from product_images where product_id = new.product_id) >= 10 then
    raise exception 'Cada produto tem no máximo 10 fotos' using errcode = 'TS102';
  end if;
  return new;
end $$;

create trigger product_images_limite before insert on product_images
  for each row execute function trg_product_images_limite();

-- Produto publicado não fica sem foto. Ao apagar o produto (cascata), a regra não se aplica.
create function trg_product_images_minimo() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from products p where p.id = old.product_id and p.active and p.published_at is not null)
     and not exists (select 1 from product_images where product_id = old.product_id) then
    raise exception 'Produto publicado precisa de pelo menos 1 foto' using errcode = 'TS101';
  end if;
  return null;
end $$;

create trigger product_images_minimo after delete on product_images
  for each row execute function trg_product_images_minimo();

-- Looks: foto de campanha com os produtos marcados ("shop the look").
create table looks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 1 and 60),
  image_path text not null check (image_path ~ '^[a-z0-9][a-z0-9/_.-]{1,200}$'),
  image_alt  text not null check (length(btrim(image_alt)) between 1 and 200),
  position   integer not null default 0 check (position >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default app_now(),
  updated_at timestamptz not null default app_now()
);

create trigger looks_updated_at before update on looks
  for each row execute function touch_updated_at();

create table look_products (
  look_id    uuid not null references looks (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  x          numeric(4, 3) not null check (x between 0 and 1),
  y          numeric(4, 3) not null check (y between 0 and 1),
  primary key (look_id, product_id)
);

create index look_products_product_idx on look_products (product_id);

-- Blocos da página inicial, na ordem definida no painel.
create table home_blocks (
  id         uuid primary key default gen_random_uuid(),
  kind       home_block_kind not null,
  ref_id     uuid,
  title      text check (length(btrim(title)) between 1 and 60),
  position   integer not null check (position >= 0),
  active     boolean not null default true,
  updated_at timestamptz not null default app_now()
);

create index home_blocks_position_idx on home_blocks (position) where active;

create trigger home_blocks_updated_at before update on home_blocks
  for each row execute function touch_updated_at();

-- Movimentos de estoque: somente inserção; permitem reconstruir o saldo.
-- ENTRADA e AJUSTE: qty é a variação do total (com sinal) e exigem motivo.
-- RESERVA, LIBERACAO e VENDA: qty é o número de unidades e exigem a reserva.
create table stock_movements (
  id             bigserial primary key,
  product_id     uuid not null references products (id),
  kind           stock_movement_kind not null,
  qty            integer not null check (qty <> 0 and qty between -100000 and 100000),
  reservation_id uuid,
  actor_type     actor_type not null,
  actor_id       uuid,
  reason         text check (length(btrim(reason)) between 3 and 200),
  created_at     timestamptz not null default app_now(),
  check (case kind
           when 'ENTRADA' then qty > 0 and reason is not null and reservation_id is null
           when 'AJUSTE' then reason is not null and reservation_id is null
           else qty > 0 and reservation_id is not null
         end)
);

create index stock_movements_product_idx on stock_movements (product_id, created_at);

create trigger stock_movements_sem_update before update or delete on stock_movements
  for each row execute function somente_insercao();
create trigger stock_movements_sem_truncate before truncate on stock_movements
  for each statement execute function somente_insercao();

-- Disponibilidade para a vitrine. É informativa: a verdade é decidida com o produto travado.
create function availability_label(p_available integer) returns text
language sql stable
set search_path = public
as $$
  select case
    when p_available <= 0 then 'ESGOTADO'
    when p_available <= setting_int('ultimas_unidades') then 'ULTIMAS_UNIDADES'
    else 'DISPONIVEL'
  end
$$;

create view v_product_availability with (security_invoker = true) as
select p.id as product_id,
       greatest(p.qty_total - p.qty_reserved - p.qty_sold, 0) as available,
       availability_label(p.qty_total - p.qty_reserved - p.qty_sold) as label
from products p;

alter table collections enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table looks enable row level security;
alter table look_products enable row level security;
alter table home_blocks enable row level security;
alter table stock_movements enable row level security;
