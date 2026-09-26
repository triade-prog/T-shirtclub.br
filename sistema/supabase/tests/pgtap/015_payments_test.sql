begin;
select plan(39);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Loja');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Dog Club', 'dog-club', 'MENTA');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'DOG-01', 'dog-1', 'Dog Club Caramelo', 4999, 20);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-00000000a001', 'produtos/dog-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.reservar(p_phone text) returns uuid language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina Souza', p_phone, 'RETIRADA', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 2}]',
          9998, s, 'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return (create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 2, "precoTabelaCentavos": 4999, "descontoCentavos": 0, "totalCentavos": 9998}]'::jsonb,
    'subtotalCentavos', 9998, 'descontoCentavos', 0, 'totalCentavos', 9998, 'aplicada', null,
    'chaveHash', pg_temp.h(v_token || 'k'), 'link', 'https://tshirtclub.pt/r#x')) -> 'reserva' ->> 'id')::uuid;
end $$;
-- Resultado do provedor já conferido pela Edge Function (formato de apply_payment_result)
create function pg_temp.resultado(p_payment uuid, p_status text, p_aprovado timestamptz default null, p_valor int default 9998) returns jsonb language sql as $$
  select jsonb_build_object('status', p_status, 'aprovadoEm', coalesce(p_aprovado, app_now()), 'valorCentavos', p_valor,
                            'moeda', 'BRL', 'referencia', p_payment::text, 'conta', '123', 'statusProvedor', lower(p_status))
$$;
create function pg_temp.pagar(p_reserva uuid, p_phone text, p_forma payment_method, p_chave uuid default gen_random_uuid()) returns uuid language sql as $$
  select (register_payment_attempt(p_reserva, p_phone, p_forma, p_chave) -> 'pagamento' ->> 'id')::uuid
$$;
create temp table t (nome text primary key, id uuid);

