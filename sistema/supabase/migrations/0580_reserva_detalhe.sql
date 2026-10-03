-- 0580 · Tela da reserva v2 (03/10, pedido da loja: "analise esse cartão de reserva"). O detalhe
-- passa a trazer o que faltava para a linha do tempo contar a história inteira e para a ficha da
-- cliente levar a algum lugar:
--   · as mensagens de WhatsApp da reserva (modelo e parâmetros: a tela monta o texto), com o
--     status, o motivo da falha e se ela pode voltar para a fila (a mesma regra da aba Envios);
--   · o número da operação no Mercado Pago de cada pagamento, para conferir no aplicativo;
--   · da cliente: a conversa no WhatsApp (para abrir na aba Atendimento), quanto ela já comprou,
--     as outras reservas e os chamados abertos desde a reserva.
-- A escolha da entrega, o frete e cada etapa já vêm na auditoria da reserva; a tela junta tudo.

-- As conversas do WhatsApp de um telefone: o número sem o "+" e, no celular, sem o nono dígito
-- (como alguns remetentes chegam).
create function wa_phone_chats(p_phone text) returns text[]
language sql immutable
as $$
  select array_remove(array[substr(p_phone, 2),
                            case when p_phone ~ '^\+55[0-9]{2}9[0-9]{8}$' then '55' || substr(p_phone, 4, 2) || substr(p_phone, 7) end], null)
$$;

create or replace function admin_reservation_detail(p_id uuid) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select reservation_json(r) || jsonb_build_object(
    'logistica', (select fulfillment_json(f, true) from fulfillments f where f.reservation_id = r.id),
    'entregueEm', r.delivered_at, 'entreguePor', admin_name(r.delivered_by),
    'manual', case when r.channel = 'PAINEL' then jsonb_strip_nulls(jsonb_build_object(
                'criadaPor', admin_name(r.created_by), 'motivoDesconto', r.manual_discount_reason)) end,
    'transicoes', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'evento', t.event, 'de', t.from_status, 'para', t.to_status, 'ator', t.actor_type,
                     'atorNome', admin_name(t.actor_id), 'motivo', t.reason, 'em', t.created_at)) order by t.id), '[]')
                     from reservation_transitions t where t.reservation_id = r.id),
    'pagamentos', (select coalesce(jsonb_agg(payment_json(p) - 'pix' || jsonb_strip_nulls(jsonb_build_object(
                     'statusProvedor', p.provider_status, 'motivoAnalise', p.review_reason,
                     'provedor', p.provider, 'idProvedor', p.provider_payment_id)) order by p.created_at), '[]')
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
    -- As mensagens para a cliente sobre esta reserva (os avisos da equipe não entram)
    'mensagens', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'id', o.id, 'modelo', o.template, 'status', o.status, 'tentativas', o.attempts,
                    'criadaEm', o.created_at, 'enviadaEm', o.sent_at, 'entregueEm', o.delivered_at, 'erro', o.last_error,
                    'proximaTentativa', case when o.status = 'PENDENTE' then o.next_attempt_at end,
                    'naoReenvia', case when o.status = 'FALHOU' then outbox_retry_block(o) end))
                    || jsonb_build_object('params', o.params) order by o.created_at), '[]')
                    from outbox_messages o where o.reservation_id = r.id and o.template <> 'aviso_loja'),
    'cliente', jsonb_build_object(
      'bloqueado', phone_is_blocked(r.phone_e164),
      'reservas', (select count(*) from reservations x where x.customer_id = r.customer_id),
      'expiracoes30Dias', (select count(*) from reservations x where x.customer_id = r.customer_id and x.status = 'EXPIRADO'
                             and x.closure_reason = 'PRAZO_ESGOTADO' and x.expired_at > app_now() - interval '30 days'),
      'compras', (select count(*) from reservations x where x.customer_id = r.customer_id and x.status in ('PAGAMENTO_CONFIRMADO', 'ENTREGUE')),
      'comprasCentavos', (select coalesce(sum(x.total_cents), 0) from reservations x
                           where x.customer_id = r.customer_id and x.status in ('PAGAMENTO_CONFIRMADO', 'ENTREGUE')),
      'outras', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'numero', x.number, 'status', x.status,
                                                             'totalCentavos', x.total_cents, 'criadaEm', x.created_at) order by x.created_at desc), '[]')
                   from (select * from reservations where customer_id = r.customer_id and id <> r.id and status <> 'SELECIONADO'
                          order by created_at desc limit 5) x),
      -- A conversa mais recente do telefone (a tela abre na aba Atendimento, sem o número no endereço)
      'chat', (select i.from_wa_id from whatsapp_inbound i
                where i.from_wa_id = any (wa_phone_chats(r.phone_e164)) order by i.received_at desc limit 1),
      'chamados', (select coalesce(jsonb_agg(wa_ticket_json(t) order by t.opened_at), '[]')
                     from (select * from whatsapp_tickets where phone_e164 = r.phone_e164 and opened_at >= r.created_at
                            order by opened_at limit 10) t)),
    'auditoria', (select coalesce(jsonb_agg(audit_json(a) order by a.occurred_at, a.id), '[]')
                    from (select * from audit_log where reservation_id = r.id order by occurred_at desc, id desc limit 100) a))
  from reservations r where r.id = p_id
$$;

create index outbox_reserva_idx on outbox_messages (reservation_id) where reservation_id is not null;

call lock_down_public();
