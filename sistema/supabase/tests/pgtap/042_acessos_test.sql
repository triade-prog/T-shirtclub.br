begin;
select plan(14);

-- Acessos (0520): visitas e visitantes por dia (o mesmo código conta uma vez), aparelho por
-- visitante, páginas com coleção ou peça que existem, entradas por origem, códigos antigos
-- apagados e o resumo do painel com os dias sem visita em zero.

insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Fé', 'fe', 'MENTA');
create function pg_temp.v(p_n integer) returns text language sql as $$ select lpad(to_hex(p_n), 64, '0') $$;

select is(register_visit('/', 'instagram', 'mobile', pg_temp.v(1)), true, 'primeira página de quem chega: visitante novo');
select is(register_visit('/colecao/fe', null, 'mobile', pg_temp.v(1)), false, 'a mesma pessoa no mesmo dia não conta de novo');
select register_visit('/colecao/nao-existe', 'direto', 'desktop', pg_temp.v(2));
select register_visit('/produto/nao-existe', null, 'tablet', pg_temp.v(3));

select is((select (views, visitors, mobile, tablet, desktop)::text from site_traffic_days where day = store_today()), '(4,3,1,1,1)',
  '4 páginas vistas, 3 visitantes, aparelho contado por visitante');
select is((select jsonb_object_agg(path, views) from site_traffic_pages where day = store_today()),
  '{"/": 1, "/colecao": 1, "/produto": 1, "/colecao/fe": 1}'::jsonb, 'coleção e peça que não existem não viram endereço novo');
select is((select jsonb_object_agg(source, visits) from site_traffic_sources where day = store_today()),
  '{"direto": 1, "instagram": 1}'::jsonb, 'entradas por origem, só na primeira página');

select throws_ok($$ select register_visit('/', null, 'geladeira', lpad('1', 64, '0')) $$, 'TS187', null, 'aparelho fora da lista não entra');
select throws_ok($$ select register_visit('/', null, 'mobile', 'nao-e-hash') $$, 'TS187', null, 'código fora do formato não entra');
select throws_ok($$ select register_visit('/<script>', null, 'mobile', lpad('1', 64, '0')) $$, '23514', null, 'endereço fora do formato não entra');

-- Dois dias depois: os códigos de antes de ontem saem, os totais ficam
select set_app_clock(interval '2 days');
select is(register_visit('/', null, 'mobile', pg_temp.v(1)), true, 'no outro dia, a mesma pessoa conta de novo');
select is((select count(*) from site_traffic_visitors where day < store_today() - 1), 0::bigint, 'os códigos antigos são apagados');
select is((select visitors from site_traffic_days where day = store_today() - 2), 3, 'os totais do dia ficam');

select is((select (admin_site_traffic(30) -> 'periodo')::text), '{"visitas": 5, "visitantes": 4}', 'total do período');
select is((select jsonb_array_length(admin_site_traffic(30) -> 'dias')), 30, 'um ponto por dia, com os dias sem visita');
select is((select x -> 'nome' from jsonb_array_elements(admin_site_traffic(30) -> 'paginas') x where x ->> 'caminho' = '/colecao/fe'), '"Fé"'::jsonb,
  'as páginas mais vistas trazem o nome da coleção');

select * from finish();
rollback;
