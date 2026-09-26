-- 0050 · Entrega e frete (seção 04, regras 17 e 18, D8, D15, G9, G15)
-- A entrega nasce com o pagamento dos produtos (T2), na modalidade escolhida na reserva.
-- Endereço só para motoboy ou envio (LGPD). O frete é informado pelo painel e pago num
-- segundo pagamento (payments.purpose = FRETE), com prazo de 2 h.

-- Endereço de entrega: CEP de 8 dígitos, UF de 2 letras e os campos obrigatórios.
create function address_ok(a jsonb) returns boolean
language sql immutable
as $$
  select a is null or (
    jsonb_typeof(a) = 'object'
    and coalesce(a ->> 'cep', '') ~ '^[0-9]{8}$'
    and coalesce(a ->> 'uf', '') ~ '^[A-Z]{2}$'
    and length(btrim(coalesce(a ->> 'rua', ''))) between 1 and 120
    and length(btrim(coalesce(a ->> 'numero', ''))) between 1 and 20
    and length(coalesce(a ->> 'complemento', '')) <= 60
    and length(btrim(coalesce(a ->> 'bairro', ''))) between 1 and 80
    and length(btrim(coalesce(a ->> 'cidade', ''))) between 1 and 80
    and (select count(*) from jsonb_object_keys(a) k where k not in ('cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf')) = 0
  )
$$;

create table fulfillments (
  reservation_id uuid primary key references reservations (id),
  mode           delivery_mode not null,
  substatus      fulfillment_substatus not null default 'AGUARDANDO_MODALIDADE',
  address        jsonb check (address_ok(address)),
  -- Aleatório, 6 caracteres sem 0/O e 1/I, nunca derivado do número da reserva (G15)
  pickup_code    text not null check (pickup_code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  tracking_code  text check (tracking_code ~ '^[A-Z0-9-]{4,40}$'),
  confirmed_at   timestamptz,
  closed_at      timestamptz,
  updated_at     timestamptz not null default app_now(),
  check (mode <> 'RETIRADA' or address is null),
  check (mode = 'RETIRADA' or confirmed_at is null or address is not null),
  check (substatus <> 'PRONTO_PARA_RETIRADA' or mode = 'RETIRADA'),
  check (substatus <> 'SAIU_PARA_ENTREGA' or mode = 'MOTOBOY'),
  check (substatus <> 'ENVIADO' or mode = 'ENVIO'),
  check (substatus not in ('AGUARDANDO_CALCULO_FRETE', 'AGUARDANDO_PAGAMENTO_FRETE', 'FRETE_VENCIDO') or mode <> 'RETIRADA'),
  check (tracking_code is null or mode = 'ENVIO')
);

-- Único entre pedidos abertos (G15)
create unique index fulfillments_codigo_aberto on fulfillments (pickup_code) where closed_at is null;
create index fulfillments_substatus_idx on fulfillments (substatus) where closed_at is null;

create table shipping_quotes (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations (id),
  mode           delivery_mode not null check (mode <> 'RETIRADA'),
  amount_cents   integer not null check (amount_cents between 1 and 100000),
  delivery_days  smallint check (delivery_days between 0 and 60),
  note           text check (length(note) <= 300),
  calculated_by  uuid not null,
  calculated_at  timestamptz not null default app_now(),
  pay_until      timestamptz not null,
  status         shipping_quote_status not null default 'AGUARDANDO_PAGAMENTO',
  paid_at        timestamptz,
  check ((status = 'PAGO') = (paid_at is not null)),
  check (pay_until > calculated_at)
);

-- Uma cotação ativa (a pagar, vencida ou paga) por pedido; as antigas ficam SUBSTITUIDO.
create unique index shipping_quotes_uma_ativa on shipping_quotes (reservation_id) where status <> 'SUBSTITUIDO';
create index shipping_quotes_a_vencer_idx on shipping_quotes (pay_until) where status = 'AGUARDANDO_PAGAMENTO';

alter table payments
  add constraint payments_shipping_quote_fk foreign key (shipping_quote_id) references shipping_quotes (id),
  add constraint payments_frete_tem_cotacao check ((purpose = 'FRETE') = (shipping_quote_id is not null));

insert into app_settings (key, value, description) values
  ('loja_endereco_retirada', '""', 'Endereço da loja para retirada, usado na mensagem de pronto para retirada (E7)'),
  ('loja_horario_retirada',  '""', 'Horário de retirada na loja (E7)');

-- A entrega como a cliente vê (p_completa = false: endereço só com bairro, cidade e UF,
-- G6) ou como o painel vê (completa). A cotação é a ativa, se houver.
create function fulfillment_json(f fulfillments, p_completa boolean) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'modalidade', f.mode,
    'substatus', f.substatus,
    'confirmadaEm', f.confirmed_at,
    'endereco', case when f.address is null then null
                     when p_completa then f.address
                     else jsonb_strip_nulls(jsonb_build_object('bairro', f.address ->> 'bairro', 'cidade', f.address ->> 'cidade', 'uf', f.address ->> 'uf')) end,
    -- A cliente vê o código só com a retirada confirmada e o pedido em aberto
    'codigoRetirada', case when p_completa or (f.mode = 'RETIRADA' and f.confirmed_at is not null and f.closed_at is null) then f.pickup_code end,
    'rastreio', f.tracking_code,
    'frete', (select jsonb_strip_nulls(jsonb_build_object('id', case when p_completa then q.id end, 'modalidade', q.mode,
                                                          'valorCentavos', q.amount_cents, 'prazoDias', q.delivery_days,
                                                          'observacao', q.note, 'pagarAte', q.pay_until, 'status', q.status,
                                                          'pagoEm', q.paid_at, 'calculadoEm', q.calculated_at))
                from shipping_quotes q where q.reservation_id = f.reservation_id and q.status <> 'SUBSTITUIDO')
  ))
$$;
