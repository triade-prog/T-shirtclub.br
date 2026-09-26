begin;
select plan(46);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Loja');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999, 20);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-00000000a001', 'produtos/lim-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
update products set published_at = app_now();
update app_settings set value = '"Rua da Loja, 10"' where key = 'loja_endereco_retirada';

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.reservar(p_phone text, p_entrega delivery_mode) returns uuid language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), 'Marina', p_phone, p_entrega, '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999, s,
          'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return (create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1, "precoTabelaCentavos": 4999, "descontoCentavos": 0, "totalCentavos": 4999}]'::jsonb,
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'totalCentavos', 4999, 'aplicada', null,
    'chaveHash', pg_temp.h(v_token || 'k'), 'link', 'https://tshirtclub.pt/r#x')) -> 'reserva' ->> 'id')::uuid;
end $$;
create function pg_temp.aprovar(p_pagamento uuid, p_valor integer) returns jsonb language sql as $$
  select apply_payment_result(p_pagamento, jsonb_build_object('status', 'APROVADO', 'aprovadoEm', app_now(), 'valorCentavos', p_valor,
    'moeda', 'BRL', 'referencia', p_pagamento::text, 'statusProvedor', 'approved'))
$$;
create function pg_temp.pagar(p_reserva uuid, p_phone text) returns void language sql as $$
  select pg_temp.aprovar((register_payment_attempt(p_reserva, p_phone, 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid, 4999)
$$;
create function pg_temp.frete(p_reserva uuid, p_phone text, p_chave uuid default gen_random_uuid()) returns jsonb language sql as $$
  select register_shipping_payment(p_reserva, p_phone, 'PIX', p_chave)
$$;
create temp table t (nome text primary key, id uuid);
create temp table endereco as select '{"cep": "45000000", "rua": "Rua das Flores", "numero": "12", "bairro": "Centro", "cidade": "Vitória da Conquista", "uf": "BA"}'::jsonb as a;
\set admin '''00000000-0000-4000-8000-0000000000d1'''

-- ── Motoboy: endereço, frete, segundo pagamento, saiu para entrega e Entregue ──
insert into t values ('r1', pg_temp.reservar('+5577998128809', 'MOTOBOY'));
select is(set_fulfillment((select id from t where nome = 'r1'), '+5577998128809', 'RETIRADA') ->> 'erro', 'NOT_PAID', 'antes de pagar, não há entrega');
select pg_temp.pagar((select id from t where nome = 'r1'), '+5577998128809');
select is((select (mode, substatus)::text from fulfillments where reservation_id = (select id from t where nome = 'r1')),
  '(MOTOBOY,AGUARDANDO_MODALIDADE)', 'o pagamento (T2) cria a entrega na modalidade da reserva');
select ok((select pickup_code ~ '^[2-9A-HJ-NP-Z]{6}$' and pickup_code <> (select number::text from reservations where id = reservation_id)
             from fulfillments where reservation_id = (select id from t where nome = 'r1')), 'código de retirada aleatório, sem 0/O e 1/I (G15)');
select is(reservation_for_customer((select id from t where nome = 'r1'), '+5577998128809') -> 'logistica' ->> 'substatus', 'AGUARDANDO_MODALIDADE',
  'a reserva da cliente mostra a entrega');
select ok(not (reservation_for_customer((select id from t where nome = 'r1'), '+5577998128809') -> 'logistica' ? 'codigoRetirada'),
  'sem retirada confirmada, o código não aparece');
select is(set_fulfillment((select id from t where nome = 'r1'), '+5571999999999', 'RETIRADA') ->> 'erro', 'NOT_FOUND', 'de outro telefone, 404');
select is(set_fulfillment((select id from t where nome = 'r1'), '+5577998128809', 'MOTOBOY') ->> 'erro', 'VALIDATION_ERROR', 'motoboy exige endereço');
select is(set_fulfillment((select id from t where nome = 'r1'), '+5577998128809', 'MOTOBOY', (select a - 'uf' from endereco)) ->> 'erro',
  'VALIDATION_ERROR', 'endereço incompleto é recusado');
select is(set_fulfillment((select id from t where nome = 'r1'), '+5577998128809', 'MOTOBOY', (select a from endereco)) -> 'logistica' ->> 'substatus',
  'AGUARDANDO_CALCULO_FRETE', 'com endereço, espera o cálculo do frete');
select is(reservation_for_customer((select id from t where nome = 'r1'), '+5577998128809') -> 'logistica' -> 'endereco',
  '{"uf": "BA", "bairro": "Centro", "cidade": "Vitória da Conquista"}'::jsonb, 'a cliente vê só bairro, cidade e UF (G6)');
select is(frete ->> 'erro', 'DELIVERY_LOCKED', 'sem frete informado, não há o que pagar')
  from (select pg_temp.frete((select id from t where nome = 'r1'), '+5577998128809') as frete) x;
select throws_ok(format('select admin_shipping_quote(%L, %L, 0)', (select id from t where nome = 'r1'), :admin), '23514', null, 'frete precisa de valor');
select is(admin_shipping_quote((select id from t where nome = 'r1'), :admin, 1200, 1, 'Entrega amanhã') ->> 'substatus', 'AGUARDANDO_PAGAMENTO_FRETE',
  'o painel informa o frete');
select is((select pay_until - calculated_at from shipping_quotes where reservation_id = (select id from t where nome = 'r1')), interval '2 hours',
  '2 h para pagar (regra 17)');
select is((select params ->> 'valorCentavos' from outbox_messages where template = 'frete_calculado'), '1200', 'a cliente recebe o valor no WhatsApp');
select is(register_shipping_payment((select id from t where nome = 'r1'), '+5577998128809', 'CARTAO', gen_random_uuid()) ->> 'erro', 'METHOD_LOCKED',
  'o frete é pago pela mesma forma dos produtos');
insert into t values ('k1', gen_random_uuid());
insert into t values ('f1', (pg_temp.frete((select id from t where nome = 'r1'), '+5577998128809', (select id from t where nome = 'k1')) -> 'pagamento' ->> 'id')::uuid);
select is((select (purpose, amount_cents, status)::text from payments where id = (select id from t where nome = 'f1')), '(FRETE,1200,CRIADO)',
  'segundo pagamento, só do frete');
select is((pg_temp.frete((select id from t where nome = 'r1'), '+5577998128809', (select id from t where nome = 'k1')) -> 'pagamento' ->> 'id')::uuid,
  (select id from t where nome = 'f1'), 'o mesmo clique devolve a mesma cobrança');
select is(pg_temp.frete((select id from t where nome = 'r1'), '+5577998128809') ->> 'erro', 'PAYMENT_IN_PROGRESS', 'uma cobrança de frete por vez');
select throws_ok(format('select deliver_reservation(%L, %L)', (select id from t where nome = 'r1'), :admin), 'TS174', null,
  'sem frete pago e sem sair para entrega, não entrega');
select is(pg_temp.aprovar((select id from t where nome = 'f1'), 1200) ->> 'resultado', 'CONFIRMADO', 'frete aprovado');
select is((select (q.status, f.substatus)::text from shipping_quotes q join fulfillments f using (reservation_id)
            where q.reservation_id = (select id from t where nome = 'r1')), '(PAGO,EM_PREPARACAO)', 'frete pago: em preparação');
select is((select status from reservations where id = (select id from t where nome = 'r1')), 'PAGAMENTO_CONFIRMADO'::reservation_status,
  'o frete não muda o estado oficial');
select is(set_fulfillment((select id from t where nome = 'r1'), '+5577998128809', 'RETIRADA') ->> 'erro', 'SHIPPING_ALREADY_PAID',
  'depois de pagar o frete, a modalidade não muda');
select throws_ok(format('select admin_set_substatus(%L, %L, %L)', (select id from t where nome = 'r1'), :admin, 'PRONTO_PARA_RETIRADA'), 'TS172', null,
  'motoboy não fica pronto para retirada');
select is(admin_set_substatus((select id from t where nome = 'r1'), :admin, 'SAIU_PARA_ENTREGA') ->> 'substatus', 'SAIU_PARA_ENTREGA', 'saiu para entrega');
select is(deliver_reservation((select id from t where nome = 'r1'), :admin, 'Entregue ao porteiro') ->> 'status', 'ENTREGUE', 'T5: Entregue');
select is((select array_agg(event order by id) from reservation_transitions where reservation_id = (select id from t where nome = 'r1')),
  array['T1', 'T2', 'T5'], 'linha do tempo T1 → T2 → T5');
select throws_ok(format('select deliver_reservation(%L, %L)', (select id from t where nome = 'r1'), :admin), 'TS161', null, 'Entregue é final');
select is((select count(*)::int from outbox_messages where template in ('entrega_confirmada', 'frete_confirmado', 'saiu_entrega', 'pedido_entregue')), 4,
  'cada passo avisa a cliente');

-- ── Retirada: código visível, pronto para retirada, disputa trava o Entregue (T21) ──
insert into t values ('r2', pg_temp.reservar('+5571991112222', 'RETIRADA'));
select pg_temp.pagar((select id from t where nome = 'r2'), '+5571991112222');
select is(set_fulfillment((select id from t where nome = 'r2'), '+5571991112222', 'RETIRADA') -> 'logistica' ->> 'substatus', 'EM_PREPARACAO',
  'retirada confirmada vai direto para a preparação');
select is(reservation_for_customer((select id from t where nome = 'r2'), '+5571991112222') -> 'logistica' ->> 'codigoRetirada',
  (select pickup_code from fulfillments where reservation_id = (select id from t where nome = 'r2')), 'a cliente vê o código de retirada');
select throws_ok(format('select admin_shipping_quote(%L, %L, 1200)', (select id from t where nome = 'r2'), :admin), 'TS172', null, 'retirada não tem frete');
select throws_ok(format('select admin_set_substatus(%L, %L, %L, %L)', (select id from t where nome = 'r2'), :admin, 'PRONTO_PARA_RETIRADA', 'AB123'),
  'TS121', null, 'rastreio só no envio');
select is(admin_set_substatus((select id from t where nome = 'r2'), :admin, 'PRONTO_PARA_RETIRADA') ->> 'substatus', 'PRONTO_PARA_RETIRADA', 'pronto para retirada');
select is((select params from outbox_messages where template = 'pronto_retirada'),
  jsonb_build_object('numero', (select number from reservations where id = (select id from t where nome = 'r2')),
                     'codigo', (select pickup_code from fulfillments where reservation_id = (select id from t where nome = 'r2')), 'endereco', 'Rua da Loja, 10'),
  'a mensagem leva o código e o endereço da loja');
insert into payment_disputes (payment_id, reservation_id, kind, provider_status)
select id, reservation_id, 'CONTESTACAO', 'charged_back' from payments where reservation_id = (select id from t where nome = 'r2');
select throws_ok(format('select deliver_reservation(%L, %L)', (select id from t where nome = 'r2'), :admin), 'TS173', null,
  'contestação aberta: Entregue recusado (T21, G2)');
select resolve_dispute((select id from payment_disputes where reservation_id = (select id from t where nome = 'r2')), :admin, 'Cliente desistiu da contestação');
select is(deliver_reservation((select id from t where nome = 'r2'), :admin) ->> 'status', 'ENTREGUE', 'resolvida a disputa, entrega');

-- ── Troca de modalidade com cobrança de frete em aberto ──
insert into t values ('r3', pg_temp.reservar('+5575993334444', 'ENVIO'));
select pg_temp.pagar((select id from t where nome = 'r3'), '+5575993334444');
select set_fulfillment((select id from t where nome = 'r3'), '+5575993334444', 'ENVIO', (select a from endereco));
select admin_shipping_quote((select id from t where nome = 'r3'), :admin, 2500, 5);
insert into t values ('f3', (pg_temp.frete((select id from t where nome = 'r3'), '+5575993334444') -> 'pagamento' ->> 'id')::uuid);
select payment_created((select id from t where nome = 'f3'), '{"providerPaymentId": "mp-f3", "statusProvedor": "pending"}');
select is(set_fulfillment((select id from t where nome = 'r3'), '+5575993334444', 'RETIRADA') -> 'logistica' ->> 'substatus', 'EM_PREPARACAO',
  'antes de pagar o frete, a cliente pode trocar para retirada');
select ok(payments_to_check() -> 'cancelar' @> jsonb_build_array(jsonb_build_object('id', (select id from t where nome = 'f3'))),
  'a cobrança do frete antigo é cancelada no provedor');
select is(pg_temp.aprovar((select id from t where nome = 'f3'), 2500) ->> 'motivo', 'FRETE_ENCERRADO', 'se ainda assim aprovar, vai para análise');
select throws_ok(format('select review_convert(%L, %L, null, %L)', (select id from payment_reviews where payment_id = (select id from t where nome = 'f3')),
  :admin, repeat('a', 64)), 'TS164', null, 'frete não vira pedido novo: a loja estorna');

-- ── Frete não pago em 2 h (D8) ──
insert into t values ('r4', pg_temp.reservar('+5579997778888', 'MOTOBOY'));
select pg_temp.pagar((select id from t where nome = 'r4'), '+5579997778888');
select set_fulfillment((select id from t where nome = 'r4'), '+5579997778888', 'MOTOBOY', (select a from endereco));
select admin_shipping_quote((select id from t where nome = 'r4'), :admin, 900);
insert into t values ('f4', (pg_temp.frete((select id from t where nome = 'r4'), '+5579997778888') -> 'pagamento' ->> 'id')::uuid);
select set_app_clock(interval '2 hours 1 minute');
select is(sweep_shipping_quotes(), 1, 'a varredura marca o frete vencido');
select is((select (f.substatus, r.status)::text from fulfillments f join reservations r on r.id = f.reservation_id
            where f.reservation_id = (select id from t where nome = 'r4')), '(FRETE_VENCIDO,PAGAMENTO_CONFIRMADO)', 'o pedido continua pago, com alerta');
select is(pg_temp.frete((select id from t where nome = 'r4'), '+5579997778888') ->> 'erro', 'QUOTE_EXPIRED', 'nova cobrança do frete vencido é recusada');
select is(pg_temp.aprovar((select id from t where nome = 'f4'), 900) ->> 'resultado', 'CONFIRMADO', 'cobrança feita no prazo e paga depois ainda vale');
select set_app_clock(interval '0');

select * from finish();
rollback;
