begin;
select plan(16);

-- configurações semeadas
select is(setting_int('reserva_minutos'), 15, 'prazo da reserva: 15 min');
select is(setting_int('max_pecas'), 9, 'máximo de 9 peças');
select is(setting_int('max_por_produto'), 2, 'máximo de 2 por produto');
select throws_ok($$ select setting_int('nao_existe') $$, 'TS002', null, 'configuração ausente dá erro claro');

-- relógio
select ok(abs(extract(epoch from app_now() - now())) < 1, 'app_now() começa igual a now()');
select set_app_clock(interval '14 min 59 s');
select is(app_now(), now() + interval '14 min 59 s', 'relógio adiantado 14min59s');
select set_app_clock(interval '20 min 1 s');
select is(app_now(), now() + interval '20 min 1 s', 'relógio adiantado 20min01s');
select set_app_clock(interval '0');

update app_settings set value = '"producao"' where key = 'ambiente';
select throws_ok($$ select set_app_clock(interval '1 min') $$, 'TS003', null, 'em produção o relógio não pode ser adiantado');
update app_settings set value = '"teste"' where key = 'ambiente';

-- limite de uso
select ok(hit_rate_limit('otp:+5577998128809', interval '10 min', 3), '1º uso dentro do limite');
select ok(hit_rate_limit('otp:+5577998128809', interval '10 min', 3), '2º uso dentro do limite');
select ok(hit_rate_limit('otp:+5577998128809', interval '10 min', 3), '3º uso dentro do limite');
select ok(not hit_rate_limit('otp:+5577998128809', interval '10 min', 3), '4º uso passa do limite');
select ok(hit_rate_limit('otp:+5511987654321', interval '10 min', 3), 'outra chave tem contador próprio');
select set_app_clock(interval '10 min');
select ok(hit_rate_limit('otp:+5577998128809', interval '10 min', 3), 'janela nova zera o contador');
select throws_ok($$ select hit_rate_limit('x', interval '0', 3) $$, 'TS004', null, 'janela zero é recusada');

select set_app_clock(interval '2 days');
select cmp_ok(purge_rate_limits(), '>=', 2, 'janelas com mais de 1 dia são apagadas');

select * from finish();
rollback;
