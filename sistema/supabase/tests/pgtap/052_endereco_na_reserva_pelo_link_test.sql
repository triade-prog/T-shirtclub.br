begin;
select plan(14);

-- Endereço guardado na reserva do painel pelo link (0620): a entrega nasce combinada no pagamento.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999);
update product_variants v set qty_total = 10 from products p where p.id = v.product_id and v.size = 'UNICO';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
select id, 'produtos/' || lower(code) || '.webp', 'FRENTE', 'Frente', 10, 10, 1 from products;
update products set published_at = app_now();

create temp table t (nome text primary key, id uuid);
create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.manual(p_telefone text, p_entrega text) returns uuid language sql as $$
  select (admin_create_reservation('00000000-0000-4000-8000-0000000000d1', jsonb_build_object(
    'nome', 'Ana Paula', 'telefone', p_telefone, 'entrega', p_entrega, 'pagamento', 'LINK',
    'linhas', jsonb_build_array(jsonb_build_object('produtoId', '00000000-0000-4000-8000-00000000a001',
      'varianteId', testes.unico('00000000-0000-4000-8000-00000000a001'), 'qtd', 1, 'precoTabelaCentavos', 4999,
      'descontoPromoCentavos', 0, 'descontoManualCentavos', 0, 'descontoCentavos', 0, 'totalCentavos', 4999)),
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'descontoManualCentavos', 0, 'totalCentavos', 4999,
    'aplicada', null, 'chaveHash', pg_temp.h(gen_random_uuid()::text), 'link', 'https://tshirtclub.vercel.app/r#abc')) -> 'reserva' ->> 'id')::uuid
$$;
create function pg_temp.pagar(p_reserva uuid, p_phone text) returns void language plpgsql as $$
declare v uuid;
begin
  v := (register_payment_attempt(p_reserva, p_phone, 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid;
  update payments set provider_payment_id = 'mp-' || left(v::text, 8) where id = v;
  perform apply_payment_result(v, jsonb_build_object('status', 'APROVADO', 'aprovadoEm', app_now(), 'valorCentavos', 4999,
    'moeda', 'BRL', 'referencia', v::text, 'statusProvedor', 'approved'));
end $$;
create temp table e as select '{"cep": "46400000", "rua": "R. Sátiro Santos", "numero": "38", "bairro": "Centro", "cidade": "Caetité", "uf": "BA"}'::jsonb as a;

insert into t values ('moto', pg_temp.manual('+5577990000001', 'MOTOBOY'));
insert into t values ('sem', pg_temp.manual('+5577990000002', 'MOTOBOY'));
insert into t values ('retira', pg_temp.manual('+5577990000003', 'RETIRADA'));
insert into t values ('desiste', pg_temp.manual('+5577990000004', 'ENVIO'));

-- ── Guardar ──
select throws_ok(format('select admin_prefill_address(%L, %L, %L)', '00000000-0000-4000-8000-0000000000d1',
  (select id from t where nome = 'moto'), '{"cep": "123"}'), 'TS120', null, 'endereço incompleto é recusado');
select throws_ok(format('select admin_prefill_address(%L, %L, %L)', '00000000-0000-4000-8000-0000000000d1',
  (select id from t where nome = 'retira'), (select a from e)), 'TS175', null, 'retirada não guarda endereço');
select throws_ok(format('select admin_prefill_address(%L, %L, %L)', '00000000-0000-4000-8000-0000000000d9',
  (select id from t where nome = 'moto'), (select a from e)), null, null, 'só a equipe guarda');
select is(admin_prefill_address('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'moto'), (select a from e)),
  '{"ok": true}'::jsonb, 'a loja guarda o endereço');
select is(admin_reservation_detail((select id from t where nome = 'moto')) -> 'enderecoPrevio', (select a from e), 'o detalhe mostra o endereço guardado');
select ok(not (admin_reservation_detail((select id from t where nome = 'sem')) ? 'enderecoPrevio'), 'sem endereço, nada a mostrar');
select is((select data from audit_log where action = 'entrega.endereco_previo'), '{"modalidade": "MOTOBOY"}'::jsonb, 'a auditoria não leva o endereço');

-- ── Pagar ──
select pg_temp.pagar((select id from t where nome = 'moto'), '+5577990000001');
select is((select (f.mode, f.substatus, f.address = (select a from e), f.confirmed_at is not null)::text
             from fulfillments f join t on t.id = f.reservation_id where t.nome = 'moto'),
  '(MOTOBOY,AGUARDANDO_CALCULO_FRETE,t,t)', 'paga, a entrega já nasce combinada e vai para o cálculo do frete');
select is((select prefilled_address from reservations r join t on t.id = r.id where t.nome = 'moto'), null, 'e o endereço sai da reserva');
select is((select o.params ->> 'entrega' from outbox_messages o join t on t.id = o.reservation_id
            where t.nome = 'moto' and o.template = 'pagamento_confirmado'), 'MOTOBOY', 'a mensagem não pede a escolha no site');

select pg_temp.pagar((select id from t where nome = 'sem'), '+5577990000002');
select is((select f.substatus::text from fulfillments f join t on t.id = f.reservation_id where t.nome = 'sem'),
  'AGUARDANDO_MODALIDADE', 'sem endereço guardado, a cliente informa no site como antes');
select ok((select not o.params ? 'entrega' from outbox_messages o join t on t.id = o.reservation_id
            where t.nome = 'sem' and o.template = 'pagamento_confirmado'), 'e a mensagem pede a escolha');

-- ── Encerrar sem pagar ──
select admin_prefill_address('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'desiste'), (select a from e));
select admin_cancel_reservation('00000000-0000-4000-8000-0000000000d1', (select id from t where nome = 'desiste'), 'Cliente desistiu');
select is((select prefilled_address from reservations r join t on t.id = r.id where t.nome = 'desiste'), null,
  'a reserva encerrada não guarda o endereço');

select ok(not has_function_privilege('anon', 'admin_prefill_address(uuid, uuid, jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'admin_prefill_address(uuid, uuid, jsonb)', 'execute'), 'fechado ao público');

select * from finish();
rollback;
