-- 0030 · Tentativas, reservas, itens, transições e pedidos de cancelamento (seção 04)
-- SELECIONADO vive no carrinho e na tentativa (R2): a reserva nasce direto em RESERVADO,
-- com número de uma sequence que nunca é reutilizada. Preço e descontos ficam congelados.

-- Tentativa: o "Selecionado" do lado do servidor, criada quando a cliente informa nome e
-- WhatsApp. A referência curta (ex.: K7Q2) vai na mensagem que ela manda à loja. Só o
-- navegador com o cookie __Host-tentativa consulta, confirma ou troca itens (G12).
create table reservation_attempts (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null check (ref ~ '^[2-9A-HJ-NP-Z]{4}$'),
  customer_name        text not null check (length(btrim(customer_name)) between 2 and 60),
  phone_e164           text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  delivery_intent      delivery_mode not null,
  items                jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 9),
  coupon_code          text check (coupon_code ~ '^[A-Z0-9]{4,20}$'),
  expected_total_cents integer not null check (expected_total_cents >= 0),
  -- A convertida solta a sessão do código depois de 30 dias (prazos de guarda, F11)
  otp_session_id       uuid references otp_sessions (id),
  status               attempt_status not null default 'AGUARDANDO_VALIDACAO',
  verified_until       timestamptz,
  reservation_id       uuid,
  ip_hash              text check (ip_hash ~ '^[0-9a-f]{64}$'),
  browser_token_hash   text not null check (browser_token_hash ~ '^[0-9a-f]{64}$'),
  created_at           timestamptz not null default app_now(),
  updated_at           timestamptz not null default app_now(),
  check ((status = 'CONVERTIDA') = (reservation_id is not null)),
  check (otp_session_id is not null or status = 'CONVERTIDA')
);

-- A referência é única entre as tentativas em aberto.
create unique index reservation_attempts_ref_aberta on reservation_attempts (ref)
  where status in ('AGUARDANDO_VALIDACAO', 'VERIFICADA', 'FALHOU_ESTOQUE');
create index reservation_attempts_phone_idx on reservation_attempts (phone_e164, created_at desc);

create trigger reservation_attempts_updated_at before update on reservation_attempts
  for each row execute function touch_updated_at();

create sequence reservation_number_seq start 1001;

