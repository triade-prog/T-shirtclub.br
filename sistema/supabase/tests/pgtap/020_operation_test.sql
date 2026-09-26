begin;
select plan(33);

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1');
insert into admin_users (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Carol');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-00000000c001', 'Limone', 'limone', 'LIMAO');
insert into products (id, collection_id, code, slug, name, price_cents, qty_total) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001', 'LIM-01', 'limone-1', 'Limone Amalfi', 4999, 20);
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-00000000a001', 'produtos/lim-01.webp', 'FRENTE', 'Frente', 10, 10, 1);
update products set published_at = app_now();

create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.reservar(p_phone text, p_entrega delivery_mode default 'RETIRADA') returns uuid language plpgsql as $$
declare s uuid; a uuid; v_token text := gen_random_uuid()::text;
begin
  insert into otp_sessions (phone_e164, purpose, status, verified_at) values (p_phone, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
  insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                    status, verified_until, browser_token_hash, ip_hash)
  values (gen_attempt_ref(), 'Marina', p_phone, p_entrega, '[{"produtoId": "00000000-0000-4000-8000-00000000a001", "qtd": 1}]', 4999, s,
          'VERIFICADA', app_now() + interval '10 minutes', pg_temp.h(v_token), pg_temp.h('ip'))
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

insert into t values ('ativa', pg_temp.reservar('+5577998128809'));
insert into t values ('paga', pg_temp.reservar('+5571991112222', 'MOTOBOY'));
select pg_temp.pagar((select id from t where nome = 'paga'), '+5571991112222');

-- ── Verificador de invariantes do estoque ──
select is(check_stock_invariants() ->> 'divergencias', '0', 'estoque confere com as reservas');
select ok((select last_ok_at is not null from job_heartbeats where job = 'invariantes'), 'o verificador marca o pulso');
update products set qty_reserved = qty_reserved + 1;
select is(check_stock_invariants() -> 'produtos' -> 0, '{"codigo": "LIM-01", "reservado": 2, "esperadoReservado": 1, "vendido": 1, "esperadoVendido": 1}'::jsonb,
  'divergência aparece com o que falta');
select is((select (kind, data ->> 'codigo')::text from system_alerts where resolved_at is null), '(ESTOQUE_DIVERGENTE,LIM-01)', 'e vira alerta no painel');
select check_stock_invariants();
select is((select occurrences from system_alerts where resolved_at is null), 2, 'a mesma causa não abre outro alerta');
update products set qty_reserved = qty_reserved - 1;
select check_stock_invariants();
select is((select count(*)::int from system_alerts where resolved_at is null), 0, 'corrigido, o alerta se fecha sozinho');

-- ── Alertas no painel ──
select open_alert('TESTE_MANUAL', 'teste:1', 'Alerta de teste');
select is(jsonb_array_length(admin_list_alerts()), 1, 'lista os abertos');
select is((admin_dashboard() -> 'acoes' ->> 'alertasAbertos')::int, 1, 'o dashboard conta os alertas');
select throws_ok(format($$ select admin_resolve_alert(%L, %L, '') $$, (select id from system_alerts where key = 'teste:1'), :admin), 'TS121', null,
  'resolver pede observação');
select is(admin_resolve_alert((select id from system_alerts where key = 'teste:1'), :admin, 'Conferido com a loja') ->> 'resolvidoPor', 'Carol', 'resolvido, com quem');
select throws_ok(format($$ select admin_resolve_alert(%L, %L, 'De novo') $$, (select id from system_alerts where key = 'teste:1'), :admin), 'TS161', null,
  'não resolve duas vezes');
select is(jsonb_array_length(admin_list_alerts(false)), 2, 'os resolvidos ficam no histórico');

-- ── Saúde dos jobs ──
select job_heartbeat('varredura');
select job_heartbeat('frete');
select is(check_job_health() ->> 'ok', 'true', 'tudo em dia');
select set_app_clock(interval '3 minutes');
select is(check_job_health() -> 'problemas', '[{"tipo": "JOB_ATRASADO", "job": "varredura"}]'::jsonb, 'varredura parada há 3 min: atrasada');
select is((select count(*)::int from system_alerts where key = 'job:varredura' and resolved_at is null), 1, 'e vira alerta');
select job_heartbeat('varredura');
select is(check_job_health() ->> 'ok', 'true', 'voltou a rodar');
select is((select count(*)::int from system_alerts where key = 'job:varredura' and resolved_at is null), 0, 'o alerta se fecha sozinho');
select job_heartbeat('varredura', 'erro simulado');
select is((select (last_error is not null and last_ok_at is not null)::text from job_heartbeats where job = 'varredura'), 'true', 'o erro fica registrado');
insert into outbox_messages (dedupe_key, phone_e164, template, created_at, next_attempt_at)
values ('parada-1', '+5577998128809', 'mensagem_teste', app_now() - interval '11 minutes', app_now() - interval '11 minutes');
select is(check_job_health() -> 'problemas', '[{"tipo": "FILA_PARADA"}]'::jsonb, 'mensagem esperando há mais de 10 min: fila parada');
delete from outbox_messages where dedupe_key = 'parada-1';
select set_app_clock(interval '0');

