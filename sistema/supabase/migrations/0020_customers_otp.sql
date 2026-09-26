-- 0020 · Clientes, sessões do código do WhatsApp e sessões da cliente (seção 04, seção 07)
-- O telefone (E.164, com o nono dígito) é a identidade. O código nunca é gravado em texto:
-- a Edge Function calcula HMAC-SHA256 com o pepper, que fica só nos segredos do Supabase.

create table customers (
  id                          uuid primary key default gen_random_uuid(),
  phone_e164                  text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  last_name_informed          text check (length(btrim(last_name_informed)) between 1 and 60),
  -- Liberar o bloqueio só mexe aqui; o histórico de reservas fica intacto (seção 09).
  expiration_counter_reset_at timestamptz,
  created_at                  timestamptz not null default app_now()
);

-- Uma sessão por telefone e finalidade enquanto estiver ativa (30 min sem atividade a
-- encerram). Os contadores ficam aqui: recomeçar o fluxo reaproveita a sessão (R16).
create table otp_sessions (
  id               uuid primary key default gen_random_uuid(),
  phone_e164       text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  purpose          otp_purpose not null,
  status           otp_session_status not null default 'ABERTA',
  codes_sent       integer not null default 0 check (codes_sent >= 0),
  blocked_until    timestamptz,
  verified_at      timestamptz,
  last_activity_at timestamptz not null default app_now(),
  created_at       timestamptz not null default app_now(),
  check ((status = 'BLOQUEADA') = (blocked_until is not null)),
  check ((status = 'VERIFICADA') = (verified_at is not null))
);

create index otp_sessions_phone_idx on otp_sessions (phone_e164, purpose, last_activity_at desc);
create index otp_sessions_bloqueio_idx on otp_sessions (phone_e164, blocked_until) where status = 'BLOQUEADA';

create table otp_codes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references otp_sessions (id) on delete cascade,
  code_hash     text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at    timestamptz not null,
  attempts_used integer not null default 0 check (attempts_used >= 0),
  status        otp_code_status not null default 'ATIVO',
  wa_message_id text check (length(wa_message_id) <= 200),
  created_at    timestamptz not null default app_now()
);

-- Um código ativo por sessão: emitir outro substitui o anterior.
create unique index otp_codes_um_ativo on otp_codes (session_id) where status = 'ATIVO';

-- Sessão da cliente: depois do código (escopo TELEFONE) ou ao abrir o link da reserva
-- (escopo RESERVA:<id>, F9). Cookie __Host-sessao; só o hash do token fica aqui.
create table customer_sessions (
  id          uuid primary key default gen_random_uuid(),
  phone_e164  text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scope       text not null check (scope = 'TELEFONE' or scope ~ '^RESERVA:[0-9a-f-]{36}$'),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default app_now()
);

create index customer_sessions_phone_idx on customer_sessions (phone_e164);

alter table customers enable row level security;
alter table otp_sessions enable row level security;
alter table otp_codes enable row level security;
alter table customer_sessions enable row level security;
