-- 0360 · Dashboard comercial e metas de vendas (27/09, F12)
-- Faturamento pelas regras contábeis, confirmadas pela loja: a venda conta na confirmação
-- do pagamento (payment_confirmed_at).
--   Receita bruta     = peças pelo preço de tabela + frete cobrado (pagamento do frete aprovado)
--   (−) Descontos     = promoções e cupons concedidos nas vendas do período
--   (−) Estornos      = pagamentos já aplicados que o provedor estornou ou cancelou, no período do estorno
--   = Receita líquida (antes de impostos e das taxas do Mercado Pago, que o sistema não guarda)
-- Metas diária, mensal e anual em app_settings, editadas em Minha conta (0 = sem meta).

insert into app_settings (key, value, description) values
  ('meta_vendas_dia_centavos', '0', 'Meta de receita líquida por dia (0 = sem meta)'),
  ('meta_vendas_mes_centavos', '0', 'Meta de receita líquida no mês (0 = sem meta)'),
  ('meta_vendas_ano_centavos', '0', 'Meta de receita líquida no ano (0 = sem meta)');

create index if not exists reservations_pagas_idx on reservations (payment_confirmed_at) where payment_confirmed_at is not null;
create index if not exists payments_aplicados_idx on payments (approved_at) where applied;

create function admin_sales_goals() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object('diaCentavos', setting_int('meta_vendas_dia_centavos'),
                            'mesCentavos', setting_int('meta_vendas_mes_centavos'),
                            'anoCentavos', setting_int('meta_vendas_ano_centavos'))
$$;

-- p: {diaCentavos?, mesCentavos?, anoCentavos?}, inteiros de 0 a R$ 20 milhões. Vai para a auditoria.
create function admin_update_sales_goals(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo text;
  v_chave text;
  v_mudou text[] := '{}';
begin
  perform admin_guard(p_admin);
  foreach v_campo in array array['diaCentavos', 'mesCentavos', 'anoCentavos'] loop
    continue when not p ? v_campo;
    if jsonb_typeof(p -> v_campo) <> 'number' or (p ->> v_campo)::numeric <> trunc((p ->> v_campo)::numeric)
       or (p ->> v_campo)::numeric < 0 or (p ->> v_campo)::numeric > 2000000000 then
      raise exception 'Meta inválida: %', v_campo using errcode = 'TS181';
    end if;
    v_chave := case v_campo when 'diaCentavos' then 'meta_vendas_dia_centavos' when 'mesCentavos' then 'meta_vendas_mes_centavos'
                            else 'meta_vendas_ano_centavos' end;
    if set_setting(v_chave, to_jsonb((p ->> v_campo)::integer), p_admin) then
      v_mudou := v_mudou || v_campo;
    end if;
  end loop;
  if cardinality(v_mudou) > 0 then
    perform log_audit('ADMIN', p_admin, 'metas.alteradas', 'app_settings', 'metas', null,
                      jsonb_build_object('mudou', to_jsonb(v_mudou)) || admin_sales_goals());
  end if;
  return admin_sales_goals();
end $$;

-- Números de vendas de uma janela [p_ini, p_fim), na data da confirmação do pagamento.
create function sales_totals(p_ini timestamptz, p_fim timestamptz) returns jsonb
language sql stable
set search_path = public
as $$
  with vendas as (
    select r.id, r.subtotal_cents, r.discount_cents, r.payment_method,
           exists (select 1 from reservation_discounts d join promotions p on p.id = d.promotion_id
                    where d.reservation_id = r.id and p.buy_more_mode = 'PRECO_POR_GRUPO') as club
      from reservations r
     where r.payment_confirmed_at >= p_ini and r.payment_confirmed_at < p_fim
  ), estornos as (
    -- Pagamento já aplicado que o provedor estornou ou cancelou vira disputa (0130); conta uma
    -- vez por pagamento, na data da primeira. Contestação (chargeback) em aberto não entra.
    select e.amount_cents from (
      select distinct on (d.payment_id) d.opened_at, p.amount_cents
        from payment_disputes d join payments p on p.id = d.payment_id
       where d.kind in ('ESTORNO', 'CANCELAMENTO') and p.applied
       order by d.payment_id, d.opened_at) e
     where e.opened_at >= p_ini and e.opened_at < p_fim
  ), criadas as (
    select r.status, r.payment_confirmed_at from reservations r
     where r.created_at >= p_ini and r.created_at < p_fim and r.status <> 'RESERVADO'
  ), numeros as (
    select (select count(*) from vendas) as pedidos,
           (select coalesce(sum(subtotal_cents), 0) from vendas) as pecas_bruta,
           (select coalesce(sum(discount_cents), 0) from vendas) as descontos,
           (select coalesce(sum(p.amount_cents), 0) from payments p
             where p.purpose = 'FRETE' and p.applied and p.approved_at >= p_ini and p.approved_at < p_fim) as frete,
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
    'reservasPagas', (select count(*) from criadas where payment_confirmed_at is not null))
  from numeros n
$$;

-- Dashboard comercial. p_periodo: HOJE, 7_DIAS, 30_DIAS, MES ou ANO (até agora, no fuso da
-- loja), comparado com a mesma janela do período anterior.
create function admin_sales_dashboard(p_periodo text) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
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
                    where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim
                    group by c.id, c.name
                    order by sum(i.total_cents) desc
                    limit 5) t),
    'mix', jsonb_build_object(
      'pagamento', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                      select r.payment_method::text as k, count(*) as n from reservations r
                       where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim and r.payment_method is not null
                       group by 1) t),
      'entrega', (select coalesce(jsonb_object_agg(k, n), '{}') from (
                    select coalesce(f.mode, r.delivery_intent)::text as k, count(*) as n
                      from reservations r left join fulfillments f on f.reservation_id = r.id
                     where r.payment_confirmed_at >= v_ini and r.payment_confirmed_at < v_fim
                     group by 1) t)),
    -- Estoque em atenção: publicados com até 1 peça disponível (D26)
    'estoque', (select coalesce(jsonb_agg(x order by (x ->> 'disponivel')::integer, x ->> 'nome'), '[]') from (
                  select jsonb_build_object('id', p.id, 'nome', p.name, 'colecao', c.name,
                                            'disponivel', p.qty_total - p.qty_reserved - p.qty_sold) as x
                    from products p join collections c on c.id = p.collection_id
                   where p.published_at is not null and p.qty_total - p.qty_reserved - p.qty_sold <= 1
                   order by p.qty_total - p.qty_reserved - p.qty_sold, p.name
                   limit 10) t),
    'estoqueTotal', (select count(*) from products p where p.published_at is not null and p.qty_total - p.qty_reserved - p.qty_sold <= 1),
    'pulso', admin_operation_board() -> 'resumo'
             || jsonb_build_object('entreguesHoje', (select count(*) from reservations where status = 'ENTREGUE' and delivered_at >= v_hoje),
                                   'freteParaCalcular', (select count(*) from fulfillments where closed_at is null and substatus = 'AGUARDANDO_CALCULO_FRETE')));
end $$;

call lock_down_public();
