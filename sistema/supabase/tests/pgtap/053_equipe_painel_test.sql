begin;
select plan(16);

-- Equipe do painel (0630): só a dona da conta cuida da equipe; ninguém tira o acesso dela.

insert into auth.users (id, email, last_sign_in_at) values
  ('00000000-0000-4000-8000-0000000000d1', 'carol@loja.com', now()),
  ('00000000-0000-4000-8000-0000000000d2', 'layana@loja.com', null),
  ('00000000-0000-4000-8000-0000000000d3', 'nova@loja.com', null);
insert into admin_users (id, name, is_owner) values ('00000000-0000-4000-8000-0000000000d1', 'Carol', true);
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d2', 'Layana');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000d1', 'Painel', 'totp', 'verified', now(), now());

-- ── Lista ──
select is(jsonb_array_length(admin_list_team('00000000-0000-4000-8000-0000000000d1') -> 'pessoas'), 2, 'a equipe toda');
select is((select (p ->> 'dona', p ->> 'voce', p ->> 'autenticador', p ->> 'email')::text
             from jsonb_array_elements(admin_list_team('00000000-0000-4000-8000-0000000000d1') -> 'pessoas') p where p ->> 'nome' = 'Carol'),
  '(true,true,true,carol@loja.com)', 'a dona primeiro, com o e-mail e o autenticador');
select is((select (p ->> 'autenticador')::boolean from jsonb_array_elements(admin_list_team('00000000-0000-4000-8000-0000000000d1') -> 'pessoas') p
            where p ->> 'nome' = 'Layana'), false, 'quem ainda não cadastrou o autenticador');
select is(admin_list_team('00000000-0000-4000-8000-0000000000d2') -> 'podeGerenciar', 'false'::jsonb, 'a equipe vê a lista, sem cuidar dela');
select is(admin_list_team('00000000-0000-4000-8000-0000000000d1') -> 'podeGerenciar', 'true'::jsonb, 'a dona cuida');

-- ── Só a dona ──
select throws_ok($$ select admin_team_lookup('00000000-0000-4000-8000-0000000000d2', 'nova@loja.com') $$, 'TS122', null, 'a equipe não procura e-mails');
select throws_ok($$ select admin_team_set_active('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1', false) $$,
  'TS122', null, 'a equipe não tira o acesso da dona');
select throws_ok($$ select admin_team_set_active('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', false) $$,
  'TS122', null, 'nem a dona tira o próprio acesso');

-- ── Adicionar ──
select is(admin_team_lookup('00000000-0000-4000-8000-0000000000d1', ' NOVA@loja.com '),
  '{"id": "00000000-0000-4000-8000-0000000000d3", "naEquipe": false}'::jsonb, 'o e-mail com cadastro fora da equipe');
select is(admin_team_lookup('00000000-0000-4000-8000-0000000000d1', 'ninguem@loja.com'), '{"naEquipe": false}'::jsonb, 'o e-mail sem cadastro');
select lives_ok($$ select admin_team_add('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d3', ' Nova ') $$, 'a dona adiciona');
select is((select (name, active, is_owner)::text from admin_users where id = '00000000-0000-4000-8000-0000000000d3'), '(Nova,t,f)', 'entra ativa, sem ser dona');
select throws_ok($$ select admin_team_add('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d3', 'Nova') $$,
  '23505', null, 'quem já está não entra de novo');

-- ── Acesso, senha e autenticador ──
select admin_team_set_active('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', false);
select ok(not admin_is_active('00000000-0000-4000-8000-0000000000d2'), 'sem acesso, o painel recusa na hora');
select admin_team_log('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', 'admin.equipe.senha_provisoria');
select is((select array_agg(action order by id) from audit_log where entity_type = 'admin_user'),
  array['admin.equipe.adicionada', 'admin.equipe.desativada', 'admin.equipe.senha_provisoria'], 'tudo na auditoria, sem senha');

select ok(not has_function_privilege('anon', 'admin_team_add(uuid, uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'admin_list_team(uuid)', 'execute'), 'fechado ao público');

select * from finish();
rollback;
