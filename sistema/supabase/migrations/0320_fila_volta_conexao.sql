-- 0320 · Fila liberada quando o WhatsApp volta (27/09)
-- Mensagem que falhou espera 1, 5 ou 15 min para tentar de novo. Se a falha foi a conexão
-- (número desconectado, token recusado), ela seguia esperando mesmo depois de a conexão
-- voltar. As APIs contam cada conexão vista; na volta (desconectado → conectado), as
-- mensagens pendentes que já falharam ficam prontas na hora.

insert into app_settings (key, value, description) values
  ('whatsapp_conectado', 'null', 'Última conexão do WhatsApp vista pelas APIs; na volta, a fila libera as mensagens que falharam');

-- Devolve quantas mensagens foram liberadas.
create function whatsapp_connection_seen(p_connected boolean) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
  v_liberadas integer := 0;
begin
  select value into v_antes from app_settings where key = 'whatsapp_conectado' for update;
  if v_antes is not distinct from to_jsonb(p_connected) then
    return 0;
  end if;
  update app_settings set value = to_jsonb(p_connected), updated_at = now() where key = 'whatsapp_conectado';
  if p_connected and v_antes = 'false'::jsonb then
    update outbox_messages set next_attempt_at = app_now()
     where status = 'PENDENTE' and attempts > 0 and next_attempt_at > app_now();
    get diagnostics v_liberadas = row_count;
  end if;
  return v_liberadas;
end $$;

call lock_down_public();
