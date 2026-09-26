begin;
select plan(30);

insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999, 20);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-00000000a001', 'produtos/lim-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.reservar(p_phone text, p_chave text default gen_random_uuid()::text) returns uuid language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina', p_phone, 'RETIRADA', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999, s,
          'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return (create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1, "precoTabelaCentavos": 4999, "descontoCentavos": 0, "totalCentavos": 4999}]'::jsonb,
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'totalCentavos', 4999, 'aplicada', null,
    'chaveHash', pg_temp.h(p_chave), 'link', 'https://tshirtclub.pt/r#x')) -> 'reserva' ->> 'id')::uuid;
end $$;
create temp table t (nome text primary key, id uuid, ref text);

-- ── Consulta pelo site: referência, código pelo WhatsApp e sessão do telefone ──
insert into t select 'c1', (x ->> 'id')::uuid, x ->> 'ref'
  from (select create_lookup_attempt('+5577998128809', 'CONSULTA', null, pg_temp.h('navegador-1'), pg_temp.h('ip')) as x) y;
select matches((select ref from t where nome = 'c1'), '^[2-9A-HJ-NP-Z]{4}$', 'a consulta ganha uma referência curta');
select is(lookup_status((select id from t where nome = 'c1'), pg_temp.h('navegador-1')) ->> 'situacao', 'AGUARDANDO_MENSAGEM', 'aguarda a mensagem');
select is(lookup_status((select id from t where nome = 'c1'), pg_temp.h('outro-navegador')), null, 'outro navegador não vê a consulta (G12)');
select is(otp_issue_lookup_code((select ref from t where nome = 'c1'), array['+5571999999999'], pg_temp.h('c'), 'wa-1') ->> 'acao',
  'NUMERO_DIFERENTE', 'mensagem de outro número não recebe código');
select is(otp_issue_code((select ref from t where nome = 'c1'), array['+5577998128809'], pg_temp.h('c'), 'wa-2') ->> 'acao',
  'REFERENCIA_INVALIDA', 'a referência da consulta não vale como a da reserva');
select is(otp_issue_lookup_code((select ref from t where nome = 'c1'), array['+557798128809', '+5577998128809'], pg_temp.h('codigo-certo'), 'wa-3') ->> 'acao',
  'ENVIAR_CODIGO', 'do número dela, com ou sem o nono dígito, recebe o código');
select is(lookup_status((select id from t where nome = 'c1'), pg_temp.h('navegador-1')) ->> 'situacao', 'CODIGO_ENVIADO', 'a tela vê o código enviado');
select is(verify_lookup((select id from t where nome = 'c1'), pg_temp.h('navegador-1'), pg_temp.h('codigo-errado')) -> 'detalhes' ->> 'tentativasRestantes',
  '1', 'código errado: resta uma tentativa');
select is(verify_lookup((select id from t where nome = 'c1'), pg_temp.h('navegador-1'), pg_temp.h('codigo-certo')) ->> 'telefone',
  '+5577998128809', 'código certo devolve o telefone para abrir a sessão');
select is(verify_lookup((select id from t where nome = 'c1'), pg_temp.h('navegador-1'), pg_temp.h('qualquer')) ->> 'ok', 'true',
  'repetir logo depois (rede caiu) dá o mesmo resultado');
select is(verify_lookup((select id from t where nome = 'c1'), pg_temp.h('outro-navegador'), pg_temp.h('codigo-certo')) ->> 'erro', 'NOT_FOUND',
  'de outro navegador, não existe');
select is(lookup_status((select id from t where nome = 'c1'), pg_temp.h('navegador-1')) ->> 'situacao', 'VERIFICADA', 'consulta verificada');

-- Uma consulta aberta por telefone; o bloqueio de 30 min vale para as duas finalidades
insert into t select 'c2', (x ->> 'id')::uuid, x ->> 'ref'
  from (select create_lookup_attempt('+5571991112222', 'CONSULTA', null, pg_temp.h('navegador-2')) as x) y;
insert into t select 'c3', (x ->> 'id')::uuid, x ->> 'ref'
  from (select create_lookup_attempt('+5571991112222', 'CONSULTA', null, pg_temp.h('navegador-3')) as x) y;
