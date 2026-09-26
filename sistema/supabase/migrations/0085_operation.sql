-- 0085 · Operação (F11): alertas do sistema e pulso dos jobs
-- O alerta aparece no painel até alguém resolver (ou até sumir a causa, nos automáticos).
-- O pulso diz quando cada job rodou bem pela última vez; atrasado vira alerta, e a rota
-- /worker/saude responde 503 para o monitor de fora (F11.5).

create table system_alerts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind ~ '^[A-Z_]{3,40}$'),
  -- Um aberto por chave: a mesma causa só conta de novo (occurrences)
  key             text not null check (length(key) between 3 and 200),
  message         text not null check (length(message) between 3 and 300),
  data            jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and not audit_tem_dado_pessoal(data)),
  opened_at       timestamptz not null default app_now(),
  last_seen_at    timestamptz not null default app_now(),
  occurrences     integer not null default 1 check (occurrences >= 1),
  resolved_at     timestamptz,
  resolved_by     uuid,
  resolution_note text check (length(resolution_note) <= 500)
);

create unique index system_alerts_um_aberto on system_alerts (key) where resolved_at is null;

create table job_heartbeats (
  job           text primary key check (job ~ '^[a-z_]{3,40}$'),
  -- Mais que isto sem rodar bem, o job está atrasado
  max_age       interval not null,
  description   text not null,
  last_ok_at    timestamptz,
  last_error_at timestamptz,
  last_error    text check (length(last_error) <= 500),
  created_at    timestamptz not null default app_now()
);

insert into job_heartbeats (job, max_age, description) values
  ('varredura',   '2 minutes', 'Varredura das reservas (pg_cron, a cada 10 s)'),
  ('frete',       '5 minutes', 'Vencimento do frete (pg_cron, a cada 1 min)'),
  ('invariantes', '26 hours',  'Verificador de invariantes do estoque (pg_cron, 03:10)'),
  ('purga',       '26 hours',  'Prazos de guarda dos dados pessoais (pg_cron, 03:25)');

alter table system_alerts enable row level security;
alter table job_heartbeats enable row level security;
