begin;
select plan(8);

select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null, 'toda tabela do public tem RLS ligado');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')),
  0, 'anon e authenticated sem nenhum privilégio nas tabelas');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'anon e authenticated não executam nenhuma função');

select ok(has_function_privilege('service_role', 'hit_rate_limit(text, interval, integer)', 'execute'), 'service role executa as funções');

-- tabela criada depois do 0200 também nasce fechada para a API
create table tabela_nova (id int);
select is(
  (select count(*)::int from information_schema.role_table_grants where table_name = 'tabela_nova' and grantee in ('anon', 'authenticated')),
  0, 'tabela nova não recebe privilégio para anon/authenticated');

set local role anon;
select throws_ok($$ select * from app_settings $$, '42501', null, 'anon não lê configurações');
select throws_ok($$ select * from audit_log $$, '42501', null, 'anon não lê auditoria');
select throws_ok($$ select app_now() $$, '42501', null, 'anon não chama funções');
reset role;

select * from finish();
rollback;
