-- 0610 · Dashboard comercial sem os pedidos cancelados pela loja (03/10, pedido da loja: o
-- dashboard de hoje mostrava 1 pedido pago, ticket de R$ 4,00, 100% de conversão e 1 peça vendida
-- para o pedido de teste que a loja cancelou e estornou; só a receita líquida, R$ 0,00, já
-- descontava). Regra nova: o pedido pago que a loja cancelou (0590, CANCELADA_PELA_LOJA) deixa de
-- ser venda. Sai de pedidos, peças, receita bruta, descontos, frete, ticket médio, Club,
-- coleções, mix e da conversão (nem paga nem encerrada), e o estorno dele também não é
-- descontado, para não descontar duas vezes. Consequência aceita: a venda de um dia some desse dia
-- quando é cancelada depois. Estorno ou cancelamento pelo Mercado Pago num pedido que segue de pé
-- (sem o cancelamento da loja) continua descontado no dia em que chega, como antes.
-- sales_totals passa a contar também os cancelados pela loja no período (canceladosPelaLoja), para a
-- tela explicar.

-- A reserva conta como venda? Tudo, menos o pedido cancelado pela loja.
create function sale_counts(r reservations) returns boolean
language sql immutable
as $$
  select coalesce(r.closure_reason::text, '') <> 'CANCELADA_PELA_LOJA'
$$;

create or replace function sales_totals(p_ini timestamptz, p_fim timestamptz) returns jsonb
language sql stable
set search_path = public
as $$
  with vendas as (
    select r.id, r.subtotal_cents, r.discount_cents, r.payment_method,
           exists (select 1 from reservation_discounts d join promotions p on p.id = d.promotion_id
                    where d.reservation_id = r.id and p.buy_more_mode = 'PRECO_POR_GRUPO') as club
      from reservations r
     where r.payment_confirmed_at >= p_ini and r.payment_confirmed_at < p_fim and sale_counts(r)
  ), estornos as (
    -- Pagamento já aplicado que o provedor estornou ou cancelou vira disputa (0130); conta uma
    -- vez por pagamento, na data da primeira. Contestação (chargeback) em aberto não entra.
    select e.amount_cents from (
      select distinct on (d.payment_id) d.opened_at, p.amount_cents
        from payment_disputes d join payments p on p.id = d.payment_id join reservations r on r.id = p.reservation_id
       where d.kind in ('ESTORNO', 'CANCELAMENTO') and p.applied and sale_counts(r)
       order by d.payment_id, d.opened_at) e
     where e.opened_at >= p_ini and e.opened_at < p_fim
  ), criadas as (
    select r.status, r.payment_confirmed_at from reservations r
     where r.created_at >= p_ini and r.created_at < p_fim and r.status <> 'RESERVADO' and sale_counts(r)
  ), numeros as (
    select (select count(*) from vendas) as pedidos,
           (select coalesce(sum(subtotal_cents), 0) from vendas) as pecas_bruta,
           (select coalesce(sum(discount_cents), 0) from vendas) as descontos,
           (select coalesce(sum(p.amount_cents), 0) from payments p
             where p.purpose = 'FRETE' and p.applied and p.approved_at >= p_ini and p.approved_at < p_fim
               and exists (select 1 from reservations r where r.id = p.reservation_id and sale_counts(r))) as frete,
           (select coalesce(sum(amount_cents), 0) from estornos) as estornos
  )
  select jsonb_build_object(
    'pedidos', n.pedidos,
    'pecasBrutaCentavos', n.pecas_bruta,
    'freteCentavos', n.frete,
    'receitaBrutaCentavos', n.pecas_bruta + n.frete,
    'descontosCentavos', n.descontos,
    'estornosCentavos', n.estornos,
    'receitaLiquidaCentavos', n.pecas_bruta + n.frete - n.descontos - n.estornos,
    'ticketMedioCentavos', case when n.pedidos > 0 then round((n.pecas_bruta - n.descontos)::numeric / n.pedidos)::integer end,
    'pecas', (select coalesce(sum(i.qty), 0) from vendas v join reservation_items i on i.reservation_id = v.id),
    'pedidosClub', (select count(*) from vendas where club),
    'reservasEncerradas', (select count(*) from criadas),
    'reservasPagas', (select count(*) from criadas where payment_confirmed_at is not null),
    -- Para a tela dizer quantos saíram da conta
    'canceladosPelaLoja', (select count(*) from reservations r where r.closure_reason::text = 'CANCELADA_PELA_LOJA'
                             and r.payment_confirmed_at is not null and r.expired_at >= p_ini and r.expired_at < p_fim))
  from numeros n
$$;

