-- 0003 · Configurações, relógio da aplicação e limites de uso
-- Nada de regra fica fixo no código: prazos e limites moram em app_settings.
-- Toda função lê a hora por app_now(), que os testes podem adiantar (G18).

create table app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value       jsonb not null,
  description text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

insert into app_settings (key, value, description) values
  ('ambiente',                      '"desenvolvimento"', 'desenvolvimento, teste ou producao; em producao o relógio não pode ser adiantado'),
  ('reserva_minutos',               '15',   'Prazo da reserva para pagar'),
  ('lembrete_minutos',              '5',    'Minutos antes do fim em que sai o lembrete'),
  ('tolerancia_minutos',            '5',    'Tolerância para pagamento iniciado dentro do prazo'),
  ('max_pecas',                     '9',    'Máximo de peças por reserva'),
  ('max_por_produto',               '2',    'Máximo de unidades do mesmo produto por reserva'),
  ('bloqueio_expiracoes',           '3',    'Reservas expiradas que bloqueiam o telefone'),
  ('bloqueio_janela_dias',          '30',   'Janela, em dias, para contar as expirações'),
  ('frete_prazo_horas',             '2',    'Prazo para pagar o frete'),
  ('ultimas_unidades',              '2',    'A partir de quantas unidades a vitrine mostra "Últimas"'),
  ('otp_validade_minutos',          '5',    'Validade do código do WhatsApp'),
  ('otp_tentativas',                '2',    'Tentativas por código'),
  ('otp_codigos_max',               '3',    'Códigos por sessão (o primeiro e 2 reenvios)'),
  ('otp_intervalo_segundos',        '30',   'Intervalo mínimo entre dois códigos'),
  ('otp_bloqueio_minutos',          '30',   'Bloqueio do telefone para pedir código (D10)'),
  ('otp_janela_minutos',            '30',   'Inatividade que encerra a sessão do código'),
  ('tentativa_verificada_minutos',  '10',   'Depois do código, a tentativa pode ser confirmada ou ajustada sem outro código (R8)'),
  ('sessao_cliente_horas',          '12',   'Duração da sessão da cliente depois do código'),
  ('notificacoes_opcionais',        'true', 'Mensagens opcionais do WhatsApp ligadas'),
  ('notificacoes_desligadas',       '[]',   'Modelos opcionais que a loja desligou no painel (tela 18)'),
  ('fila_intervalo_min_s',          '4',    'Intervalo mínimo entre mensagens da fila (G5)'),
  ('fila_intervalo_max_s',          '9',    'Intervalo máximo entre mensagens da fila'),
  ('fila_teto_hora',                '120',  'Mensagens por hora, fora do modo lançamento'),
  ('lancamento_intervalo_min_s',    '2',    'Intervalo mínimo no modo lançamento'),
  ('lancamento_intervalo_max_s',    '4',    'Intervalo máximo no modo lançamento'),
  ('lancamento_teto_hora',          '600',  'Mensagens por hora no modo lançamento'),
  ('modo_lancamento',               'false','Modo lançamento (D14)'),
  ('guarda_otp_dias',               '30',   'Guarda de OTP e tentativas (G9)'),
  ('guarda_ip_dias',                '30',   'Guarda do IP em hash (G9)'),
  ('guarda_whatsapp_recebidas_dias','90',   'Guarda do texto das mensagens recebidas (G9)'),
  ('guarda_endereco_dias',          '90',   'Guarda do endereço depois da entrega (D15)');

create function setting(p_key text) returns jsonb
language sql stable
set search_path = public
as $$ select value from app_settings where key = p_key $$;

create function setting_int(p_key text) returns integer
language plpgsql stable
set search_path = public
as $$
declare v jsonb := setting(p_key);
begin
  if v is null or jsonb_typeof(v) <> 'number' then
    raise exception 'Configuração % ausente ou não numérica', p_key using errcode = 'TS002';
  end if;
  return v::integer;
end $$;

-- Relógio: uma linha só, com o quanto o relógio está adiantado (zero fora dos testes).
create table app_clock (
  id     boolean primary key default true check (id),
  offset_interval interval not null default '0'
);
insert into app_clock default values;

create function app_now() returns timestamptz
language sql stable
set search_path = public
as $$ select now() + coalesce((select offset_interval from app_clock), interval '0') $$;

create function set_app_clock(p_offset interval) returns timestamptz
language plpgsql
set search_path = public
as $$
begin
  if setting('ambiente') = '"producao"' then
    raise exception 'O relógio não pode ser adiantado em produção' using errcode = 'TS003';
  end if;
  update app_clock set offset_interval = p_offset;
  return app_now();
end $$;

-- Limites de uso (G20): contador por chave e janela. Sem Redis para menos de 50 pessoas.
create table rate_limits (
  key          text not null check (length(key) between 1 and 200),
  window_start timestamptz not null,
  hits         integer not null check (hits > 0),
  primary key (key, window_start)
);

-- Registra um uso e diz se ainda está dentro do limite (true) ou passou (false).
create function hit_rate_limit(p_key text, p_window interval, p_max integer) returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_hits integer;
begin
  if p_max < 1 or p_window <= interval '0' then
    raise exception 'Limite inválido' using errcode = 'TS004';
  end if;
  v_inicio := date_bin(p_window, app_now(), timestamptz '2000-01-01 00:00:00+00');
  insert into rate_limits as r (key, window_start, hits) values (p_key, v_inicio, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- Apaga janelas antigas; o pg_cron chama a cada hora (0300).
create function purge_rate_limits() returns integer
language sql
set search_path = public
as $$
  with apagadas as (delete from rate_limits where window_start < app_now() - interval '1 day' returning 1)
  select count(*)::integer from apagadas
$$;
