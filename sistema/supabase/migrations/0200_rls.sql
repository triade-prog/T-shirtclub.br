-- 0200 · RLS negando tudo para anon e authenticated
-- A loja e o painel nunca falam com as tabelas: tudo passa pelas Edge Functions com o
-- service role (seção 02). Aqui: RLS ligado em todas as tabelas, nenhum privilégio para
-- anon/authenticated (nem nas tabelas e funções que ainda vão ser criadas) e EXECUTE das
-- funções só para o service role.
-- Toda migration nova que cria tabela também liga o RLS; o teste 004_rls garante isso.

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end
$$;

do $$
declare papel text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on all tables in schema public from %I', papel);
      execute format('revoke all on all sequences in schema public from %I', papel);
      execute format('revoke all on all functions in schema public from %I', papel);
      execute format('alter default privileges in schema public revoke all on tables from %I', papel);
      execute format('alter default privileges in schema public revoke all on sequences from %I', papel);
      execute format('alter default privileges in schema public revoke all on functions from %I', papel);
    end if;
  end loop;
end
$$;

revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;
-- O EXECUTE para PUBLIC vem do padrão global do Postgres, que o padrão por esquema não tira.
alter default privileges revoke execute on functions from public;

-- Para as migrations que vêm depois desta (0300 em diante): fecha de novo o que criaram.
create procedure lock_down_public()
language plpgsql
as $proc$
declare papel text;
begin
  revoke execute on all functions in schema public from public;
  foreach papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on all tables in schema public from %I', papel);
      execute format('revoke all on all sequences in schema public from %I', papel);
      execute format('revoke all on all functions in schema public from %I', papel);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all functions in schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
  end if;
end
$proc$;
revoke execute on procedure lock_down_public() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;
  end if;
end
$$;
