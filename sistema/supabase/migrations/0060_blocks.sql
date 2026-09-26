-- 0060 · Bloqueio de telefone por abuso (seção 09): 3 reservas expiradas por prazo em 30 dias.
-- O bloqueio não expira sozinho; só o painel libera ou mantém, sempre com motivo. As funções
-- que bloqueiam e decidem chegam com a expiração (F5) e o painel (F10); a criação da reserva
-- e o pedido de código já conferem o bloqueio ativo.

create table phone_blocks (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references customers (id),
  status               phone_block_status not null default 'ATIVO',
  trigger_reservations uuid[] not null default '{}',
  created_at           timestamptz not null default app_now(),
  released_at          timestamptz,
  released_by          uuid,
  release_reason       text check (length(btrim(release_reason)) between 3 and 500),
  check ((status = 'LIBERADO') = (released_at is not null))
);

create unique index phone_blocks_um_ativo on phone_blocks (customer_id) where status = 'ATIVO';

create table phone_block_decisions (
  id         uuid primary key default gen_random_uuid(),
  block_id   uuid not null references phone_blocks (id),
  decision   phone_block_decision not null,
  reason     text not null check (length(btrim(reason)) between 3 and 500),
  admin_id   uuid not null,
  created_at timestamptz not null default app_now()
);

create function phone_is_blocked(p_phone text) returns boolean
language sql stable
set search_path = public
as $$
  select exists (select 1 from phone_blocks b join customers c on c.id = b.customer_id
                  where c.phone_e164 = p_phone and b.status = 'ATIVO')
$$;

alter table phone_blocks enable row level security;
alter table phone_block_decisions enable row level security;
