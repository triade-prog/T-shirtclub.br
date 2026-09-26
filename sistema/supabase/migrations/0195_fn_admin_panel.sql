-- 0195 · Painel completo (F10, seção 11): dashboard, busca e detalhe da reserva, auditoria,
-- WhatsApp (fila, ritmo, modo lançamento e notificações) e os aparelhos conectados da conta.
-- Tudo só leitura, menos as configurações do WhatsApp, que ficam na auditoria.

-- Início do dia na loja (America/Bahia).
create function inicio_do_dia() returns timestamptz
language sql stable
as $$ select date_trunc('day', app_now() at time zone 'America/Bahia') at time zone 'America/Bahia' $$;

-- ─── Apoio ──────────────────────────────────────────────────────────────────────────

create function whatsapp_queue_stats() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pendentes', (select count(*) from outbox_messages where status in ('PENDENTE', 'ENVIANDO')),
    'enviadasHoje', (select count(*) from outbox_messages where sent_at >= inicio_do_dia()),
    'falhasHoje', (select count(*) from outbox_messages where status = 'FALHOU' and created_at >= inicio_do_dia()),
    'descartadasHoje', (select count(*) from outbox_messages where status = 'DESCARTADA' and created_at >= inicio_do_dia()),
    'maisAntigaPendente', (select min(created_at) from outbox_messages where status = 'PENDENTE'))
$$;

create function admin_name(p_id uuid) returns text
language sql stable
set search_path = public
as $$ select name from admin_users where id = p_id $$;

-- Assunto da ação, para os filtros da tela.
create function audit_subject(p_action text) returns text
language sql immutable
as $$
  select case
    when p_action ~ '^(reserva|tentativa|cancelamento|entrega|tolerancia|consulta)\.' then 'RESERVA'
    when p_action ~ '^(pagamento|frete)\.' then 'PAGAMENTO'
    when p_action ~ '^estoque\.' then 'ESTOQUE'
    when p_action ~ '^(produto|colecao|look|inicio)\.' then 'CATALOGO'
    when p_action ~ '^(promocao|cupom)\.' then 'PROMOCAO'
    when p_action ~ '^telefone\.' then 'BLOQUEIO'
    when p_action ~ '^(otp|whatsapp)\.' then 'WHATSAPP'
    when p_action ~ '^admin\.' then 'ACESSO'
    else 'OUTRO' end
$$;

create function audit_json(a audit_log) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id, 'em', a.occurred_at, 'ator', a.actor_type, 'atorNome', admin_name(a.actor_id),
    'assunto', audit_subject(a.action), 'acao', a.action, 'entidade', a.entity_type, 'entidadeId', a.entity_id,
    'reservaId', a.reservation_id, 'reservaNumero', (select number from reservations where id = a.reservation_id),
    'dados', nullif(a.data, '{}'::jsonb)))
$$;

-- ─── Dashboard ───────────────────────────────────────────────────────────────────────

create function admin_dashboard() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reservas', jsonb_build_object(
      'ativas', (select count(*) from reservations r where r.status = 'RESERVADO' and reservation_is_live(r)),
      'pagas', (select count(*) from reservations where status = 'PAGAMENTO_CONFIRMADO'),
      'expiradasHoje', (select count(*) from reservations where status = 'EXPIRADO' and expired_at >= inicio_do_dia()),
      'entreguesHoje', (select count(*) from reservations where status = 'ENTREGUE' and delivered_at >= inicio_do_dia())),
    -- O que pede ação da loja
    'acoes', jsonb_build_object(
      'cancelamentosPendentes', (select count(*) from cancellation_requests where status = 'PENDENTE'),
      'pagamentosEmAnalise', (select count(*) from payment_reviews where status = 'ABERTA'),
      'disputasAbertas', (select count(*) from payment_disputes where status = 'ABERTA'),
      'telefonesBloqueados', (select count(*) from phone_blocks where status = 'ATIVO'),
      'alertasAbertos', (select count(*) from system_alerts where resolved_at is null),
      'fretes', jsonb_build_object(
        'aguardandoCalculo', (select count(*) from fulfillments where closed_at is null and substatus = 'AGUARDANDO_CALCULO_FRETE'),
        'aguardandoPagamento', (select count(*) from shipping_quotes where status = 'AGUARDANDO_PAGAMENTO'),
        'pertoDeVencer', (select count(*) from shipping_quotes where status = 'AGUARDANDO_PAGAMENTO' and pay_until < app_now() + interval '30 minutes'),
        'vencidos', (select count(*) from fulfillments where closed_at is null and substatus = 'FRETE_VENCIDO')),
      'aguardandoModalidade', (select count(*) from fulfillments where closed_at is null and substatus = 'AGUARDANDO_MODALIDADE'),
      'emPreparacao', (select count(*) from fulfillments where closed_at is null and substatus = 'EM_PREPARACAO')),
    'fila', whatsapp_queue_stats(),
    'agora', app_now())
