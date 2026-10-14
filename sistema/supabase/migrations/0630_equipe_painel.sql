-- 0630 · Equipe do painel em Minha conta (14/10, pedido da loja: "faz a tela Equipe no painel em
-- /conta", depois de cadastrar a Layana pelo Supabase, que pedia o SQL Editor e criou por engano
-- um convite sem senha). Quem pode entrar no painel passa a ser cuidado ali:
--   · a lista da equipe, com o e-mail, se o autenticador já foi cadastrado e o último acesso;
--   · só a dona da conta adiciona pessoas (o cadastro no Auth, com a senha provisória, é feito
--     pela api-admin), tira e devolve o acesso, dá uma senha provisória nova e zera o
--     autenticador de quem perdeu o celular. Assim ninguém da equipe tira o acesso da dona.
--   · A dona é a primeira administradora (a conta que criou a loja). A senha nunca passa pelo
--     banco nem pela auditoria.

alter table admin_users add column is_owner boolean not null default false;

update admin_users set is_owner = true
 where id = (select id from admin_users where active order by created_at, id limit 1);

-- A dona da conta ativa (para adicionar e cuidar da equipe)
create function admin_owner_guard(p_admin uuid) returns void
language plpgsql stable
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  if not exists (select 1 from admin_users where id = p_admin and is_owner) then
    raise exception 'Só a dona da conta cuida da equipe' using errcode = 'TS122';
  end if;
end $$;

create function admin_list_team(p_admin uuid) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  return jsonb_build_object(
    'podeGerenciar', exists (select 1 from admin_users where id = p_admin and is_owner),
    'pessoas', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                  'id', a.id, 'nome', a.name, 'email', u.email, 'ativo', a.active, 'dona', a.is_owner,
                  'voce', a.id = p_admin, 'criadoEm', a.created_at, 'ultimoAcesso', u.last_sign_in_at,
                  'autenticador', exists (select 1 from auth.mfa_factors f
                                           where f.user_id = a.id and f.factor_type::text = 'totp' and f.status::text = 'verified')))
                  order by a.is_owner desc, a.active desc, a.created_at), '[]')
                  from admin_users a left join auth.users u on u.id = a.id));
end $$;

-- Pessoa que a dona pode cuidar: da equipe, não ela mesma e não outra dona
create function admin_team_target(p_admin uuid, p_user uuid) returns admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  a admin_users;
begin
  perform admin_owner_guard(p_admin);
  select * into a from admin_users where id = p_user for update;
  if not found then
    raise exception 'Pessoa fora da equipe' using errcode = 'TS123';
  end if;
  if a.id = p_admin or a.is_owner then
    raise exception 'A dona não muda o próprio acesso por aqui' using errcode = 'TS122';
  end if;
  return a;
end $$;

-- Antes de criar no Auth: o e-mail já tem cadastro? (um convite pela metade, por exemplo: a
-- api-admin dá a senha provisória a ele em vez de criar outro). Só contas do painel usam o Auth.
create function admin_team_lookup(p_admin uuid, p_email text) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform admin_owner_guard(p_admin);
  select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email)) order by u.created_at limit 1;
  return jsonb_strip_nulls(jsonb_build_object('id', v_id, 'naEquipe', exists (select 1 from admin_users where id = v_id)));
end $$;

-- O usuário já foi criado no Auth pela api-admin; aqui ele entra na equipe
create function admin_team_add(p_admin uuid, p_user uuid, p_name text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_owner_guard(p_admin);
  if length(btrim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'Nome da pessoa' using errcode = 'TS120';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Usuário não encontrado' using errcode = 'TS123';
  end if;
  insert into admin_users (id, name) values (p_user, btrim(p_name));
  perform log_audit('ADMIN', p_admin, 'admin.equipe.adicionada', 'admin_user', p_user::text);
  return admin_list_team(p_admin);
end $$;

create function admin_team_set_active(p_admin uuid, p_user uuid, p_active boolean) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a admin_users;
begin
  a := admin_team_target(p_admin, p_user);
  if a.active is distinct from p_active then
    update admin_users set active = p_active where id = a.id;
    perform log_audit('ADMIN', p_admin, case when p_active then 'admin.equipe.reativada' else 'admin.equipe.desativada' end,
                      'admin_user', a.id::text);
  end if;
  return admin_list_team(p_admin);
end $$;

-- Senha provisória nova e autenticador zerado: a api-admin confere aqui antes de falar com o
-- Auth e registra depois que deu certo (sem a senha).
create function admin_team_check(p_admin uuid, p_user uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a admin_users;
begin
  a := admin_team_target(p_admin, p_user);
  return jsonb_build_object('id', a.id, 'nome', a.name);
end $$;

create function admin_team_log(p_admin uuid, p_user uuid, p_action text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a admin_users;
begin
  if p_action not in ('admin.equipe.senha_provisoria', 'admin.equipe.autenticador_zerado') then
    raise exception 'Ação desconhecida' using errcode = 'TS120';
  end if;
  a := admin_team_target(p_admin, p_user);
  perform log_audit('ADMIN', p_admin, p_action, 'admin_user', a.id::text);
  return admin_list_team(p_admin);
end $$;

call lock_down_public();
