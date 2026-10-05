-- 0620 · Endereço já na Nova reserva pelo link (05/10, pedido da loja: "em nova reserva quando
-- coloca motoboy não aparece a opção de colocar endereço"). Na venda pelo WhatsApp, a cliente
-- costuma mandar o endereço na conversa; pedir de novo no site depois de pagar era um passo a
-- mais. Agora, na reserva do painel com motoboy ou envio que a cliente paga pelo link, a loja
-- pode deixar o endereço guardado na reserva. Quando o pagamento entra e a entrega abre, ela já
-- nasce combinada com esse endereço (como a retirada da 0530) e vai direto para "Calcular o
-- frete"; a mensagem de pagamento confirmado deixa de pedir a escolha no site.
--   · O endereço fica só até a entrega abrir (passa para fulfillments) ou a reserva encerrar sem
--     pagamento: os dois casos limpam a coluna, então ele não fica guardado à toa (G9).
--   · Na reserva feita pelo site nada muda: a entrega da sacola é só a pretendida.

alter table reservations add column prefilled_address jsonb;

create function admin_prefill_address(p_admin uuid, p_reservation_id uuid, p_address jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservations;
begin
  perform admin_guard(p_admin);
  select * into r from reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reserva não encontrada' using errcode = 'TS130';
  end if;
  if r.status <> 'RESERVADO' or r.channel <> 'PAINEL' or r.delivery_intent = 'RETIRADA' then
    raise exception 'A reserva não espera endereço' using errcode = 'TS175';
  end if;
  if p_address is null or not address_ok(p_address) then
    raise exception 'Endereço incompleto' using errcode = 'TS120';
  end if;
  update reservations set prefilled_address = p_address where id = r.id;
  -- Sem endereço na auditoria (G9)
  perform log_audit('ADMIN', p_admin, 'entrega.endereco_previo', 'reservation', r.id::text, r.id,
                    jsonb_build_object('modalidade', r.delivery_intent));
  return jsonb_build_object('ok', true);
end $$;

-- A entrega abre no pagamento (ensure_fulfillment) com a modalidade pretendida: com o endereço
-- guardado pela loja, ela já sai combinada, como a cliente faria no site.
create function trg_fulfillment_endereco_previo() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endereco jsonb;
begin
  if new.mode in ('MOTOBOY', 'ENVIO') and new.substatus = 'AGUARDANDO_MODALIDADE' then
    select r.prefilled_address into v_endereco from reservations r
     where r.id = new.reservation_id and r.channel = 'PAINEL' and r.delivery_intent = new.mode;
    if v_endereco is not null and address_ok(v_endereco) then
      update fulfillments set address = v_endereco, substatus = 'AGUARDANDO_CALCULO_FRETE', confirmed_at = app_now(), updated_at = app_now()
       where reservation_id = new.reservation_id;
    end if;
    update reservations set prefilled_address = null where id = new.reservation_id and prefilled_address is not null;
  end if;
  return null;
end $$;

create trigger endereco_previo after insert on fulfillments
  for each row execute function trg_fulfillment_endereco_previo();

-- A reserva encerrada sem pagamento não guarda o endereço
create function trg_reservation_endereco_previo() returns trigger
language plpgsql
as $$
begin
  new.prefilled_address := null;
  return new;
end $$;

create trigger endereco_previo_encerrada before update of status on reservations
  for each row when (new.status = 'EXPIRADO' and old.prefilled_address is not null)
  execute function trg_reservation_endereco_previo();

-- A mensagem de pagamento confirmado sai depois da entrega aberta: com motoboy ou envio já
-- combinados, ela diz que o frete vem a seguir em vez de pedir a escolha no site.
create or replace function trg_outbox_pagamento_retirada() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modo delivery_mode;
begin
  if new.template = 'pagamento_confirmado' and new.reservation_id is not null and not new.params ? 'retirada' and not new.params ? 'entrega' then
    select f.mode into v_modo from fulfillments f where f.reservation_id = new.reservation_id and f.confirmed_at is not null;
    if v_modo = 'RETIRADA' then
      new.params := new.params || '{"retirada": true}'::jsonb;
    elsif v_modo in ('MOTOBOY', 'ENVIO') then
      new.params := new.params || jsonb_build_object('entrega', v_modo);
    end if;
  end if;
  return new;
end $$;

-- O detalhe da reserva no painel mostra o endereço guardado enquanto ela espera o pagamento
alter function admin_reservation_detail(uuid) rename to admin_reservation_detail_base;

create function admin_reservation_detail(p_id uuid) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select admin_reservation_detail_base(p_id)
         || jsonb_strip_nulls(jsonb_build_object('enderecoPrevio', (select r.prefilled_address from reservations r where r.id = p_id)))
$$;

call lock_down_public();
