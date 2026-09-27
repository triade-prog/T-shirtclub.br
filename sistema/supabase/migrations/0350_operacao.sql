-- 0350 · Operação: o Kanban do dia (27/09)
-- O painel mostra as reservas pelo próximo passo, em 5 colunas; cada uma aparece em uma só.
-- É uma visão: nada muda de estado por aqui, o botão do cartão leva à tela da ação válida.
--   ACAO        cancelamento pendente, pagamento em análise, contestação aberta ou frete vencido
--   AGUARDANDO  reserva ativa esperando o pagamento
--   PAGO        paga, com a entrega por escolher, o frete por calcular ou por pagar
--   ENTREGA     em preparação, pronta para retirada, saiu para entrega ou enviada
--   CONCLUIDO   entregue hoje
-- Expiradas ficam de fora (estão na lista de reservas), a não ser que peçam ação.

create index if not exists reservations_entregue_idx on reservations (delivered_at) where status = 'ENTREGUE';

create function admin_operation_board() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with base as (
    select r.*,
           f.substatus as sub,
           coalesce(f.mode, r.delivery_intent) as entrega,
           exists (select 1 from cancellation_requests c where c.reservation_id = r.id and c.status = 'PENDENTE') as cancelamento,
           exists (select 1 from payment_reviews v where v.reservation_id = r.id and v.status = 'ABERTA') as analise,
           exists (select 1 from payment_disputes d where d.reservation_id = r.id and d.status = 'ABERTA') as contestacao
      from reservations r
      left join fulfillments f on f.reservation_id = r.id and f.closed_at is null
     where (r.status = 'RESERVADO' and reservation_is_live(r))
        or r.status = 'PAGAMENTO_CONFIRMADO'
        or (r.status = 'ENTREGUE' and r.delivered_at >= inicio_do_dia())
        or exists (select 1 from payment_reviews v where v.reservation_id = r.id and v.status = 'ABERTA')
        or exists (select 1 from payment_disputes d where d.reservation_id = r.id and d.status = 'ABERTA')
  ), classificada as (
    select b.*,
           case
             when b.cancelamento or b.analise or b.contestacao or b.sub = 'FRETE_VENCIDO' then 'ACAO'
             when b.status = 'RESERVADO' then 'AGUARDANDO'
             when b.status = 'PAGAMENTO_CONFIRMADO' and b.sub in ('EM_PREPARACAO', 'PRONTO_PARA_RETIRADA', 'SAIU_PARA_ENTREGA', 'ENVIADO') then 'ENTREGA'
             when b.status = 'PAGAMENTO_CONFIRMADO' then 'PAGO'
             when b.status = 'ENTREGUE' then 'CONCLUIDO'
           end as coluna,
           -- O que é mais urgente primeiro; concluídos, o mais recente
           case
             when b.status = 'ENTREGUE' and not (b.cancelamento or b.analise or b.contestacao) then -extract(epoch from b.delivered_at)
             else extract(epoch from coalesce(case when b.status = 'RESERVADO' then b.expires_at end, b.payment_confirmed_at, b.created_at))
           end as ordem
      from base b
  ), numerada as (
    select c.*, row_number() over (partition by c.coluna order by c.ordem, c.number) as posicao
      from classificada c
     where c.coluna is not null
  ), cartoes as (
    select n.coluna, n.posicao,
           reservation_summary_json(r) || jsonb_strip_nulls(jsonb_build_object(
             'nome', n.customer_name,
             'telefone', n.phone_e164,
             'entrega', n.entrega,
             'club', exists (select 1 from reservation_discounts d join promotions p on p.id = d.promotion_id
                              where d.reservation_id = n.id and p.buy_more_mode = 'PRECO_POR_GRUPO'),
             'hoje', greatest(n.created_at, n.payment_confirmed_at, n.delivered_at) >= inicio_do_dia(),
             'motivos', nullif(array_remove(array[
                          case when n.cancelamento then 'CANCELAMENTO' end,
                          case when n.analise then 'PAGAMENTO_EM_ANALISE' end,
                          case when n.contestacao then 'CONTESTACAO' end,
                          case when n.sub = 'FRETE_VENCIDO' then 'FRETE_VENCIDO' end], null), '{}'),
             'notaCancelamento', (select c.customer_note from cancellation_requests c where c.reservation_id = n.id and c.status = 'PENDENTE'),
             'freteAte', (select q.pay_until from shipping_quotes q where q.reservation_id = n.id and q.status = 'AGUARDANDO_PAGAMENTO'
                           order by q.calculated_at desc limit 1),
             'pagaEm', n.payment_confirmed_at,
             'entregueEm', n.delivered_at)) as cartao
      from numerada n
      join reservations r on r.id = n.id
     where n.posicao <= 100
  )
  select jsonb_build_object(
    'agora', app_now(),
    'resumo', jsonb_build_object(
      'ativas', (select count(*) from classificada where status = 'RESERVADO'),
      'precisamDeAcao', (select count(*) from classificada where coluna = 'ACAO' or (coluna = 'PAGO' and sub = 'AGUARDANDO_CALCULO_FRETE')),
      'pagas', (select count(*) from classificada where status = 'PAGAMENTO_CONFIRMADO'),
      'fretePendente', (select count(*) from classificada where sub in ('AGUARDANDO_CALCULO_FRETE', 'AGUARDANDO_PAGAMENTO_FRETE'))),
    'totais', (select coalesce(jsonb_object_agg(coluna, n), '{}') from (select coluna, count(*) as n from classificada where coluna is not null group by coluna) t),
    'colunas', jsonb_build_object(
      'ACAO', (select coalesce(jsonb_agg(cartao order by posicao), '[]') from cartoes where coluna = 'ACAO'),
      'AGUARDANDO', (select coalesce(jsonb_agg(cartao order by posicao), '[]') from cartoes where coluna = 'AGUARDANDO'),
      'PAGO', (select coalesce(jsonb_agg(cartao order by posicao), '[]') from cartoes where coluna = 'PAGO'),
      'ENTREGA', (select coalesce(jsonb_agg(cartao order by posicao), '[]') from cartoes where coluna = 'ENTREGA'),
      'CONCLUIDO', (select coalesce(jsonb_agg(cartao order by posicao), '[]') from cartoes where coluna = 'CONCLUIDO')))
$$;

call lock_down_public();
