-- Prepara um Postgres limpo como o do Supabase, só o necessário para os testes:
-- os papéis anon, authenticated e service_role, e a extensão pgTAP.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end
$$;
-- No Supabase o esquema public é aberto aos papéis da API; o teste reproduz isso para
-- provar que o 0200 fecha tudo mesmo assim.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
-- Como no Supabase, extensões ficam no esquema extensions, que está no search_path.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgtap with schema extensions;
alter database postgres set search_path = public, extensions;
-- O Supabase Auth cria auth.users; aqui só o mínimo para as chaves estrangeiras.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