select is((select status from lookup_attempts where id = (select id from t where nome = 'c2')), 'ABANDONADA'::lookup_status,
  'a consulta nova substitui a anterior');
update otp_sessions set status = 'BLOQUEADA', blocked_until = app_now() + interval '30 minutes'
 where phone_e164 = '+5571991112222' and purpose = 'CONSULTA';
select is(create_lookup_attempt('+5571991112222', 'CONSULTA', null, pg_temp.h('navegador-4')) ->> 'erro', 'OTP_LOCKED',
  'telefone bloqueado para código também não consulta');
select throws_ok($$ select create_lookup_attempt('+5575993334444', 'ENTREGA', null, repeat('a', 64)) $$, '23514', null,
  'a validação da entrega é sempre de uma reserva');

-- ── Reservas do telefone: só as dele (T22) ──
insert into t (nome, id) values ('r1', pg_temp.reservar('+5577998128809'));
select expire_reservation((select id from t where nome = 'r1'), 'PRAZO_ESGOTADO');
insert into t (nome, id) values ('r2', pg_temp.reservar('+5577998128809'));
insert into t (nome, id) values ('r3', pg_temp.reservar('+5579997778888', 'chave-r3'));
select is(jsonb_array_length(customer_reservations('+5577998128809')), 2, 'a consulta lista as reservas do telefone');
select ok(not customer_reservations('+5577998128809') @> jsonb_build_array(jsonb_build_object('id', (select id from t where nome = 'r3'))),
  'a reserva de outra cliente não aparece (T22)');
select is(customer_reservations('+5577998128809') -> 0 ->> 'id', (select id::text from t where nome = 'r2'), 'a mais nova primeiro');
select ok((customer_reservations('+5577998128809') -> 0) ?& array['numero', 'status', 'pecas', 'totalCentavos', 'expiraEm'],
  'o resumo tem número, estado, peças, total e prazo');
select is(jsonb_array_length(customer_reservations('+5575993334444')), 0, 'telefone sem reservas: lista vazia');

-- ── Link da reserva (G6) ──
select is(reservation_by_key(pg_temp.h('chave-r3')) ->> 'id', (select id::text from t where nome = 'r3'), 'a chave abre a reserva certa');
select is(reservation_by_key(pg_temp.h('chave-errada')), null, 'chave errada não abre nada');
select ok(reservation_for_customer((select id from t where nome = 'r1'), '+5577998128809', true) ? 'itens',
  'até 30 dias do fim, o link mostra a reserva inteira');

-- ── "Minha reserva" pelo WhatsApp (R17) ──
select is(whatsapp_my_reservations(array['+557798128809', '+5577998128809']) -> 0 ->> 'id', (select id::text from t where nome = 'r2'),
  'sem o nono dígito, acha a reserva aberta');
select is(jsonb_array_length(whatsapp_my_reservations(array['+557798128809', '+5577998128809'])), 1, 'só as abertas quando há alguma');
select expire_reservation((select id from t where nome = 'r2'), 'PRAZO_ESGOTADO');
select is(whatsapp_my_reservations(array['+5577998128809']) -> 0 ->> 'status', 'EXPIRADO', 'sem abertas, a última encerrada');
select is(jsonb_array_length(whatsapp_my_reservations(array['+5575993334444'])), 0, 'número sem reservas: nada');

select set_app_clock(interval '31 days');
select is(reservation_for_customer((select id from t where nome = 'r1'), '+5577998128809', true),
  jsonb_build_object('id', (select id from t where nome = 'r1'), 'numero', (select number from reservations where id = (select id from t where nome = 'r1')),
                     'status', 'EXPIRADO', 'motivoEncerramento', 'PRAZO_ESGOTADO', 'limitada', true),
  'passados 30 dias do fim, o link mostra só número e estado (G6)');
select ok(reservation_for_customer((select id from t where nome = 'r1'), '+5577998128809') ? 'itens', 'com a sessão do telefone, mostra tudo');
select is(jsonb_array_length(whatsapp_my_reservations(array['+5577998128809'])), 0, 'encerradas há mais de 30 dias não entram');
select set_app_clock(interval '0');

select * from finish();
rollback;
