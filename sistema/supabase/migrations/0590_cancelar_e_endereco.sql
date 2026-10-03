-- 0590 · Cancelar pela loja e endereço pelo painel (03/10, pedido da loja: "não encontrei botão
-- de cancelamento no painel e nem os dados do endereço").
--   · Cancelar pela loja, sempre com motivo. Reserva não paga: encerra como a expiração (T4), as
--     peças e o cupom voltam e não conta para o bloqueio. Pedido pago (T6, nova): a api-admin
--     estorna antes no Mercado Pago cada pagamento aplicado (peças e frete) e só então chama o
--     banco, que confere o estorno, encerra a reserva, devolve as peças vendidas ao estoque
--     (movimento DEVOLUCAO) e fecha a entrega. Venda paga fora do Mercado Pago (dinheiro, no
--     painel): a loja devolve por fora e o faturamento desconta no dia. Contestação aberta
--     (chargeback) impede, como já impedia a entrega. A cliente recebe a mensagem essencial
--     reserva_cancelada. Encerra com o motivo CANCELADA_PELA_LOJA (o EXPIRADO de sempre).
--   · O estorno da loja fica registrado como disputa já resolvida (é o que o faturamento conta
--     como estorno); quando o aviso do Mercado Pago chega depois, não abre outra.
--   · Entrega pelo painel: a loja escolhe a modalidade e preenche ou corrige o endereço (venda
--     manual, ou a cliente que pediu pelo WhatsApp), com as mesmas regras da cliente; corrigir
--     o endereço vale até o pedido sair. A cliente recebe a confirmação.
-- Os valores novos dos tipos só são usados em funções plpgsql e em comparação por texto, para
-- a migration rodar numa transação só.

alter type closure_reason add value if not exists 'CANCELADA_PELA_LOJA';
alter type stock_movement_kind add value if not exists 'DEVOLUCAO';

-- T6: o pedido pago cancelado pela loja. O mapa das transições (0100) não muda: o guardião só
-- aceita PAGAMENTO_CONFIRMADO → EXPIRADO com o evento T6 e o motivo da loja (admin_cancel_reservation).
create or replace function trg_reservation_transition_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_event text := nullif(current_setting('app.transition_event', true), '');
  v_actor text := nullif(current_setting('app.transition_actor_type', true), '');
begin
  if tg_op = 'INSERT' then
    if new.status <> 'RESERVADO' then
      raise exception 'Reserva nasce em RESERVADO, não em %', new.status using errcode = 'TS021';
    end if;
  else
    if new.number is distinct from old.number then
      raise exception 'O número da reserva não muda' using errcode = 'TS022';
    end if;
    if new.status is not distinct from old.status then
      return new;
    end if;
    if not reservation_transition_allowed(old.status, new.status)
       and not (old.status = 'PAGAMENTO_CONFIRMADO' and new.status = 'EXPIRADO' and v_event = 'T6'
                and v_actor = 'ADMIN' and new.closure_reason::text = 'CANCELADA_PELA_LOJA') then
      raise exception 'Transição proibida: % → %', old.status, new.status using errcode = 'TS023';
    end if;
  end if;

  if v_event is null or v_actor is null then
    raise exception 'Mudança de estado só pelas funções de domínio (falta o contexto da transição)' using errcode = 'TS024';
  end if;

  insert into reservation_transitions (reservation_id, from_status, to_status, event, actor_type, actor_id, reason, created_at)
  values (
    new.id,
    case when tg_op = 'INSERT' then 'SELECIONADO'::reservation_status else old.status end,
    new.status,
    v_event,
    v_actor::actor_type,
    nullif(current_setting('app.transition_actor_id', true), '')::uuid,
    nullif(current_setting('app.transition_reason', true), ''),
    app_now()
  );
  return new;
end $$;

-- ─── Cancelar ──────────────────────────────────────────────────────────────────────────

-- O que acontece ao cancelar: se pode, por quê não, e o que volta para a cliente.
create function admin_cancel_preview(p_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  r reservations;
  v_bloqueio text;
  v_estornar jsonb;
begin
  select * into r from reservations where id = p_id;
  if not found then
    raise exception 'Reserva não encontrada' using errcode = 'TS130';
  end if;
  v_bloqueio := case
    when r.status not in ('RESERVADO', 'PAGAMENTO_CONFIRMADO') then 'ENCERRADA'
    when exists (select 1 from payment_disputes where reservation_id = r.id and status = 'ABERTA' and kind = 'CONTESTACAO') then 'CONTESTACAO'
    when r.status = 'PAGAMENTO_CONFIRMADO'
         and exists (select 1 from payments where reservation_id = r.id and purpose = 'FRETE' and status in ('CRIADO', 'PENDENTE')) then 'FRETE_EM_PAGAMENTO'
  end;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'finalidade', p.purpose, 'forma', p.method, 'valorCentavos', p.amount_cents,
                                               'idProvedor', p.provider_payment_id) order by p.created_at), '[]')
    into v_estornar
    from payments p
   where p.reservation_id = r.id and p.applied and p.status = 'APROVADO' and p.provider_payment_id is not null and r.status = 'PAGAMENTO_CONFIRMADO';
  return jsonb_strip_nulls(jsonb_build_object(
    'pode', v_bloqueio is null, 'bloqueio', v_bloqueio, 'pago', r.status = 'PAGAMENTO_CONFIRMADO',
    'estornar', v_estornar,
    -- Venda paga fora do Mercado Pago: a loja devolve por fora
    'devolverPorForaCentavos', case when r.status = 'PAGAMENTO_CONFIRMADO'
                                     and not exists (select 1 from payments p where p.reservation_id = r.id and p.purpose = 'PRODUTOS' and p.applied)
                                    then r.total_cents end,
    'pecas', (select coalesce(sum(qty), 0) from reservation_items where reservation_id = r.id)));