$$;

-- ─── Busca e detalhe da reserva ──────────────────────────────────────────────────────
-- q: número (com ou sem #), parte do telefone (só dígitos) ou parte do nome.

create function admin_search_reservations(p_status reservation_status default null, p_q text default null, p_page integer default 1)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_digitos text := regexp_replace(coalesce(v_q, ''), '\D', '', 'g');
  v_nome text;
  v_pagina integer := greatest(coalesce(p_page, 1), 1);
  v_total integer;
  v_itens jsonb;
begin
  if v_q is not null and v_digitos = '' then
    v_nome := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with achadas as (
    select r.* from reservations r
     where (p_status is null or r.status = p_status)
       and (v_q is null
            or (v_nome is not null and r.customer_name ilike v_nome)
            or (v_nome is null and v_digitos <> '' and (
                  (length(v_digitos) <= 7 and r.number = v_digitos::integer)
                  or (length(v_digitos) >= 4 and r.phone_e164 like '%' || v_digitos || '%'))))
  )
  select (select count(*) from achadas),
         (select coalesce(jsonb_agg(reservation_summary_json(a) || jsonb_build_object('nome', a.customer_name, 'telefone', a.phone_e164)
                                    order by a.created_at desc, a.number desc), '[]')
            from (select * from achadas order by created_at desc, number desc limit 20 offset (v_pagina - 1) * 20) a)
    into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'pagina', v_pagina, 'porPagina', 20, 'total', v_total);
end $$;

-- Detalhe completo: a reserva como a cliente vê, mais a entrega com endereço, a linha do
-- tempo, pagamentos, pedidos de cancelamento, análises, disputas, a cliente e a auditoria.
create function admin_reservation_detail(p_id uuid) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select reservation_json(r) || jsonb_build_object(
    'logistica', (select fulfillment_json(f, true) from fulfillments f where f.reservation_id = r.id),
    'entregueEm', r.delivered_at, 'entreguePor', admin_name(r.delivered_by),
    'transicoes', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'evento', t.event, 'de', t.from_status, 'para', t.to_status, 'ator', t.actor_type,
                     'atorNome', admin_name(t.actor_id), 'motivo', t.reason, 'em', t.created_at)) order by t.id), '[]')
                     from reservation_transitions t where t.reservation_id = r.id),
    'pagamentos', (select coalesce(jsonb_agg(payment_json(p) - 'pix' || jsonb_strip_nulls(jsonb_build_object(
                     'statusProvedor', p.provider_status, 'motivoAnalise', p.review_reason)) order by p.created_at), '[]')
                     from payments p where p.reservation_id = r.id),
    'cancelamentos', (select coalesce(jsonb_agg(cancellation_json(c) || jsonb_strip_nulls(jsonb_build_object('decididoPor', admin_name(c.decided_by)))
                        order by c.requested_at), '[]')
                        from cancellation_requests c where c.reservation_id = r.id),
    'analises', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', v.id, 'motivo', v.reason, 'status', v.status,
                   'resolucao', v.resolution, 'nota', v.note, 'criadaEm', v.created_at)) order by v.created_at), '[]')
                   from payment_reviews v where v.reservation_id = r.id),
    'disputas', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', d.id, 'tipo', d.kind, 'status', d.status,
                   'abertaEm', d.opened_at, 'nota', d.note)) order by d.opened_at), '[]')
                   from payment_disputes d where d.reservation_id = r.id),
    'cliente', jsonb_build_object(
      'bloqueado', phone_is_blocked(r.phone_e164),
      'reservas', (select count(*) from reservations x where x.customer_id = r.customer_id),
      'expiracoes30Dias', (select count(*) from reservations x where x.customer_id = r.customer_id and x.status = 'EXPIRADO'
                             and x.closure_reason = 'PRAZO_ESGOTADO' and x.expired_at > app_now() - interval '30 days')),
    'auditoria', (select coalesce(jsonb_agg(audit_json(a) order by a.occurred_at, a.id), '[]')
                    from (select * from audit_log where reservation_id = r.id order by occurred_at desc, id desc limit 100) a))
  from reservations r where r.id = p_id
