-- 0040 · Pagamentos, eventos do provedor, análises e disputas (seção 04 e 08, D3, D6, G2, G3)
-- Uma forma de pagamento por reserva (a da primeira cobrança). Cinco camadas de
-- idempotência: Idempotency-Key da cliente (idempotency_key), chave no provedor (o id do
-- pagamento), inbox do webhook (payment_events), applied na aplicação e a constraint final
-- (um pagamento aplicado por reserva e finalidade).

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  reservation_id      uuid not null references reservations (id),
  purpose             payment_purpose not null default 'PRODUTOS',
  shipping_quote_id   uuid, -- frete (F8)
  provider            text not null default 'mercadopago' check (provider ~ '^[a-z]{2,20}$'),
  method              payment_method not null,
  idempotency_key     uuid not null unique,
  provider_payment_id text check (length(provider_payment_id) <= 100),
  amount_cents        integer not null check (amount_cents > 0),
  status              payment_status not null default 'CRIADO',
  provider_status     text check (length(provider_status) <= 60),
  created_at          timestamptz not null default app_now(),
  approved_at         timestamptz,
  pix_qr              text check (length(pix_qr) <= 4000),
  pix_qr_base64       text check (length(pix_qr_base64) <= 20000),
  pix_expires_at      timestamptz,
  applied             boolean not null default false,
  review_reason       review_reason,
  last_checked_at     timestamptz,
  error               text check (length(error) <= 500),
  unique (provider, provider_payment_id),
  check (not applied or status = 'APROVADO' or status = 'ESTORNADO'),
  check ((status = 'EM_ANALISE') = (review_reason is not null) or status = 'ESTORNADO')
);

-- Um pagamento efetivo por finalidade; uma cobrança em curso por vez.
create unique index payments_um_aplicado on payments (reservation_id, purpose) where applied;
create unique index payments_uma_em_curso on payments (reservation_id, purpose) where status in ('CRIADO', 'PENDENTE');
create index payments_pendentes_idx on payments (created_at) where status in ('CRIADO', 'PENDENTE');

-- Inbox dos webhooks: o mesmo evento reenviado vira no-op.
create table payment_events (
  id                bigserial primary key,
  provider          text not null,
  provider_event_id text not null check (length(provider_event_id) <= 200),
  payment_ref       text check (length(payment_ref) <= 100),
  payload           jsonb not null,
  signature_ok      boolean not null,
  received_at       timestamptz not null default app_now(),
  processed_at      timestamptz,
  error             text check (length(error) <= 500),
  unique (provider, provider_event_id)
);

create index payment_events_pendentes_idx on payment_events (received_at) where processed_at is null;

-- Fila de análise do painel (D6): pagamento que não pode confirmar a reserva.
create table payment_reviews (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references payments (id),
  reservation_id     uuid not null references reservations (id),
  reason             review_reason not null,
  status             review_status not null default 'ABERTA',
  resolution         review_resolution,
  new_reservation_id uuid references reservations (id),
  decided_by         uuid,
  decided_at         timestamptz,
  note               text check (length(note) <= 500),
  created_at         timestamptz not null default app_now(),
  check ((status = 'RESOLVIDA') = (resolution is not null))
);

create unique index payment_reviews_uma_aberta on payment_reviews (payment_id) where status = 'ABERTA';

-- Pagamento já aplicado que voltou (G2). Com uma ABERTA, o Entregue (T5) é recusado.
create table payment_disputes (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid not null references payments (id),
  reservation_id  uuid not null references reservations (id),
  kind            dispute_kind not null,
  provider_status text,
  status          review_status not null default 'ABERTA',
  opened_at       timestamptz not null default app_now(),
  resolved_at     timestamptz,
  resolved_by     uuid,
  note            text check (length(note) <= 500)
);

create unique index payment_disputes_uma_aberta on payment_disputes (payment_id) where status = 'ABERTA';

insert into app_settings (key, value, description) values
  ('pix_minutos', '30', 'Validade da cobrança PIX no provedor (o mínimo do Mercado Pago, G14); cancelada no fim da tolerância'),
  ('mp_collector_id', '""', 'Conta recebedora do Mercado Pago; pagamento de outra conta nunca é aplicado (G3)');

alter table payments enable row level security;
alter table payment_events enable row level security;
alter table payment_reviews enable row level security;
alter table payment_disputes enable row level security;