end $$;

-- p_refunded: os pagamentos que a api-admin já estornou no Mercado Pago (todos os aplicados).
create function admin_cancel_reservation(p_admin uuid, p_id uuid, p_reason text, p_refunded uuid[] default '{}') returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
  v jsonb;
  v_motivo text := btrim(coalesce(p_reason, ''));
  v_item record;
  v_estorno integer := 0;
  v_forma text;
begin
  perform admin_guard(p_admin);
  if length(v_motivo) not between 3 and 500 then
    raise exception 'O cancelamento precisa de um motivo' using errcode = 'TS121';
  end if;
  select * into r from reservations where id = p_id for update;
  if not found then
    raise exception 'Reserva não encontrada' using errcode = 'TS130';
  end if;
  v := admin_cancel_preview(r.id);
  if v ->> 'bloqueio' = 'ENCERRADA' then
    raise exception 'A reserva já foi entregue ou encerrada' using errcode = 'TS175';
  elsif v ->> 'bloqueio' = 'CONTESTACAO' then
    raise exception 'Há uma contestação aberta neste pedido' using errcode = 'TS173';
  elsif v ->> 'bloqueio' = 'FRETE_EM_PAGAMENTO' then
    raise exception 'Há uma cobrança do frete em andamento' using errcode = 'TS176';
  end if;

  if r.status = 'RESERVADO' then
    -- Um pedido de cancelamento da cliente em aberto fica aprovado pela mesma decisão
    update cancellation_requests set status = 'APROVADA', decided_at = app_now(), decided_by = p_admin, decision_reason = v_motivo
     where reservation_id = r.id and status = 'PENDENTE';
    perform expire_reservation(r.id, 'CANCELADA_PELA_LOJA', 'ADMIN', p_admin, v_motivo);
    perform enqueue_message('reserva_cancelada:' || r.id, r.phone_e164, 'reserva_cancelada',
                            jsonb_strip_nulls(jsonb_build_object('numero', r.number, 'nome', nullif(split_part(btrim(r.customer_name), ' ', 1), ''),
                                                                 'pago', false)),
                            1::smallint, app_now() + interval '1 day', r.id);
  else
    -- Pago: todo pagamento aplicado no Mercado Pago precisa estar estornado
    if exists (select 1 from jsonb_array_elements(v -> 'estornar') e where not ((e ->> 'id')::uuid = any (coalesce(p_refunded, '{}')))) then
      raise exception 'Falta estornar um pagamento no Mercado Pago' using errcode = 'TS176';
    end if;
    for v_item in select p.* from payments p where p.id = any (coalesce(p_refunded, '{}')) and p.reservation_id = r.id and p.applied
                   order by p.created_at for update loop
      update payments set status = 'ESTORNADO' where id = v_item.id;
      -- O aviso de estorno que o Mercado Pago já mandou (disputa aberta) fica resolvido por este cancelamento
      update payment_disputes set status = 'RESOLVIDA', resolved_at = app_now(), resolved_by = p_admin, note = left('Cancelado pela loja: ' || v_motivo, 500)
       where payment_id = v_item.id and status = 'ABERTA' and kind in ('ESTORNO', 'CANCELAMENTO');
      if not exists (select 1 from payment_disputes where payment_id = v_item.id and kind in ('ESTORNO', 'CANCELAMENTO')) then
        insert into payment_disputes (payment_id, reservation_id, kind, provider_status, status, resolved_at, resolved_by, note)
        values (v_item.id, r.id, 'ESTORNO', 'CANCELAMENTO_LOJA', 'RESOLVIDA', app_now(), p_admin, left('Cancelado pela loja: ' || v_motivo, 500));
      else
        update payment_disputes set provider_status = 'CANCELAMENTO_LOJA' where payment_id = v_item.id and kind in ('ESTORNO', 'CANCELAMENTO');
      end if;
      v_estorno := v_estorno + v_item.amount_cents;
      v_forma := v_item.method::text;
      perform log_audit('ADMIN', p_admin, 'pagamento.estornado', 'payment', v_item.id::text, r.id,
                        jsonb_build_object('valor_cents', v_item.amount_cents, 'cancelamento', true));
    end loop;

    perform set_transition_context('T6', 'ADMIN', p_admin, v_motivo);
    update reservations set status = 'EXPIRADO', closure_reason = 'CANCELADA_PELA_LOJA', expired_at = app_now() where id = r.id;

    -- As peças vendidas voltam ao estoque (variantes em ordem de id, como em toda função)
    for v_item in select i.product_id, i.variant_id, i.qty from reservation_items i where i.reservation_id = r.id order by i.variant_id loop
      update product_variants set qty_sold = qty_sold - v_item.qty where id = v_item.variant_id;
      insert into stock_movements (product_id, variant_id, kind, qty, reservation_id, actor_type, actor_id)
      values (v_item.product_id, v_item.variant_id, 'DEVOLUCAO', v_item.qty, r.id, 'ADMIN', p_admin);
    end loop;

    -- A entrega fecha; a cotação de frete em aberto perde o valor
    update shipping_quotes set status = 'SUBSTITUIDO' where reservation_id = r.id and status in ('AGUARDANDO_PAGAMENTO', 'VENCIDO');
    update fulfillments set closed_at = app_now(), updated_at = app_now() where reservation_id = r.id and closed_at is null;

    perform enqueue_message('reserva_cancelada:' || r.id, r.phone_e164, 'reserva_cancelada',
                            jsonb_strip_nulls(jsonb_build_object('numero', r.number, 'nome', nullif(split_part(btrim(r.customer_name), ' ', 1), ''),
                                                                 'pago', true, 'estornoCentavos', nullif(v_estorno, 0), 'forma', v_forma,
                                                                 'porFora', (v ->> 'devolverPorForaCentavos') is not null)),
                            1::smallint, app_now() + interval '1 day', r.id);
  end if;

  perform log_audit('ADMIN', p_admin, 'reserva.cancelada', 'reservation', r.id::text, r.id,
                    jsonb_build_object('motivo', v_motivo, 'pago', r.status = 'PAGAMENTO_CONFIRMADO', 'estorno_cents', v_estorno,
                                       'por_fora_cents', (v ->> 'devolverPorForaCentavos')::int));
  return admin_reservation_detail(r.id);
