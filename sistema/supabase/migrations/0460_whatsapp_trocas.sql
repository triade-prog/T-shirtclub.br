-- 0460 · Resposta sobre trocas no WhatsApp (29/09)
-- Quem fala em troca ou devolução recebe a política da loja (7 dias, sem uso e com a
-- etiqueta) e o link de /trocas, no máximo 1 vez por número a cada trocas_intervalo_horas;
-- a equipe segue o atendimento pelo celular. É opcional: a loja desliga na tela do WhatsApp
-- (modelo trocas). Mesmo desenho do inbound_welcome (0310).

insert into app_settings (key, value, description) values
  ('trocas_intervalo_horas', '24', 'Intervalo mínimo entre duas respostas sobre trocas ao mesmo número no WhatsApp');

create index whatsapp_inbound_trocas_idx on whatsapp_inbound (from_wa_id, received_at) where handled_as = 'TROCAS';

-- Decide e marca de uma vez: true quando a mensagem (já registrada) deve receber a política,
-- e ela fica marcada TROCAS; false deixa quem chamou marcar CONVERSA.
create function inbound_exchange(p_wa_message_id text) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_from text;
begin
  if setting('notificacoes_opcionais') = 'false'::jsonb or setting('notificacoes_desligadas') ? 'trocas' then
    return false;
  end if;
  select from_wa_id into v_from from whatsapp_inbound where wa_message_id = p_wa_message_id;
  if v_from is null then
    return false;
  end if;
  -- Duas mensagens seguidas do mesmo número não disparam duas respostas
  perform pg_advisory_xact_lock(hashtext('trocas:' || v_from));
  if exists (select 1 from whatsapp_inbound
              where from_wa_id = v_from and handled_as = 'TROCAS'
                and received_at > app_now() - make_interval(hours => setting_int('trocas_intervalo_horas'))) then
    return false;
  end if;
  update whatsapp_inbound set handled_as = 'TROCAS' where wa_message_id = p_wa_message_id;
  return true;
end $$;

call lock_down_public();
