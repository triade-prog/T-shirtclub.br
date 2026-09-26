begin;
select plan(12);

-- chaves = sha256 de e-mail + IP; aqui, strings de 64 caracteres fazem o papel do hash
select is((admin_login_check(repeat('b', 64))).failures, 0, 'sem histórico, nenhuma falha');

select admin_login_failed(repeat('a', 64)) from generate_series(1, 2);
select is((admin_login_check(repeat('a', 64))).turnstile_required, false, 'com 2 erros ainda não pede Turnstile');
select admin_login_failed(repeat('a', 64));
select is((admin_login_check(repeat('a', 64))).turnstile_required, true, 'a partir do 3º erro pede Turnstile');
select admin_login_failed(repeat('a', 64));
select is((admin_login_failed(repeat('a', 64))).just_blocked, true, 'o 5º erro bloqueia');
select is((admin_login_check(repeat('a', 64))).blocked_until, app_now() + interval '15 minutes', 'bloqueio de 15 minutos');
select is((select count(*)::int from audit_log where action = 'admin.login.bloqueado'), 1, 'bloqueio vai para a auditoria');
select is((admin_login_failed(repeat('a', 64))).just_blocked, false, 'erro durante o bloqueio não estende o bloqueio');

-- outra rede, mesmo e-mail: não afetada (5 senhas erradas de outro IP não travam a loja)
select is((admin_login_check(repeat('c', 64))).blocked_until, null, 'outra rede continua entrando');

-- passado o bloqueio, recomeça do zero
select set_app_clock(interval '16 minutes');
select is((admin_login_check(repeat('a', 64))).blocked_until, null, 'depois de 15 minutos o bloqueio acaba');
select is((admin_login_failed(repeat('a', 64))).failures, 1, 'e a contagem recomeça');

-- senha certa zera a contagem
select admin_login_succeeded(repeat('a', 64));
select is((admin_login_check(repeat('a', 64))).failures, 0, 'login certo zera as falhas');

select throws_ok($$ select admin_login_failed('nao-e-hash') $$, '23514', null, 'só aceita o hash, nunca o e-mail');

select * from finish();
rollback;