end $$;

-- O aviso de estorno do Mercado Pago que chega depois do cancelamento da loja não abre disputa.
create function trg_dispute_store_refund() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'ABERTA' and new.kind in ('ESTORNO', 'CANCELAMENTO')
     and exists (select 1 from payment_disputes d where d.payment_id = new.payment_id and d.provider_status = 'CANCELAMENTO_LOJA') then
    return null;
  end if;
  return new;
end $$;

create trigger disputa_estorno_da_loja before insert on payment_disputes
  for each row execute function trg_dispute_store_refund();

-- Faturamento (0360): a venda paga fora do Mercado Pago e cancelada pela loja entra como
-- estorno no dia do cancelamento (o estorno pelo Mercado Pago já entra pela disputa).
create or replace function sales_totals(p_ini timestamptz, p_fim timestamptz) returns jsonb
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
    union all
    select r.total_cents from reservations r
     where r.closure_reason::text = 'CANCELADA_PELA_LOJA' and r.payment_confirmed_at is not null
       and r.expired_at >= p_ini and r.expired_at < p_fim
       and not exists (select 1 from payments p where p.reservation_id = r.id and p.purpose = 'PRODUTOS' and p.applied)
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

-- O invariante do estoque (0370) segue valendo: o pedido cancelado é EXPIRADO, fora do "vendido".

