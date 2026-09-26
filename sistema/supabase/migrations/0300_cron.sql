-- 0300 · Tarefas agendadas (seção 12, G21)
-- A varredura roda no próprio banco a cada 10 s (pg_cron) e só chama o worker HTTP (pg_net)
-- quando há mensagem na fila ou pagamento a resolver. O endereço do worker fica em app_settings e o
-- segredo, no Vault do Supabase (nunca em tabela comum):
--   update app_settings set value = '"https://<projeto>.supabase.co/functions/v1/worker"' where key = 'worker_url';
--   select vault.create_secret('<WORKER_SEGREDO>', 'worker_segredo');
-- No banco local de testes não há pg_cron nem pg_net: as funções existem e o agendamento é
-- pulado.

insert into app_settings (key, value, description) values
  ('worker_url', '""', 'Endereço da Edge Function worker (sem barra no fim); vazio desliga a chamada');

-- Chama o worker se houver mensagem na fila ou pagamento a resolver com o provedor
-- (fim da tolerância, reconciliação, evento do webhook). Devolve se chamou.
create function kick_worker() returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := setting('worker_url') #>> '{}';
  v_segredo text;
begin
  if coalesce(v_url, '') = ''
     or not exists (select 1 from pg_extension where extname = 'pg_net')
     or not (exists (select 1 from outbox_messages where status = 'PENDENTE' and next_attempt_at <= app_now()) or has_payment_work()) then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_segredo using 'worker_segredo';
  if v_segredo is null then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 30000)'
    using v_url || '/tick', jsonb_build_object('content-type', 'application/json', 'x-worker-segredo', v_segredo);
  return true;
end $$;

-- O que o pg_cron chama a cada 10 s.
create function run_sweep() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb := sweep_reservations();
begin
  return v || jsonb_build_object('worker', kick_worker());
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('varredura-reservas', '10 seconds', 'select public.run_sweep()');
    perform cron.schedule('limpeza-limites', '7 * * * *', 'select public.purge_rate_limits()');
    perform cron.schedule('limpeza-login-painel', '17 3 * * *', 'select public.purge_admin_login_guards()');
  end if;
end
$$;

call lock_down_public();
