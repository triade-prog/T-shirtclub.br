-- 0600 · Histórico de cancelamentos e de pagamentos no painel (03/10, pedido da loja depois do
-- primeiro cancelamento real: "Cancelamentos não consta o cancelamento que foi feito e em
-- Pagamentos em análise não tem o histórico dos pagamentos, nem em análise, nem cancelado, nem
-- aprovado").
--   · Cancelamentos mostrava só os pedidos das clientes (cancellation_requests). Os cancelamentos
--     da loja (0590, motivo CANCELADA_PELA_LOJA) passam a vir numa lista própria, com o motivo,
--     quem cancelou e o estorno, lidos da auditoria (reserva.cancelada).
--   · Pagamentos mostrava só a fila de análise. Agora há a lista de todos os pagamentos, dos mais
--     novos aos mais antigos, por grupo (aprovados, aguardando, em análise, estornados, não pagos),
--     com o total de cada grupo para as abas.

create function admin_list_store_cancellations(p_limit integer default 100) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x.j order by x.em desc), '[]')
  from (
    select r.expired_at as em, jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'canceladaEm', r.expired_at, 'canceladaPor', admin_name(a.actor_id), 'motivo', a.data ->> 'motivo',
      'pago', r.payment_confirmed_at is not null,
      'estornoCentavos', nullif((a.data ->> 'estorno_cents')::integer, 0),
      'porForaCentavos', (a.data ->> 'por_fora_cents')::integer,
      'reserva', jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'nome', r.customer_name,
                                    'telefone', r.phone_e164, 'totalCentavos', r.total_cents))) as j
      from reservations r
      left join lateral (select l.actor_id, l.data from audit_log l
                          where l.reservation_id = r.id and l.action = 'reserva.cancelada'
                          order by l.occurred_at desc, l.id desc limit 1) a on true
     where r.closure_reason::text = 'CANCELADA_PELA_LOJA'
     order by r.expired_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))) x
$$;

-- Os grupos das abas: os status do provedor em palavras da loja
create function payment_group(p_status payment_status) returns text
language sql immutable
as $$
  select case p_status::text
    when 'APROVADO' then 'APROVADO'
    when 'CRIADO' then 'AGUARDANDO' when 'PENDENTE' then 'AGUARDANDO'
    when 'EM_ANALISE' then 'EM_ANALISE'
    when 'ESTORNADO' then 'ESTORNADO'
    else 'NAO_PAGO' end
$$;

create function admin_list_payments(p_grupo text default null, p_limit integer default 100) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'totais', (select coalesce(jsonb_object_agg(g.grupo, g.n), '{}') from (
                 select payment_group(status) as grupo, count(*) as n from payments group by 1) g),
    'itens', (select coalesce(jsonb_agg(payment_json(p) - 'pix' || jsonb_strip_nulls(jsonb_build_object(
                'grupo', payment_group(p.status), 'statusProvedor', p.provider_status, 'idProvedor', p.provider_payment_id,
                'provedor', p.provider, 'motivoAnalise', p.review_reason, 'aplicado', p.applied,
                'estornadoEm', (select min(d.opened_at) from payment_disputes d where d.payment_id = p.id and d.kind in ('ESTORNO', 'CANCELAMENTO')),
                'reserva', jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'nome', r.customer_name,
                                              'telefone', r.phone_e164, 'totalCentavos', r.total_cents)))
                order by p.created_at desc, p.id), '[]')
                from (select * from payments
                       where p_grupo is null or payment_group(status) = p_grupo
                       order by created_at desc, id
                       limit greatest(1, least(coalesce(p_limit, 100), 500))) p
                join reservations r on r.id = p.reservation_id))
$$;

create index payments_recentes_idx on payments (created_at desc);

call lock_down_public();
