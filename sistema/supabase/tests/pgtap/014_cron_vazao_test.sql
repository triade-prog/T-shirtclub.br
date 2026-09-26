begin;
select plan(6);

-- Sem pg_net e sem endereço do worker (banco local), a varredura roda e não chama nada
select is(run_sweep() ->> 'worker', 'false', 'varredura sem worker configurado não chama nada');
update app_settings set value = '"https://exemplo.supabase.co/functions/v1/worker"' where key = 'worker_url';
select is(kick_worker(), false, 'sem pg_net (ou sem fila), o worker não é chamado');

-- T13 · Pico de lançamento (G5): 50 reservas em 5 min, 30 delas no primeiro minuto, com o
-- modo lançamento ligado e o worker no pior ritmo (uma mensagem a cada 4 s). Cada reserva
-- gera "reserva criada" na hora e o lembrete 10 min depois (válido até 1 min antes do fim).
update app_settings set value = 'true' where key = 'modo_lancamento';
do $$
declare
  v_chegadas int[] := (select array_agg(t order by t) from (
                         select 2 * i as t from generate_series(0, 29) i
                         union all select 60 + 12 * j from generate_series(0, 19) j) x);
  v jsonb;
  k int;
begin
  for t in 0 .. 1500 loop
    perform set_app_clock(make_interval(secs => t));
    for k in 1 .. array_length(v_chegadas, 1) loop
      if v_chegadas[k] = t then
        perform enqueue_message('vazao:criada:' || k, '+5577998128809', 'reserva_criada', '{}'::jsonb, 1::smallint, app_now() + interval '15 minutes');
      elsif v_chegadas[k] + 600 = t then
        perform enqueue_message('vazao:lembrete:' || k, '+5577998128809', 'reserva_lembrete_5min', '{}'::jsonb, 1::smallint, app_now() + interval '4 minutes');
      end if;
    end loop;
    if t % 4 = 0 then
      v := outbox_claim();
      if v is not null then
        perform outbox_result((v ->> 'id')::uuid, true, 'vazao-' || t);
      end if;
    end if;
  end loop;
end
$$;

select is((select count(*)::int from outbox_messages where dedupe_key like 'vazao:%' and status = 'ENVIADA'), 100, 'todas as 100 mensagens saem');
select cmp_ok((select max(extract(epoch from sent_at - created_at))::int from outbox_messages where dedupe_key like 'vazao:criada:%'), '<=', 120,
  'toda "reserva criada" sai em até 2 minutos');
select is((select count(*)::int from outbox_messages where dedupe_key like 'vazao:lembrete:%' and (status <> 'ENVIADA' or sent_at > valid_until)), 0,
  'nenhum lembrete chega depois da validade');
select is((select count(*)::int from outbox_messages where dedupe_key like 'vazao:%' and status = 'DESCARTADA'), 0, 'nada é descartado');

select * from finish();
rollback;
