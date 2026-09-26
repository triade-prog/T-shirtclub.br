-- 0090 · Administradores e proteção do login do painel (G7, D12, regra 24)
-- A senha e o autenticador (TOTP) ficam no Supabase Auth. Aqui: quem pode entrar no painel
-- e o bloqueio de 15 min após 5 senhas erradas, contado por e-mail + IP, para que tentativas
-- de terceiros, vindas de outra rede, não travem o acesso da loja.

create table admin_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  active     boolean not null default true,
  created_at timestamptz not null default app_now()
);

create function admin_is_active(p_user_id uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$ select exists (select 1 from admin_users where id = p_user_id and active) $$;

insert into app_settings (key, value, description) values
  ('admin_login_max_falhas',       '5',  'Senhas erradas, pelo mesmo e-mail e IP, até bloquear'),
  ('admin_login_bloqueio_minutos', '15', 'Duração do bloqueio do login do painel'),
  ('admin_login_turnstile_apos',   '3',  'A partir de quantas senhas erradas o login pede o Turnstile'),
  ('admin_sessao_horas',           '12', 'Duração máxima da sessão do painel');

-- key_hash = sha256 de e-mail em minúsculas + IP, calculado pela api-admin: nem o e-mail
-- nem o IP ficam aqui.
create table admin_login_guards (
  key_hash        text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  failures        integer not null default 0 check (failures >= 0),
  last_failure_at timestamptz,
  blocked_until   timestamptz
);

create type admin_login_state as (
  blocked_until      timestamptz,
  failures           integer,
  turnstile_required boolean,
  just_blocked       boolean
);

create function admin_login_state_of(g admin_login_guards, p_just_blocked boolean) returns admin_login_state
language sql stable
set search_path = public
as $$
  select case when g.blocked_until > app_now() then g.blocked_until end,
         coalesce(g.failures, 0),
         coalesce(g.failures, 0) >= setting_int('admin_login_turnstile_apos'),
         p_just_blocked
$$;

-- Situação antes de conferir a senha: bloqueado até quando e se precisa do Turnstile.
create function admin_login_check(p_key_hash text) returns admin_login_state
language plpgsql stable
security definer
set search_path = public
as $$
declare g admin_login_guards;
begin
  select * into g from admin_login_guards where key_hash = p_key_hash;
  if g.last_failure_at < app_now() - make_interval(mins => setting_int('admin_login_bloqueio_minutos'))
     and (g.blocked_until is null or g.blocked_until <= app_now()) then
    g.failures := 0; -- as falhas antigas já não contam
  end if;
  return admin_login_state_of(g, false);
end $$;

-- Senha errada: soma uma falha; na 5ª, bloqueia por 15 min e zera a contagem.
create function admin_login_failed(p_key_hash text) returns admin_login_state
language plpgsql
security definer
set search_path = public
as $$
declare
  g admin_login_guards;
  v_minutos integer := setting_int('admin_login_bloqueio_minutos');
  v_bloqueou boolean := false;
begin
  insert into admin_login_guards (key_hash) values (p_key_hash) on conflict (key_hash) do nothing;
  select * into g from admin_login_guards where key_hash = p_key_hash for update;

  if g.blocked_until > app_now() then
    return admin_login_state_of(g, false);
  end if;
  if g.last_failure_at < app_now() - make_interval(mins => v_minutos) or g.blocked_until is not null then
    g.failures := 0;
    g.blocked_until := null;
  end if;

  g.failures := g.failures + 1;
  g.last_failure_at := app_now();
  if g.failures >= setting_int('admin_login_max_falhas') then
    g.blocked_until := app_now() + make_interval(mins => v_minutos);
    v_bloqueou := true;
    perform log_audit('SISTEMA', null, 'admin.login.bloqueado', 'admin_login', p_key_hash, null,
                      jsonb_build_object('minutos', v_minutos));
  end if;

  update admin_login_guards
     set failures = g.failures, last_failure_at = g.last_failure_at, blocked_until = g.blocked_until
   where key_hash = p_key_hash;
  return admin_login_state_of(g, v_bloqueou);
end $$;

-- Senha certa: a contagem daquele e-mail + IP recomeça.
create function admin_login_succeeded(p_key_hash text) returns void
language sql
security definer
set search_path = public
as $$ delete from admin_login_guards where key_hash = p_key_hash $$;

-- Limpeza diária (0300): contagens paradas há mais de um dia.
create function purge_admin_login_guards() returns integer
language sql
security definer
set search_path = public
as $$
  with apagadas as (
    delete from admin_login_guards
     where coalesce(blocked_until, last_failure_at) < app_now() - interval '1 day'
    returning 1)
  select count(*)::integer from apagadas
$$;

alter table admin_users enable row level security;
alter table admin_login_guards enable row level security;