CREATE OR REPLACE FUNCTION public.admin_sales_dashboard(p_periodo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agora timestamptz := app_now();
  -- Até agora, o instante de agora incluído (a janela é [início, fim))
  v_fim timestamptz := app_now() + interval '1 microsecond';
  v_hoje timestamptz := inicio_do_dia();
  v_local timestamp := app_now() at time zone 'America/Bahia';
  v_ini timestamptz;
  v_passo interval;
  v_meta integer;
begin
  case p_periodo
    when 'HOJE' then v_ini := v_hoje; v_passo := interval '1 day'; v_meta := setting_int('meta_vendas_dia_centavos');
    when '7_DIAS' then v_ini := v_hoje - interval '6 days'; v_passo := interval '7 days'; v_meta := setting_int('meta_vendas_dia_centavos') * 7;
    when '30_DIAS' then v_ini := v_hoje - interval '29 days'; v_passo := interval '30 days'; v_meta := setting_int('meta_vendas_dia_centavos') * 30;
    when 'MES' then v_ini := date_trunc('month', v_local) at time zone 'America/Bahia'; v_passo := interval '1 month';
                    v_meta := setting_int('meta_vendas_mes_centavos');
    when 'ANO' then v_ini := date_trunc('year', v_local) at time zone 'America/Bahia'; v_passo := interval '1 year';
                    v_meta := setting_int('meta_vendas_ano_centavos');
    else raise exception 'Período inválido' using errcode = 'TS182';
  end case;

  return jsonb_build_object(
    'periodo', p_periodo, 'inicio', v_ini, 'agora', v_agora,
    'atual', sales_totals(v_ini, v_fim),
    'anterior', sales_totals(v_ini - v_passo, v_fim - v_passo),
    'meta', nullif(v_meta, 0),
    -- Receita líquida dos últimos 7 dias, hoje incluído
    'serie', (select jsonb_agg(jsonb_build_object('dia', to_char(d at time zone 'America/Bahia', 'YYYY-MM-DD'),
                                                  'receitaLiquidaCentavos', sales_totals(d, least(d + interval '1 day', v_fim)) -> 'receitaLiquidaCentavos')
                               order by d)
                from generate_series(v_hoje - interval '6 days', v_hoje, interval '1 day') d),
    'colecoes', (select coalesce(jsonb_agg(x order by (x ->> 'receitaCentavos')::integer desc), '[]') from (
                   select jsonb_build_object('nome', c.name, 'receitaCentavos', sum(i.total_cents), 'pecas', sum(i.qty)) as x
                     from reservations r
                     join reservation_items i on i.reservation_id = r.id
                     join products p on p.id = i.product_id
                     join collections c on c.id = p.collection_id
                    where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim and sale_counts(r)
                    group by c.id, c.name
                    order by sum(i.total_cents) desc
                    limit 5) t),
    'mix', jsonb_build_object(
      'tamanho', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                    select i.size_snapshot::text as k, sum(i.qty) as n from reservations r join reservation_items i on i.reservation_id = r.id
                     where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim and sale_counts(r)
                     group by 1) t),
      'pagamento', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                      select r.payment_method::text as k, count(*) as n from reservations r
                       where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim and sale_counts(r) and r.payment_method is not null
                       group by 1) t),
      'entrega', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                    select coalesce(f.mode, r.delivery_intent)::text as k, count(*) as n
                      from reservations r left join fulfillments f on f.reservation_id = r.id
                     where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim and sale_counts(r)
                     group by 1) t)),
    -- Estoque em atenção: publicados com até 1 peça disponível (D26)
    'estoque', (select coalesce(jsonb_agg(x order by (x ->> 'disponivel')::integer, x ->> 'nome', x ->> 'tamanho'), '[]') from (
                  select jsonb_build_object('id', p.id, 'nome', p.name, 'colecao', c.name, 'tamanho', v.size, 'rotuloTamanho', size_label(v.size),
                                            'disponivel', variant_available(v)) as x
                    from product_variants v join products p on p.id = v.product_id join collections c on c.id = p.collection_id
                   where p.published_at is not null and v.active and variant_available(v) <= 1
                   order by variant_available(v), p.name, v.size
                   limit 10) t),
    'estoqueTotal', (select count(*) from product_variants v join products p on p.id = v.product_id
                      where p.published_at is not null and v.active and variant_available(v) <= 1),
    'pulso', admin_operation_board() -> 'resumo'
             || jsonb_build_object('entreguesHoje', (select count(*) from reservations where status = 'ENTREGUE' and delivered_at >= v_hoje),
                                   'freteParaCalcular', (select count(*) from fulfillments where closed_at is null and substatus = 'AGUARDANDO_CALCULO_FRETE')));
end $function$;

call lock_down_public();
