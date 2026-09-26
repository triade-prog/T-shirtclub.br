begin;
select plan(32);

-- Hash de mentira no formato do HMAC (64 hexadecimais): h('482193')
create function pg_temp.h(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
create function pg_temp.tentativa(p_phone text, p_token text) returns jsonb language sql as $$
  select create_reservation_attempt(jsonb_build_object(
    'nome', 'Marina', 'telefone', p_phone, 'entrega', 'RETIRADA', 'itens', '[{"produtoId": "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f", "qtd": 1}]'::jsonb,
    'totalEsperadoCentavos', 4999, 'tokenHash', pg_temp.h(p_token)))
$$;
create temp table t (nome text primary key, v jsonb);

-- Tentativa com referência curta
insert into t values ('a', pg_temp.tentativa('+5577998128809', 'navegador-1'));
select matches((select v ->> 'ref' from t where nome = 'a'), '^[2-9A-HJ-NP-Z]{4}$', 'referência de 4 caracteres, sem 0, 1, I e O');
select is(attempt_status((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('outro-navegador')), null,
  'só o navegador que criou acompanha a tentativa (G12)');
select is(attempt_status((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('navegador-1')) ->> 'situacao', 'AGUARDANDO_MENSAGEM',
  'antes da mensagem, aguarda');

-- Mensagem pelo WhatsApp: remetente conferido, com e sem o nono dígito
select is(otp_issue_code((select v ->> 'ref' from t where nome = 'a'), array['+5577988887777', '+557788887777'], pg_temp.h('000000'), 'w0') ->> 'acao',
  'NUMERO_DIFERENTE', 'outro número não recebe código');
select is(otp_issue_code('ZZZZ', array['+5577998128809'], pg_temp.h('000000'), 'w0') ->> 'acao', 'REFERENCIA_INVALIDA', 'referência desconhecida');
select is(otp_issue_code(lower((select v ->> 'ref' from t where nome = 'a')), array['+557798128809', '+5577998128809'], pg_temp.h('111111'), 'w1') ->> 'acao',
  'ENVIAR_CODIGO', 'o próprio número (em qualquer forma) recebe o código');
select is(attempt_status((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('navegador-1')) -> 'codigo' ->> 'tentativasRestantes', '2',
  'a tela mostra o campo do código com 2 tentativas');
select is(otp_issue_code((select v ->> 'ref' from t where nome = 'a'), array['+5577998128809'], pg_temp.h('222222'), 'w2') ->> 'acao',
  'AGUARDE', 'menos de 30 s depois, não gera outro código');

-- Erros no código
select is(otp_verify((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('navegador-1'), pg_temp.h('999999')),
  '{"erro": "OTP_INVALID", "detalhes": {"tentativasRestantes": 1}}'::jsonb, '1º erro: resta 1 tentativa');
select is(otp_verify((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('navegador-1'), pg_temp.h('999999')) -> 'detalhes',
  '{"tentativasRestantes": 0, "podePedirOutro": true}'::jsonb, '2º erro: o código esgota, mas ainda pode pedir outro');
select is(otp_verify((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('outro-navegador'), pg_temp.h('111111')) ->> 'erro',
  'NOT_FOUND', 'outro navegador não confirma');

-- Reenvio e acerto
select set_app_clock(interval '31 seconds');
select is(otp_issue_code((select v ->> 'ref' from t where nome = 'a'), array['+5577998128809'], pg_temp.h('333333'), 'w3') ->> 'codigosRestantes',
  '1', 'segundo código: resta 1 reenvio');
select is(otp_verify((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('navegador-1'), pg_temp.h('333333')), '{"ok": true}'::jsonb,
  'código certo verifica');
select is(attempt_status((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('navegador-1')) ->> 'situacao', 'VERIFICADA',
  'tentativa verificada por 10 minutos (R8)');
select is(otp_verify((select (v ->> 'id')::uuid from t where nome = 'a'), pg_temp.h('navegador-1'), pg_temp.h('000000')), '{"ok": true}'::jsonb,
  'confirmar de novo dentro dos 10 minutos não pede outro código');
select is((select count(*)::int from audit_log where action = 'otp.verificado'), 1, 'verificação vai para a auditoria');

-- Código vencido
select set_app_clock(interval '0');
insert into t values ('b', pg_temp.tentativa('+5571991112222', 'navegador-2'));
select otp_issue_code((select v ->> 'ref' from t where nome = 'b'), array['+5571991112222'], pg_temp.h('444444'), 'w4');
select set_app_clock(interval '6 minutes');
select is(otp_verify((select (v ->> 'id')::uuid from t where nome = 'b'), pg_temp.h('navegador-2'), pg_temp.h('444444')) ->> 'erro',
  'OTP_EXPIRED', 'código vale 5 minutos');

-- T9: 2 erros, 2 reenvios, 2 erros no último código → bloqueio de 30 min
select set_app_clock(interval '0');
insert into t values ('c', pg_temp.tentativa('+5575993334444', 'navegador-3'));
create function pg_temp.pedir(p_seg int, p_code text) returns jsonb language sql as $$
  select set_app_clock(make_interval(secs => p_seg));
  select otp_issue_code((select v ->> 'ref' from t where nome = 'c'), array['+5575993334444'], pg_temp.h(p_code), 'c' || p_seg)
$$;
create function pg_temp.errar() returns jsonb language sql as $$
  select otp_verify((select (v ->> 'id')::uuid from t where nome = 'c'), pg_temp.h('navegador-3'), pg_temp.h('errado'))
$$;
select pg_temp.pedir(0, '1'); select pg_temp.errar(); select pg_temp.errar();
select pg_temp.pedir(40, '2'); select pg_temp.errar(); select pg_temp.errar();
select pg_temp.pedir(80, '3'); select pg_temp.errar();
select is(pg_temp.errar() ->> 'erro', 'OTP_LOCKED', 'o 2º erro no último código bloqueia');
select is((pg_temp.errar() -> 'detalhes' ->> 'ate')::timestamptz, app_now() + interval '30 minutes', 'bloqueio de 30 minutos');
select is(attempt_status((select (v ->> 'id')::uuid from t where nome = 'c'), pg_temp.h('navegador-3')) ->> 'situacao', 'BLOQUEADA',
  'a tela mostra o bloqueio');
select is(pg_temp.tentativa('+5575993334444', 'navegador-4') ->> 'erro', 'OTP_LOCKED', 'recomeçar o fluxo continua bloqueado (R16)');
select set_app_clock(interval '80 seconds' + interval '31 minutes');
select isnt(pg_temp.tentativa('+5575993334444', 'navegador-4') ->> 'ref', null, 'passados 30 minutos, pode tentar de novo');

-- Quarto pedido de código também bloqueia
select set_app_clock(interval '0');
insert into t values ('d', pg_temp.tentativa('+5573995556666', 'navegador-5'));
create function pg_temp.pedir_d(p_seg int) returns jsonb language sql as $$
  select set_app_clock(make_interval(secs => p_seg));
  select otp_issue_code((select v ->> 'ref' from t where nome = 'd'), array['+5573995556666'], pg_temp.h('d' || p_seg), 'd' || p_seg)
$$;
select pg_temp.pedir_d(0); select pg_temp.pedir_d(40); select pg_temp.pedir_d(80);
select is(pg_temp.pedir_d(120) ->> 'acao', 'BLOQUEADO', 'pedir um quarto código bloqueia');

-- Telefone bloqueado por abuso não cria tentativa
select set_app_clock(interval '0');
insert into customers (id, phone_e164) values ('00000000-0000-4000-8000-0000000000c9', '+5577911112222');
insert into phone_blocks (customer_id) values ('00000000-0000-4000-8000-0000000000c9');
select is(pg_temp.tentativa('+5577911112222', 'n') ->> 'erro', 'PHONE_BLOCKED', 'telefone com reservas pausadas não pede código');

-- Fila de mensagens
select isnt(enqueue_message('reserva_criada:1', '+5577998128809', 'reserva_criada', '{"nome": "Marina", "link": "https://x/r#k"}', 1::smallint), null, 'mensagem entra na fila');
select is(enqueue_message('reserva_criada:1', '+5577998128809', 'reserva_criada', '{}', 1::smallint), null, 'a mesma mensagem não entra duas vezes');
update app_settings set value = 'false' where key = 'notificacoes_opcionais';
select is(enqueue_message('pedido_entregue:1', '+5577998128809', 'pedido_entregue', '{}', 2::smallint, p_optional => true), null,
  'opcional desligada no painel não entra');
select enqueue_message('lembrete:velho', '+5577998128809', 'reserva_lembrete_5min', '{}', 1::smallint, app_now() - interval '1 second');
select is(outbox_claim() ->> 'template', 'reserva_criada', 'sai a próxima válida; a vencida é descartada');
select outbox_result((select id from outbox_messages where dedupe_key = 'reserva_criada:1'), true, 'zapi-1');
select is((select params from outbox_messages where dedupe_key = 'reserva_criada:1'), '{"nome": "Marina"}'::jsonb, 'o link com a chave sai da fila depois do envio');
select is(outbox_claim(), null, 'ritmo: nada sai antes do intervalo mínimo');

-- Entrada: uma vez só por mensagem
select is(inbound_register('m1', '5577998128809', 'Quero meu código') ->> 'novo', 'true', 'mensagem nova');
select is(inbound_register('m1', '5577998128809', 'Quero meu código') ->> 'novo', 'false', 'reenvio da mesma mensagem é ignorado');

select * from finish();
rollback;
