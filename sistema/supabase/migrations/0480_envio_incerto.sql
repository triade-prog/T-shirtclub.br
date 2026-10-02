-- Envio incerto do WhatsApp (troca para a Wafly, 02/10): quando a ferramenta não responde a
-- tempo (ou a conexão cai no meio), a mensagem pode ter saído. Repetir sozinho mandaria a
-- mesma mensagem duas vezes, e nem a Z-API nem a Wafly documentam uma chave que evite isso.
-- O worker passa p_retry = false nesse caso: a mensagem vai direto para FALHOU, com o motivo,
-- e a equipe confere a conversa antes de reenviar. Recusa clara (4xx, 5xx) segue tentando
-- como antes. A assinatura antiga continua valendo (p_retry tem padrão).

drop function outbox_result(uuid, boolean, text, text);

create function outbox_result(p_id uuid, p_ok boolean, p_provider_message_id text default null, p_error text default null, p_retry boolean default true) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v outbox_messages;
begin
  select * into v from outbox_messages where id = p_id and status = 'ENVIANDO' for update;
  if not found then
    return;
  end if;
  if p_ok then
    update outbox_messages
       set status = 'ENVIADA', sent_at = app_now(), provider_message_id = p_provider_message_id, params = params - 'link', claimed_at = null
     where id = p_id;
  elsif not p_retry or v.attempts >= setting_int('fila_max_tentativas') then
    update outbox_messages set status = 'FALHOU', last_error = left(p_error, 500), params = params - 'link', claimed_at = null where id = p_id;
  else
    update outbox_messages
       set status = 'PENDENTE', last_error = left(p_error, 500), claimed_at = null,
           next_attempt_at = app_now() + (array[interval '1 minute', interval '5 minutes', interval '15 minutes'])[least(v.attempts, 3)]
     where id = p_id;
  end if;
end $$;

call lock_down_public();