create table reservations (
  id                   uuid primary key default gen_random_uuid(),
  number               integer not null unique default nextval('reservation_number_seq'),
  -- sha256 da chave do link (/r#<chave>); a chave em si não fica no banco (G6)
  access_key_hash      text not null unique check (access_key_hash ~ '^[0-9a-f]{64}$'),
  payment_method       payment_method,
  coupon_code          text,
  customer_id          uuid not null references customers (id),
  phone_e164           text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  customer_name        text not null check (length(btrim(customer_name)) between 1 and 60),
  status               reservation_status not null,
  closure_reason       closure_reason,
  delivery_intent      delivery_mode not null,
  subtotal_cents       integer not null check (subtotal_cents >= 0),
  discount_cents       integer not null default 0 check (discount_cents >= 0),
  total_cents          integer not null check (total_cents >= 0),
  created_at           timestamptz not null default app_now(),
  expires_at           timestamptz not null,
  grace_until          timestamptz,
  reminder_enqueued_at timestamptz,
  payment_confirmed_at timestamptz,
  expired_at           timestamptz,
  delivered_at         timestamptz,
  delivered_by         uuid,
  attempt_id           uuid unique references reservation_attempts (id),
  check (status <> 'SELECIONADO'),
  check ((status = 'EXPIRADO') = (closure_reason is not null)),
  check (discount_cents <= subtotal_cents and total_cents = subtotal_cents - discount_cents),
  check (expires_at > created_at)
);

-- Uma reserva ativa por telefone, garantida no banco.
create unique index reservations_uma_ativa on reservations (customer_id) where status = 'RESERVADO';
create index reservations_expira_idx on reservations (expires_at) where status = 'RESERVADO';
create index reservations_phone_idx on reservations (phone_e164, created_at desc);

alter table reservation_attempts add constraint reservation_attempts_reservation_fk
  foreign key (reservation_id) references reservations (id);

-- Itens com preço de tabela, desconto e total da linha congelados.
create table reservation_items (
  id               uuid primary key default gen_random_uuid(),
  reservation_id   uuid not null references reservations (id),
  product_id       uuid not null references products (id),
  name_snapshot    text not null,
  qty              integer not null check (qty between 1 and 2),
  list_price_cents integer not null check (list_price_cents >= 0),
  discount_cents   integer not null default 0 check (discount_cents >= 0),
  total_cents      integer not null check (total_cents >= 0),
  discounts        jsonb not null default '[]' check (jsonb_typeof(discounts) = 'array'),
  unique (reservation_id, product_id),
  check (total_cents = list_price_cents * qty - discount_cents)
);

create index reservation_items_product_idx on reservation_items (product_id);

-- Foto do que foi aplicado; nunca é recalculada.
create table reservation_discounts (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations (id),
  promotion_id   uuid not null references promotions (id),
  type           promotion_type not null,
  amount_cents   integer not null check (amount_cents > 0),
  detail         jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
);

create index reservation_discounts_reservation_idx on reservation_discounts (reservation_id);

-- Linha do tempo, preenchida pelo gatilho guardião (0100). A chave estrangeira é conferida
-- no fim da transação: o gatilho roda antes do INSERT da própria reserva.
create table reservation_transitions (
  id             bigserial primary key,
  reservation_id uuid not null references reservations (id) deferrable initially deferred,
  from_status    reservation_status not null,
  to_status      reservation_status not null,
  event          text not null,
  actor_type     actor_type not null,
  actor_id       uuid,
  reason         text,
  created_at     timestamptz not null
);

create index reservation_transitions_reservation_idx on reservation_transitions (reservation_id, id);

create trigger reservation_transitions_sem_update before update or delete on reservation_transitions
  for each row execute function somente_insercao();

create table cancellation_requests (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references reservations (id),
  status          cancel_status not null default 'PENDENTE',
  customer_note   text check (length(customer_note) <= 500),
  requested_at    timestamptz not null default app_now(),
  decided_at      timestamptz,
  decided_by      uuid,
  decision_reason text check (length(decision_reason) <= 500)
);

create unique index cancellation_requests_uma_pendente on cancellation_requests (reservation_id) where status = 'PENDENTE';

-- Consulta com código (F9, G13): a cliente pede o código pelo WhatsApp com a referência
-- ("Quero consultar minhas reservas (ref. K7Q2)") e, validado, ganha a sessão do telefone.
-- ENTREGA é a mesma coisa a partir do link da reserva, antes de mexer na entrega (D13).
-- Só o navegador com o cookie __Host-consulta acompanha e valida (como a tentativa, G12).
create table lookup_attempts (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null check (ref ~ '^[2-9A-HJ-NP-Z]{4}$'),
  reason             lookup_reason not null,
  phone_e164         text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  reservation_id     uuid references reservations (id),
  otp_session_id     uuid not null references otp_sessions (id),
  status             lookup_status not null default 'AGUARDANDO_VALIDACAO',
  browser_token_hash text not null check (browser_token_hash ~ '^[0-9a-f]{64}$'),
  ip_hash            text check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at         timestamptz not null default app_now(),
  verified_at        timestamptz,
  check ((reason = 'ENTREGA') = (reservation_id is not null)),
  check ((status = 'VERIFICADA') = (verified_at is not null))
);

create unique index lookup_attempts_ref_aberta on lookup_attempts (ref) where status = 'AGUARDANDO_VALIDACAO';
create index lookup_attempts_phone_idx on lookup_attempts (phone_e164, created_at desc);

-- Referências que só agora têm para onde apontar.
alter table coupon_uses add constraint coupon_uses_reservation_fk foreign key (reservation_id) references reservations (id);
alter table stock_movements add constraint stock_movements_reservation_fk foreign key (reservation_id) references reservations (id);

alter table reservation_attempts enable row level security;
alter table reservations enable row level security;
alter table reservation_items enable row level security;
alter table reservation_discounts enable row level security;
alter table reservation_transitions enable row level security;
alter table cancellation_requests enable row level security;
