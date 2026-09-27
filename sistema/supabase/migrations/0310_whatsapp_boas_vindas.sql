-- 0310 · Resposta automática a mensagem comum no WhatsApp (27/09)
-- Quem escreve algo que não é pedido de código nem "minha reserva" recebe o endereço da
-- loja, no máximo 1 vez por número a cada boas_vindas_intervalo_horas; a equipe segue
-- atendendo pelo celular. É opcional: a loja desliga na tela do WhatsApp (modelo boas_vindas).

insert into app_settings (key, value, description) values
  ('boas_vindas_intervalo_horas', '24', 'Intervalo mínimo entre duas respostas automáticas ao mesmo número no WhatsApp');

create index whatsapp_inbound_boas_vindas_idx on whatsapp_inbound (from_wa_id, received_at) where handled_as = 'BOAS_VINDAS';

-- Decide e marca de uma vez: true quando a mensagem (já registrada) deve receber a resposta
-- automática, e ela fica marcada BOAS_VINDAS; false deixa quem chamou marcar CONVERSA.
create function inbound_welcome(p_wa_message_id text) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_from text;
begin
  if setting('notificacoes_opcionais') = 'false'::jsonb or setting('notificacoes_desligadas') ? 'boas_vindas' then
    return false;
  end if;
  select from_wa_id into v_from from whatsapp_inbound where wa_message_id = p_wa_message_id;
  if v_from is null then
    return false;
  end if;
  -- Duas mensagens seguidas do mesmo número não disparam duas respostas
  perform pg_advisory_xact_lock(hashtext('boas_vindas:' || v_from));
  if exists (select 1 from whatsapp_inbound
              where from_wa_id = v_from and handled_as = 'BOAS_VINDAS'
                and received_at > app_now() - make_interval(hours => setting_int('boas_vindas_intervalo_horas'))) then
    return false;
  end if;
  update whatsapp_inbound set handled_as = 'BOAS_VINDAS' where wa_message_id = p_wa_message_id;
  return true;
end $$;

call lock_down_public();
