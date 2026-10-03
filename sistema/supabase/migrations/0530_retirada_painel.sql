-- 0530 · Venda do painel com retirada (03/10, teste da loja): quando a reserva foi feita no
-- painel já com "Retirar na loja" e a cliente paga pelo link, a retirada fica confirmada no
-- pagamento, como na venda já paga da 0470. Antes, a entrega ficava esperando a cliente escolher
-- de novo no site, e pelo link isso pedia o código do WhatsApp. A mensagem de pagamento
-- confirmado já diz que ela retira na loja. Na reserva do site nada muda: a entrega escolhida
-- na sacola é só a pretendida, e a cliente confirma depois de pagar.

create function trg_fulfillment_retirada_painel() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode = 'RETIRADA' and new.substatus = 'AGUARDANDO_MODALIDADE'
     and exists (select 1 from reservations r where r.id = new.reservation_id and r.channel = 'PAINEL' and r.delivery_intent = 'RETIRADA') then
    update fulfillments set substatus = 'EM_PREPARACAO', confirmed_at = app_now(), updated_at = app_now()
     where reservation_id = new.reservation_id;
  end if;
  return null;
end $$;

create trigger retirada_painel after insert on fulfillments
  for each row execute function trg_fulfillment_retirada_painel();

-- A mensagem de pagamento confirmado sai depois da entrega aberta (ensure_fulfillment): com a
-- retirada já confirmada, ela diz "Você retira na loja" em vez de pedir a escolha no site.
create function trg_outbox_pagamento_retirada() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.template = 'pagamento_confirmado' and new.reservation_id is not null and not new.params ? 'retirada'
     and exists (select 1 from fulfillments f where f.reservation_id = new.reservation_id and f.mode = 'RETIRADA' and f.confirmed_at is not null) then
    new.params := new.params || '{"retirada": true}'::jsonb;
  end if;
  return new;
end $$;

create trigger pagamento_com_retirada before insert on outbox_messages
  for each row execute function trg_outbox_pagamento_retirada();

-- As vendas do painel com retirada que já foram pagas e ficaram esperando a escolha (o teste da
-- loja, #1001): a retirada fica confirmada, e a cliente recebe o "Combinado!" da retirada.
do $$
declare v record;
begin
  for v in
    select f.reservation_id, r.number, r.phone_e164
      from fulfillments f join reservations r on r.id = f.reservation_id
     where r.channel = 'PAINEL' and r.delivery_intent = 'RETIRADA' and r.status = 'PAGAMENTO_CONFIRMADO'
       and f.mode = 'RETIRADA' and f.substatus = 'AGUARDANDO_MODALIDADE' and f.closed_at is null
  loop
    update fulfillments set substatus = 'EM_PREPARACAO', confirmed_at = app_now(), updated_at = app_now() where reservation_id = v.reservation_id;
    perform enqueue_message('entrega_confirmada:' || v.reservation_id || ':RETIRADA', v.phone_e164, 'entrega_confirmada',
                            jsonb_build_object('numero', v.number, 'modalidade', 'RETIRADA'), 2::smallint, app_now() + interval '1 day', v.reservation_id);
  end loop;
end $$;

call lock_down_public();