-- ─── Entrega pelo painel ───────────────────────────────────────────────────────────────

-- A loja escolhe a modalidade e o endereço. Trocar a modalidade segue a regra da cliente (até o
-- frete ser pago ou a retirada começar a ser preparada); corrigir o endereço da mesma modalidade
-- vale até o pedido sair. A cliente recebe a confirmação.
create function admin_set_fulfillment(p_admin uuid, p_reservation_id uuid, p_mode delivery_mode, p_address jsonb default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  r reservations;
  f fulfillments;
  v_endereco jsonb := case when p_mode = 'RETIRADA' then null else p_address end;
  v_so_endereco boolean;
begin
  select * into v from lock_fulfillment(p_reservation_id, p_admin);
  r := v.r;
  f := v.f;
  if f.reservation_id is null then
    raise exception 'Pedido sem entrega aberta' using errcode = 'TS170';
  end if;
  if p_mode <> 'RETIRADA' and (v_endereco is null or not address_ok(v_endereco)) then
    raise exception 'Endereço incompleto' using errcode = 'TS120';
  end if;
  v_so_endereco := f.mode = p_mode and f.confirmed_at is not null;
  if v_so_endereco then
    if p_mode = 'RETIRADA' or f.address is not distinct from v_endereco then
      return admin_reservation_detail(r.id);
    end if;
    if f.substatus in ('SAIU_PARA_ENTREGA', 'ENVIADO') then
      raise exception 'O pedido já saiu' using errcode = 'TS172';
    end if;
    update fulfillments set address = v_endereco, updated_at = app_now() where reservation_id = r.id;
  else
    if exists (select 1 from shipping_quotes where reservation_id = r.id and status = 'PAGO') then
      raise exception 'O frete já foi pago' using errcode = 'TS171';
    end if;
    if f.substatus not in ('AGUARDANDO_MODALIDADE', 'AGUARDANDO_CALCULO_FRETE', 'AGUARDANDO_PAGAMENTO_FRETE', 'FRETE_VENCIDO', 'EM_PREPARACAO') then
      raise exception 'A entrega já não muda' using errcode = 'TS172';
    end if;
    update shipping_quotes set status = 'SUBSTITUIDO' where reservation_id = r.id and status in ('AGUARDANDO_PAGAMENTO', 'VENCIDO');
    update fulfillments
       set mode = p_mode, address = v_endereco,
           substatus = case when p_mode = 'RETIRADA' then 'EM_PREPARACAO' else 'AGUARDANDO_CALCULO_FRETE' end::fulfillment_substatus,
           confirmed_at = app_now(), updated_at = app_now()
     where reservation_id = r.id;
  end if;

  perform enqueue_message('entrega_confirmada:' || r.id || ':' || gen_random_uuid(), r.phone_e164, 'entrega_confirmada',
                          jsonb_strip_nulls(jsonb_build_object('numero', r.number, 'modalidade', p_mode, 'alterado', case when v_so_endereco then true end)),
                          2::smallint, app_now() + interval '1 day', r.id, 'PAGAMENTO_CONFIRMADO', p_optional => true);
  -- Sem endereço na auditoria (G9)
  perform log_audit('ADMIN', p_admin, case when v_so_endereco then 'entrega.endereco' else 'entrega.confirmada' end,
                    'reservation', r.id::text, r.id, jsonb_build_object('modalidade', p_mode));
  return admin_reservation_detail(r.id);
end $$;

call lock_down_public();