-- ── Prazos de guarda (G9, D15) ──
-- Dia 0: dados que vão vencer
update fulfillments set address = '{"cep": "45000000", "rua": "Rua das Flores", "numero": "12", "bairro": "Centro", "cidade": "Vitória da Conquista", "uf": "BA"}',
       confirmed_at = app_now(), closed_at = app_now()
 where reservation_id = (select id from t where nome = 'paga');
insert into otp_sessions (id, phone_e164, purpose) values ('00000000-0000-4000-8000-00000000b001', '+5575993334444', 'RESERVA');
insert into reservation_attempts (id, ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id, browser_token_hash)
values ('00000000-0000-4000-8000-00000000b002', 'ZZZZ', 'Ana', '+5575993334444', 'RETIRADA', '[{"produtoId": "x", "qtd": 1}]', 4999,
        '00000000-0000-4000-8000-00000000b001', pg_temp.h('b'));
select create_lookup_attempt('+5575993334444', 'CONSULTA', null, pg_temp.h('c'));
select create_customer_session('+5577998128809', pg_temp.h('sessao-velha'), 'TELEFONE');
select log_audit('CLIENTE', null, 'teste.ip', 'teste', '1', null, '{}', pg_temp.h('ip-velho'));
insert into whatsapp_inbound (wa_message_id, from_wa_id, text) values ('in-velha', 'hash', 'Oi, meu nome é Ana');
insert into outbox_messages (dedupe_key, phone_e164, template, status, sent_at) values ('enviada-velha', '+5577998128809', 'mensagem_teste', 'ENVIADA', app_now());

-- Dia 40: passaram 30 dias
select set_app_clock(interval '40 days');
select create_customer_session('+5577998128809', pg_temp.h('sessao-nova'), 'TELEFONE');
select log_audit('CLIENTE', null, 'teste.ip', 'teste', '2', null, '{}', pg_temp.h('ip-novo'));
select is(purge_personal_data() - 'ipsAuditoria' - 'mensagensEnviadas' - 'textosRecebidos' - 'enderecos',
  '{"tentativas": 1, "consultas": 1, "sessoesCodigo": 4, "sessoesCliente": 1}'::jsonb, '30 dias: tentativas, consultas, sessões do código e da cliente');
select is((select count(*)::int from reservation_attempts where id = '00000000-0000-4000-8000-00000000b002'), 0, 'tentativa não convertida apagada');
select is((select count(*)::int from reservation_attempts where status = 'CONVERTIDA' and (otp_session_id is not null or ip_hash is not null)), 0,
  'as convertidas ficam, sem a sessão do código e sem o IP');
select is((select count(*)::int from reservations), 2, 'as reservas ficam');
select is((select array_agg(entity_id order by id) from audit_log where action = 'teste.ip' and ip_hash is not null), array['2'], 'IP da auditoria some depois de 30 dias');
select is((select count(*)::int from audit_log where action = 'teste.ip'), 2, 'a linha da auditoria fica');
select throws_ok($$ update audit_log set ip_hash = null where action = 'teste.ip' $$, 'TS010', null, 'fora da rotina, a auditoria continua sem update');
select is((select text from whatsapp_inbound where wa_message_id = 'in-velha'), 'Oi, meu nome é Ana', 'o texto recebido fica até 90 dias');
select ok((select address ? 'rua' from fulfillments where reservation_id = (select id from t where nome = 'paga')), 'o endereço fica até 90 dias depois da entrega');

-- Dia 95: passaram 90 dias
select set_app_clock(interval '95 days');
select is(purge_personal_data() - 'tentativas' - 'consultas' - 'sessoesCodigo' - 'sessoesCliente' - 'ipsAuditoria',
  '{"textosRecebidos": 1, "mensagensEnviadas": 1, "enderecos": 1}'::jsonb, '90 dias: texto recebido, mensagens enviadas e endereço');
select is((select (text is null)::text from whatsapp_inbound where wa_message_id = 'in-velha'), 'true', 'o texto sai, fica o registro de que houve mensagem');
select is((select address from fulfillments where reservation_id = (select id from t where nome = 'paga')), '{"uf": "BA", "cidade": "Vitória da Conquista"}'::jsonb,
  'do endereço fica só a cidade (D15)');
select is((select data from audit_log where action = 'dados.purga' order by id desc limit 1) ->> 'enderecos', '1', 'a rotina fica na auditoria, só com números');
select ok((select last_ok_at is not null from job_heartbeats where job = 'purga'), 'e marca o pulso');
select set_app_clock(interval '0');

select * from finish();
rollback;