$$;

-- ─── Auditoria (tela 21) ─────────────────────────────────────────────────────────────

create function admin_list_audit(p_actor actor_type default null, p_subject text default null, p_since timestamptz default null,
                                 p_entity text default null, p_entity_id text default null, p_page integer default 1) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with achados as (
    select * from audit_log a
     where (p_actor is null or a.actor_type = p_actor)
       and (p_subject is null or audit_subject(a.action) = p_subject)
       and (p_since is null or a.occurred_at >= p_since)
       and (p_entity is null or a.entity_type = p_entity)
       and (p_entity_id is null or a.entity_id = p_entity_id)
  )
  select jsonb_build_object(
    'itens', (select coalesce(jsonb_agg(audit_json(x) order by x.occurred_at desc, x.id desc), '[]')
                from (select * from achados order by occurred_at desc, id desc limit 50 offset (greatest(coalesce(p_page, 1), 1) - 1) * 50) x),
    'pagina', greatest(coalesce(p_page, 1), 1), 'porPagina', 50, 'total', (select count(*) from achados))
$$;

-- ─── WhatsApp (tela 18, G5) ──────────────────────────────────────────────────────────

create function admin_whatsapp_settings() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'modoLancamento', setting('modo_lancamento') = 'true'::jsonb,
    'ritmo', jsonb_build_object('intervaloMinS', setting_int('fila_intervalo_min_s'), 'intervaloMaxS', setting_int('fila_intervalo_max_s'),
                                'tetoHora', setting_int('fila_teto_hora')),
    'ritmoLancamento', jsonb_build_object('intervaloMinS', setting_int('lancamento_intervalo_min_s'),
                                          'intervaloMaxS', setting_int('lancamento_intervalo_max_s'), 'tetoHora', setting_int('lancamento_teto_hora')),
    'desligadas', setting('notificacoes_desligadas'),
    'fila', whatsapp_queue_stats())
$$;

create function set_setting(p_key text, p_value jsonb, p_admin uuid) returns boolean
language plpgsql
set search_path = public
as $$
begin
  update app_settings set value = p_value, updated_at = now(), updated_by = p_admin where key = p_key and value is distinct from p_value;
  return found;
end $$;