-- ─── Tentativa de pagamento ──────────────────────────────────────────────────────────
insert into t values ('r1', pg_temp.reservar('+5577998128809'));
insert into t values ('chave1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into t values ('p1', pg_temp.pagar((select id from t where nome = 'r1'), '+5577998128809', 'PIX', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select is((select (status, amount_cents)::text from payments where id = (select id from t where nome = 'p1')), '(CRIADO,9998)', 'cobrança no valor exato do total');
select is(register_payment_attempt((select id from t where nome = 'r1'), '+5577998128809', 'PIX', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') ->> 'repetido',
  'true', 'o mesmo clique (Idempotency-Key) devolve a mesma tentativa');
select is(register_payment_attempt((select id from t where nome = 'r1'), '+5577998128809', 'PIX', gen_random_uuid()) ->> 'erro',
  'PAYMENT_IN_PROGRESS', 'uma cobrança em curso por vez');
select is(register_payment_attempt((select id from t where nome = 'r1'), '+5571999999999', 'PIX', gen_random_uuid()) ->> 'erro',
  'NOT_FOUND', 'reserva de outro telefone não existe para ela (404)');
select is(payment_created((select id from t where nome = 'p1'), '{"providerPaymentId": "mp-1", "statusProvedor": "pending", "pixCopiaECola": "000201...", "pixExpiraEm": "2030-01-01T00:00:00Z"}') ->> 'status',
  'PENDENTE', 'com o QR do provedor, fica pendente');
select is(has_pending_payment((select id from t where nome = 'r1')), true, 'pagamento pendente segura a reserva');

-- Recusado: pode tentar de novo, mas só pela mesma forma (R11)
select is(apply_payment_result((select id from t where nome = 'p1'), pg_temp.resultado((select id from t where nome = 'p1'), 'RECUSADO')) ->> 'resultado',
  'ATUALIZADO', 'recusa atualiza a tentativa');
select is(register_payment_attempt((select id from t where nome = 'r1'), '+5577998128809', 'CARTAO', gen_random_uuid()) ->> 'erro',
  'METHOD_LOCKED', 'a forma da primeira cobrança fica fixa');
insert into t values ('p2', pg_temp.pagar((select id from t where nome = 'r1'), '+5577998128809', 'PIX'));
select isnt((select id from t where nome = 'p2'), null, 'nova tentativa pela mesma forma');
select payment_created((select id from t where nome = 'p2'), '{"providerPaymentId": "mp-2", "statusProvedor": "pending"}');

-- ─── Conferências (G3) ───────────────────────────────────────────────────────────────
update app_settings set value = '"123"' where key = 'mp_collector_id';
select is(apply_payment_result((select id from t where nome = 'p2'), pg_temp.resultado((select id from t where nome = 'p1'), 'APROVADO')) ->> 'resultado',
  'DESCARTADO', 'referência de outro pagamento é descartada');
select is(apply_payment_result((select id from t where nome = 'p2'), pg_temp.resultado((select id from t where nome = 'p2'), 'APROVADO') || '{"moeda": "USD"}') ->> 'resultado',
  'DESCARTADO', 'outra moeda é descartada');
select is(apply_payment_result((select id from t where nome = 'p2'), pg_temp.resultado((select id from t where nome = 'p2'), 'APROVADO') || '{"conta": "999"}') ->> 'resultado',
  'DESCARTADO', 'pagamento de outra conta é descartado');
select is((select status from reservations where id = (select id from t where nome = 'r1')), 'RESERVADO'::reservation_status, 'e nada muda na reserva');

-- ─── Confirmação (T2) e idempotência (T15) ───────────────────────────────────────────
select is(apply_payment_result((select id from t where nome = 'p2'), pg_temp.resultado((select id from t where nome = 'p2'), 'APROVADO')) ->> 'resultado',
  'CONFIRMADO', 'aprovado dentro do prazo confirma');
select is((select status from reservations where id = (select id from t where nome = 'r1')), 'PAGAMENTO_CONFIRMADO'::reservation_status, 'reserva paga');
select is((select (qty_reserved, qty_sold)::text from products), '(0,2)', 'reservado vira vendido');
select is((select array_agg(event order by id) from reservation_transitions where reservation_id = (select id from t where nome = 'r1')), array['T1', 'T2'], 'linha do tempo T1 → T2');
select is((select template from outbox_messages where reservation_id = (select id from t where nome = 'r1') and template = 'pagamento_confirmado'),
  'pagamento_confirmado', 'mensagem "pagamento confirmado" na fila');
select is((select array_agg(apply_payment_result((select id from t where nome = 'p2'), pg_temp.resultado((select id from t where nome = 'p2'), 'APROVADO')) ->> 'resultado')
             from generate_series(1, 9)), array_fill('ALREADY_APPLIED'::text, array[9]), 'o mesmo aprovado 9 vezes: nenhum efeito (T15)');
select is((select qty_sold from products), 2, 'vendido uma vez só');
select payment_event_register('mercadopago', 'evt-1', 'mp-2', '{}') from generate_series(1, 10);
select is((select count(*)::int from payment_events where provider_event_id = 'evt-1'), 1, 'o mesmo evento do webhook 10 vezes vira 1 linha na inbox');
select throws_ok($$ update payments set applied = true where id = (select id from t where nome = 'p1') $$, '23514', null,
  'o banco recusa aplicar um pagamento que não foi aprovado');

-- ─── Estorno depois de pago abre disputa (G2, T21) ───────────────────────────────────
select is(apply_payment_result((select id from t where nome = 'p2'), pg_temp.resultado((select id from t where nome = 'p2'), 'CONTESTADO')) ->> 'resultado',
  'DISPUTA_ABERTA', 'contestação depois de pago abre disputa');
select is(has_open_dispute((select id from t where nome = 'r1')), true, 'com disputa aberta, o Entregue fica travado');
select is((select status from reservations where id = (select id from t where nome = 'r1')), 'PAGAMENTO_CONFIRMADO'::reservation_status, 'o estado oficial não muda');
select resolve_dispute((select id from payment_disputes), '00000000-0000-4000-8000-0000000000d1', 'Banco devolveu a contestação a favor da loja');
select is(has_open_dispute((select id from t where nome = 'r1')), false, 'resolvida com observação');

-- ─── Valor divergente vai para análise (T20) ─────────────────────────────────────────
insert into t values ('r2', pg_temp.reservar('+5571991112222'));
insert into t values ('p3', pg_temp.pagar((select id from t where nome = 'r2'), '+5571991112222', 'PIX'));
select is(apply_payment_result((select id from t where nome = 'p3'), pg_temp.resultado((select id from t where nome = 'p3'), 'APROVADO', null, 100)) ->> 'motivo',
  'VALOR_DIVERGENTE', 'valor diferente nunca confirma');
select is((select status from reservations where id = (select id from t where nome = 'r2')), 'RESERVADO'::reservation_status, 'a reserva segue como estava');
select is((admin_list_payment_reviews() -> 0 ->> 'motivo'), 'VALOR_DIVERGENTE', 'e o painel vê a análise');

-- ─── Tolerância: PIX aos 14min59s (T17 e T18) ────────────────────────────────────────
select set_app_clock(interval '1 hour');
insert into t values ('r3', pg_temp.reservar('+5575993334444'));
select set_app_clock(interval '1 hour 14 minutes 59 seconds');
insert into t values ('p4', pg_temp.pagar((select id from t where nome = 'r3'), '+5575993334444', 'PIX'));
select payment_created((select id from t where nome = 'p4'), '{"providerPaymentId": "mp-4", "statusProvedor": "pending"}');
select set_app_clock(interval '1 hour 15 minutes 5 seconds');
select is((sweep_reservations() ->> 'tolerancias')::int, 1, 'PIX pendente criado dentro do prazo inicia a tolerância');
select is((select grace_until - expires_at from reservations where id = (select id from t where nome = 'r3')), interval '5 minutes', 'mais 5 minutos');
select is(register_payment_attempt((select id from t where nome = 'r3'), '+5575993334444', 'PIX', gen_random_uuid()) ->> 'erro',
  'DEADLINE_PASSED', 'na tolerância, nenhuma cobrança nova');
select set_app_clock(interval '1 hour 20 minutes 30 seconds');
select is(apply_payment_result((select id from t where nome = 'p4'),
  pg_temp.resultado((select id from t where nome = 'p4'), 'APROVADO', (select created_at from reservations where id = (select id from t where nome = 'r3')) + interval '19 minutes 30 seconds')) ->> 'resultado',
  'CONFIRMADO', 'aprovado aos 19min30s (webhook depois) confirma (T17)');

select set_app_clock(interval '2 hours');
insert into t values ('r4', pg_temp.reservar('+5579997778888'));
select set_app_clock(interval '2 hours 14 minutes');
insert into t values ('p5', pg_temp.pagar((select id from t where nome = 'r4'), '+5579997778888', 'PIX'));
select payment_created((select id from t where nome = 'p5'), '{"providerPaymentId": "mp-5", "statusProvedor": "pending"}');
select set_app_clock(interval '2 hours 15 minutes 1 second');
select sweep_reservations();
select set_app_clock(interval '2 hours 20 minutes 1 second');
select is(jsonb_array_length(payments_to_check() -> 'tolerancias'), 1, 'no fim da tolerância, o worker consulta o provedor');
select is(apply_payment_result((select id from t where nome = 'p5'),
  pg_temp.resultado((select id from t where nome = 'p5'), 'APROVADO', (select created_at from reservations where id = (select id from t where nome = 'r4')) + interval '20 minutes 1 second')) ->> 'motivo',
  'APROVADO_APOS_TOLERANCIA', 'aprovado aos 20min01s vai para análise (T18)');
select is((select status from reservations where id = (select id from t where nome = 'r4')), 'EXPIRADO'::reservation_status, 'e a reserva expira, sem reativar');

-- ─── Análise: converter em novo pedido (D6) ──────────────────────────────────────────
select is((review_convert((select id from payment_reviews where payment_id = (select id from t where nome = 'p5')), '00000000-0000-4000-8000-0000000000d1',
                          'Pagou 1 min depois; ainda temos a peça', pg_temp.h('nova'))) ->> 'status',
  'PAGAMENTO_CONFIRMADO', 'com estoque, vira um pedido novo já pago');
select is((select status from payment_reviews where payment_id = (select id from t where nome = 'p5')), 'RESOLVIDA'::review_status, 'e a análise fecha');

-- ─── Estorno da análise ──────────────────────────────────────────────────────────────
select review_refunded((select id from payment_reviews where payment_id = (select id from t where nome = 'p3')), '00000000-0000-4000-8000-0000000000d1', 'Valor errado');
select is((select status from payments where id = (select id from t where nome = 'p3')), 'ESTORNADO'::payment_status, 'estornado e registrado');

select * from finish();
rollback;
