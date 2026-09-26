begin;
select plan(40);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d2');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999, 20);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-00000000a001', 'produtos/lim-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.reservar(p_phone text, p_nome text) returns uuid language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash)
  values (gen_attempt_ref(), p_nome, p_phone, 'RETIRADA', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999, s,
          'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token))
  returning id into a;
  return (create_reservation(a, pg_temp.h(v_token), jsonb_build_object(
    'linhas', '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1, "precoTabelaCentavos": 4999, "descontoCentavos": 0, "totalCentavos": 4999}]'::jsonb,
    'subtotalCentavos', 4999, 'descontoCentavos', 0, 'totalCentavos', 4999, 'aplicada', null,
    'chaveHash', pg_temp.h(v_token || 'k'), 'link', 'https://tshirtclub.pt/r#x')) -> 'reserva' ->> 'id')::uuid;
end $$;
create function pg_temp.pagar(p_reserva uuid, p_phone text) returns void language plpgsql as $$
declare v uuid := (register_payment_attempt(p_reserva, p_phone, 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid;
begin
  perform apply_payment_result(v, jsonb_build_object('status', 'APROVADO', 'aprovadoEm', app_now(), 'valorCentavos', 4999,
    'moeda', 'BRL', 'referencia', v::text, 'statusProvedor', 'approved'));
end $$;
create temp table t (nome text primary key, id uuid);
\set admin '''00000000-0000-4000-8000-0000000000d1'''

insert into t values ('ativa', pg_temp.reservar('+5577998128809', 'Marina Souza'));
insert into t values ('paga', pg_temp.reservar('+5571991112222', 'Luana Alves'));
select pg_temp.pagar((select id from t where nome = 'paga'), '+5571991112222');
insert into t values ('expirada', pg_temp.reservar('+5575993334444', 'Ana Costa'));
select expire_reservation((select id from t where nome = 'expirada'), 'PRAZO_ESGOTADO');
select request_cancellation((select id from t where nome = 'ativa'), '+5577998128809');

-- ── Dashboard ──
select is(admin_dashboard() -> 'reservas', '{"ativas": 1, "pagas": 1, "expiradasHoje": 1, "entreguesHoje": 0}'::jsonb, 'contadores das reservas');
select is((admin_dashboard() -> 'acoes' ->> 'cancelamentosPendentes')::int, 1, 'o que pede ação: cancelamento pendente');
select is((admin_dashboard() -> 'acoes' ->> 'aguardandoModalidade')::int, 1, 'e o pedido pago esperando a cliente escolher a entrega');
select ok((admin_dashboard() -> 'fila' ->> 'pendentes')::int >= 3, 'e a fila do WhatsApp');

-- ── Busca ──
select is(jsonb_array_length(admin_search_reservations(null, '#' || (select number from reservations where id = (select id from t where nome = 'paga'))) -> 'itens'),
  1, 'busca pelo número, com #');
select is(admin_search_reservations(null, '99812') -> 'itens' -> 0 ->> 'id', (select id::text from t where nome = 'ativa'), 'busca por parte do telefone');
select is(admin_search_reservations(null, 'luana') -> 'itens' -> 0 ->> 'nome', 'Luana Alves', 'busca pelo nome, sem diferenciar maiúsculas');
select is((admin_search_reservations(null, '%') ->> 'total')::int, 0, '% no nome não vira curinga');
select is((admin_search_reservations('EXPIRADO', null) ->> 'total')::int, 1, 'filtro por estado');
select is(admin_search_reservations(null, null) - 'itens', '{"pagina": 1, "porPagina": 20, "total": 3}'::jsonb, 'paginada, 20 por página');
select ok((admin_search_reservations(null, null) -> 'itens' -> 0) ?& array['numero', 'status', 'nome', 'telefone', 'pecas', 'totalCentavos'],
  'cada linha tem o que a tabela do painel mostra');

-- ── Detalhe com linha do tempo ──
select approve_cancellation((select id from cancellation_requests), :admin, 'Cliente pediu pelo WhatsApp');
select is((select array_agg(x ->> 'evento') from jsonb_array_elements(admin_reservation_detail((select id from t where nome = 'paga')) -> 'transicoes') x),
  array['T1', 'T2'], 'linha do tempo das transições');
select is(jsonb_array_length(admin_reservation_detail((select id from t where nome = 'paga')) -> 'pagamentos'), 1, 'os pagamentos');
select ok(admin_reservation_detail((select id from t where nome = 'paga')) -> 'logistica' ? 'codigoRetirada', 'a entrega completa, com o código de retirada');
select is(admin_reservation_detail((select id from t where nome = 'ativa')) -> 'cancelamentos' -> 0 ->> 'decididoPor', 'Carol', 'quem decidiu o cancelamento');
select is(admin_reservation_detail((select id from t where nome = 'ativa')) -> 'transicoes' -> 1 ->> 'atorNome', 'Carol', 'e quem fez a transição');
select ok(admin_reservation_detail((select id from t where nome = 'ativa')) -> 'auditoria' @> '[{"acao": "reserva.criada"}]', 'a auditoria da reserva');
select is(admin_reservation_detail((select id from t where nome = 'expirada')) -> 'cliente', '{"bloqueado": false, "reservas": 1, "expiracoes30Dias": 1}'::jsonb,
  'o histórico da cliente');
select is(admin_reservation_detail(gen_random_uuid()), null, 'reserva que não existe');

-- ── Auditoria ──
select is(audit_subject('frete.pago'), 'PAGAMENTO', 'frete é assunto de pagamento');
select is(audit_subject('telefone.liberado'), 'BLOQUEIO', 'telefone é assunto de bloqueio');
select is(audit_subject('admin.login'), 'ACESSO', 'login é assunto de acesso');
select ok((select bool_and(x ->> 'assunto' = 'PAGAMENTO') from jsonb_array_elements(admin_list_audit(p_subject => 'PAGAMENTO') -> 'itens') x),
  'filtro por assunto');
select ok((select bool_and(x ->> 'ator' = 'ADMIN' and x ->> 'atorNome' = 'Carol') from jsonb_array_elements(admin_list_audit('ADMIN') -> 'itens') x),
  'filtro por autor, com o nome do administrador');
select is(admin_list_audit(p_entity => 'reservation', p_entity_id => (select id::text from t where nome = 'ativa')) -> 'itens' -> 0 ->> 'reservaNumero',
  (select number::text from reservations where id = (select id from t where nome = 'ativa')), 'consulta por entidade, com o número da reserva');
select is(admin_list_audit(p_since => app_now() + interval '1 minute') -> 'total', '0'::jsonb, 'filtro por período');

-- ── WhatsApp: ritmo, modo lançamento e notificações ──
select throws_ok(format($$ select admin_update_whatsapp_settings(%L, '{"ritmo": {"intervaloMinS": 1, "intervaloMaxS": 9, "tetoHora": 120}}') $$, :admin),
  'TS180', null, 'intervalo mínimo de 2 s');
select throws_ok(format($$ select admin_update_whatsapp_settings(%L, '{"ritmo": {"intervaloMinS": 5, "intervaloMaxS": 5, "tetoHora": 120}}') $$, :admin),
  'TS180', null, 'máximo maior que o mínimo');
select throws_ok($$ select admin_update_whatsapp_settings(gen_random_uuid(), '{"modoLancamento": true}') $$, 'TS122', null, 'só administrador ativo');
select is(admin_update_whatsapp_settings(:admin, '{"modoLancamento": true, "ritmo": {"intervaloMinS": 5, "intervaloMaxS": 10, "tetoHora": 100}}')
  - 'fila' - 'desligadas' - 'ritmoLancamento',
  '{"modoLancamento": true, "ritmo": {"intervaloMinS": 5, "intervaloMaxS": 10, "tetoHora": 100}}'::jsonb, 'salva o ritmo e liga o modo lançamento');
select is((select data -> 'mudou' from audit_log where action = 'whatsapp.configuracao' order by id desc limit 1), '["ritmo", "modoLancamento"]'::jsonb,
  'a mudança vai para a auditoria');
select admin_update_whatsapp_settings(:admin, '{"modoLancamento": true}');
select is((select count(*)::int from audit_log where action = 'whatsapp.configuracao'), 1, 'salvar sem mudar nada não enche a auditoria');
select is(admin_update_whatsapp_settings(:admin, '{"desligadas": ["frete_calculado", "cancelamento_recebido", "frete_calculado"]}') -> 'desligadas',
  '["cancelamento_recebido", "frete_calculado"]'::jsonb, 'desliga notificações');
select is(enqueue_message('teste-x1', '+5577998128809', 'cancelamento_recebido', '{}', 2::smallint, null, null, null, true), null,
  'notificação desligada não entra na fila');
select isnt(enqueue_message('teste-x2', '+5577998128809', 'cancelamento_aprovado', '{}', 2::smallint, null, null, null, true), null,
  'as outras continuam');
select isnt(enqueue_message('teste-x3', '+5577998128809', 'cancelamento_recebido', '{}', 2::smallint), null, 'essencial nunca é desligada');
insert into t select 'teste', admin_whatsapp_test(:admin, '+5577998155772');
select is((select template from outbox_messages where id = (select id from t where nome = 'teste')), 'mensagem_teste', 'mensagem de teste entra na fila');

-- ── Aparelhos conectados ──
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at, user_agent, ip, aal) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000d1', now() - interval '2 days', now() - interval '1 day', null, 'Firefox no Windows', '200.1.2.3', 'aal2'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000000d1', now() - interval '1 hour', now(), null, 'Safari no iPhone', '2804:14c:5b8:1::1', 'aal2'),
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-0000000000d2', now(), now(), null, 'Outro usuário', '10.0.0.1', 'aal1');
select is(jsonb_array_length(admin_list_sessions(:admin, '00000000-0000-4000-8000-00000000e002')), 2, 'só as sessões da conta');
select is(admin_list_sessions(:admin, '00000000-0000-4000-8000-00000000e002') -> 0 ->> 'atual', 'true', 'a atual primeiro, marcada');
select is(admin_list_sessions(:admin, '00000000-0000-4000-8000-00000000e002') -> 1 ->> 'rede', '200.1.*.*', 'IP só em parte (G9)');

select * from finish();
rollback;