-- p: {modoLancamento?, ritmo?: {intervaloMinS, intervaloMaxS, tetoHora}, ritmoLancamento?: {...},
--     desligadas?: [modelos]}. Intervalo mínimo de 2 s, máximo maior que o mínimo (até 60 s)
-- e de 10 a 1000 mensagens por hora. Cada mudança vai para a auditoria.
create function admin_update_whatsapp_settings(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mudou text[] := '{}';
  v_modo text;
  v_ritmo jsonb;
begin
  perform admin_guard(p_admin);
  foreach v_modo in array array['ritmo', 'ritmoLancamento'] loop
    v_ritmo := p -> v_modo;
    continue when v_ritmo is null;
    if jsonb_typeof(v_ritmo -> 'intervaloMinS') <> 'number' or jsonb_typeof(v_ritmo -> 'intervaloMaxS') <> 'number'
       or jsonb_typeof(v_ritmo -> 'tetoHora') <> 'number'
       or (v_ritmo ->> 'intervaloMinS')::int < 2 or (v_ritmo ->> 'intervaloMaxS')::int <= (v_ritmo ->> 'intervaloMinS')::int
       or (v_ritmo ->> 'intervaloMaxS')::int > 60 or (v_ritmo ->> 'tetoHora')::int not between 10 and 1000 then
      raise exception 'Ritmo inválido: mínimo de 2 s, máximo maior que o mínimo (até 60 s) e de 10 a 1000 por hora' using errcode = 'TS180';
    end if;
    -- Soma, e não "or": as três precisam ser gravadas
    if set_setting(case v_modo when 'ritmo' then 'fila_intervalo_min_s' else 'lancamento_intervalo_min_s' end, v_ritmo -> 'intervaloMinS', p_admin)::int
       + set_setting(case v_modo when 'ritmo' then 'fila_intervalo_max_s' else 'lancamento_intervalo_max_s' end, v_ritmo -> 'intervaloMaxS', p_admin)::int
       + set_setting(case v_modo when 'ritmo' then 'fila_teto_hora' else 'lancamento_teto_hora' end, v_ritmo -> 'tetoHora', p_admin)::int > 0 then
      v_mudou := v_mudou || v_modo;
    end if;
  end loop;

  if p ? 'modoLancamento' then
    if jsonb_typeof(p -> 'modoLancamento') <> 'boolean' then
      raise exception 'modoLancamento precisa ser verdadeiro ou falso' using errcode = 'TS180';
    end if;
    if set_setting('modo_lancamento', p -> 'modoLancamento', p_admin) then
      v_mudou := v_mudou || 'modoLancamento'::text;
    end if;
  end if;

  if p ? 'desligadas' then
    if jsonb_typeof(p -> 'desligadas') <> 'array'
       or exists (select 1 from jsonb_array_elements(p -> 'desligadas') x where jsonb_typeof(x) <> 'string' or x #>> '{}' !~ '^[a-z][a-z0-9_]{2,40}$') then
      raise exception 'Lista de notificações inválida' using errcode = 'TS180';
    end if;
    if set_setting('notificacoes_desligadas',
                   (select coalesce(jsonb_agg(distinct x order by x), '[]') from jsonb_array_elements(p -> 'desligadas') x), p_admin) then
      v_mudou := v_mudou || 'notificacoes'::text;
    end if;
  end if;

  if cardinality(v_mudou) > 0 then
    perform log_audit('ADMIN', p_admin, 'whatsapp.configuracao', 'app_settings', 'whatsapp', null,
                      jsonb_build_object('mudou', to_jsonb(v_mudou), 'modo_lancamento', setting('modo_lancamento'),
                                         'desligadas', setting('notificacoes_desligadas')));
  end if;
  return admin_whatsapp_settings();
end $$;

-- Mensagem de teste para um número da equipe: entra na fila como as outras.
create function admin_whatsapp_test(p_admin uuid, p_phone text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform admin_guard(p_admin);
  v_id := enqueue_message('teste:' || gen_random_uuid(), p_phone, 'mensagem_teste', '{}'::jsonb, 2::smallint, app_now() + interval '1 hour');
  perform log_audit('ADMIN', p_admin, 'whatsapp.teste', 'outbox_message', v_id::text);
  return v_id;
end $$;

-- ─── Minha conta: aparelhos conectados (sessões do Supabase Auth) ────────────────────
-- IP mostrado só em parte (G9); a sessão atual vem marcada.

create function admin_list_sessions(p_admin uuid, p_current uuid default null) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', s.id, 'criadaEm', s.created_at, 'ultimoUso', coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
    'aparelho', left(s.user_agent, 200),
    'rede', case when family(s.ip) = 4 then regexp_replace(host(s.ip), '\.\d+\.\d+$', '.*.*')
                 when s.ip is not null then split_part(host(s.ip), ':', 1) || ':' || split_part(host(s.ip), ':', 2) || ':…' end,
    'atual', s.id = p_current))
    order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc), '[]')
  from auth.sessions s
  where s.user_id = p_admin and (s.not_after is null or s.not_after > now())
$$;
