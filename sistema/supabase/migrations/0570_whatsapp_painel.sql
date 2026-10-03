-- 0570 · Painel de WhatsApp como sistema de atendimento (03/10, pedido da loja): a tela deixou de
-- ser uma pilha de blocos e virou 5 abas (Atendimento, Clubinha, Mensagens automáticas, Envios e
-- Configurações). Aqui ficam as leituras que faltavam:
--   · as conversas (quem escreveu nos últimos 30 dias e quem tem chamado aberto), com a última
--     mensagem e o chamado de cada uma;
--   · a conversa inteira de um número: o que a cliente escreveu, o que a Clubinha respondeu, as
--     mensagens automáticas da fila, quando a equipe respondeu pelo celular (sem o texto, como
--     já era) e os passos do chamado; ao lado, as reservas e os chamados anteriores;
--   · o histórico da fila (7 dias, ou até 30), com o motivo da falha e "Tentar de novo";
--   · os números do atendimento (7 ou 30 dias);
--   · o horário de atendimento e os minutos até o lembrete, editáveis no painel.
-- Nada muda no que a cliente recebe.

-- Os telefones de uma conversa: o próprio número e, no celular sem o nono dígito, o número com ele.
create function wa_chat_phones(p_chat text) returns text[]
language sql immutable
as $$
  select coalesce(array_agg(distinct x), '{}')
    from unnest(array['+' || p_chat] || wa_phone_candidates(p_chat)) x
   where x ~ '^\+[1-9][0-9]{7,14}$'
$$;

-- A conversa é a do WhatsApp da equipe (os avisos e os comandos), que não entra no atendimento.
create function wa_is_team_chat(p_chat text) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((setting('avisos_loja_telefone') #>> '{}') = any (wa_chat_phones(p_chat)), false)
$$;

-- Mensagem "da loja" que é eco do próprio sistema (fila ou resposta do robô), não da equipe.
create function wa_store_echo(p_chat text, p_wa_message_id text, p_em timestamptz) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (select 1 from outbox_messages o where o.provider_message_id = p_wa_message_id)
      or exists (select 1 from whatsapp_inbound b
                  where b.from_wa_id = p_chat and b.received_at > p_em - interval '1 hour'
                    and p_wa_message_id = any (b.reply_ids))
$$;

-- O chamado como o painel mostra, com o nome de quem assumiu e de quem finalizou.
create function wa_ticket_json(t whatsapp_tickets) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'numero', t.id, 'status', t.status, 'motivo', t.reason, 'abertoEm', t.opened_at,
    'assumidoEm', t.taken_at, 'assumidoVia', t.taken_via, 'assumidoPor', (select name from admin_users where id = t.taken_by),
    'lembreteEm', t.followup_at,
    'resolvidoEm', t.resolved_at, 'resolvidoVia', t.resolved_via, 'resolvidoPor', (select name from admin_users where id = t.resolved_by),
    'notaPedida', t.rating_asked, 'nota', t.rating)
$$;

-- ─── Conversas ──────────────────────────────────────────────────────────────────────────

-- Quem escreveu nos últimos 30 dias e quem tem chamado aberto (até 150), sem a conversa da equipe.
-- O chamado é o aberto ou o finalizado nos últimos 7 dias.
create function admin_wa_conversations() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with chats as (
    select i.from_wa_id as chat from whatsapp_inbound i
     where i.from_wa_id is not null and i.received_at > app_now() - interval '30 days'
       and coalesce(i.handled_as, '') not in ('COMANDO', 'DA_LOJA')
    union
    select t.chat from whatsapp_tickets t where t.status <> 'RESOLVIDO'
  ), linhas as (
    select c.chat,
           (select t from whatsapp_tickets t
             where t.chat = c.chat and (t.status <> 'RESOLVIDO' or t.resolved_at > app_now() - interval '7 days')
             order by (t.status <> 'RESOLVIDO') desc, t.opened_at desc limit 1) as chamado,
           (select i from whatsapp_inbound i
             where i.from_wa_id = c.chat and coalesce(i.handled_as, '') not in ('COMANDO', 'DA_LOJA')
             order by i.received_at desc, i.id desc limit 1) as ultima,
           (select max(i.received_at) from whatsapp_inbound i
             where i.from_wa_id = c.chat and i.handled_as = 'DA_LOJA'
               and not wa_store_echo(c.chat, i.wa_message_id, i.received_at)) as equipe_em
      from chats c
     where not wa_is_team_chat(c.chat)
  )
  select coalesce(jsonb_agg(j order by aberto desc, em desc), '[]')
    from (select l.chat, (l.chamado).status is not null and (l.chamado).status <> 'RESOLVIDO' as aberto,
                 greatest((l.ultima).received_at, l.equipe_em, (l.chamado).opened_at) as em,
                 jsonb_build_object(
                   'chat', l.chat,
                   'telefone', (wa_phone_candidates(l.chat))[1],
                   'nome', wa_customer_name(l.chat),
                   'ultima', case when (l.ultima).id is not null then jsonb_build_object(
                               'em', (l.ultima).received_at, 'texto', left(btrim((l.ultima).text), 140), 'como', (l.ultima).handled_as) end,
                   'equipeRespondeuEm', l.equipe_em,
                   'chamado', case when (l.chamado).id is not null then wa_ticket_json(l.chamado) end) as j
            from linhas l
           order by 2 desc, 3 desc nulls last
           limit 150) x
$$;

-- A conversa inteira de um número (90 dias, como a guarda das mensagens), a ficha da cliente e
-- os chamados. Os textos da fila saem como modelo e parâmetros: a api-admin monta o texto.
create function admin_wa_conversation(p_chat text) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_tel text[];
  v_desde timestamptz := app_now() - make_interval(days => setting_int('guarda_whatsapp_recebidas_dias'));
begin
  if p_chat is null or p_chat !~ '^[0-9A-Za-z@._:-]{3,60}$' or wa_is_team_chat(p_chat) then
    raise exception 'Conversa inválida' using errcode = 'TS123';
  end if;
  v_tel := wa_chat_phones(p_chat);
  return jsonb_build_object(
    'chat', p_chat,
    'telefone', (wa_phone_candidates(p_chat))[1],
    'nome', wa_customer_name(p_chat),
    'bloqueado', exists (select 1 from phone_blocks b join customers c on c.id = b.customer_id
                          where b.status = 'ATIVO' and c.phone_e164 = any (v_tel)),
    'eventos', coalesce((
      select jsonb_agg(e.j order by e.em, e.ordem)
        from (select * from (
          -- O que a cliente escreveu (e o que a Clubinha fez com isso)
          select i.received_at as em, 1 as ordem, jsonb_build_object(
                   'tipo', 'CLIENTE', 'em', i.received_at, 'texto', i.text, 'como', i.handled_as,
                   'resposta', (select jsonb_build_object('titulo', q.title, 'acao', q.action, 'texto', q.body)
                                  from whatsapp_quick_replies q where q.id = i.quick_reply_id)) as j
            from whatsapp_inbound i
           where i.from_wa_id = p_chat and i.received_at > v_desde
             and coalesce(i.handled_as, '') not in ('COMANDO', 'DA_LOJA')
          union all
          -- A equipe respondeu pelo celular da loja (só o momento; o texto não é guardado)
          select i.received_at, 2, jsonb_build_object('tipo', 'EQUIPE', 'em', i.received_at)
            from whatsapp_inbound i
           where i.from_wa_id = p_chat and i.received_at > v_desde and i.handled_as = 'DA_LOJA'
             and not wa_store_echo(p_chat, i.wa_message_id, i.received_at)
          union all
          -- Mensagens automáticas da fila para este número (os avisos da equipe não entram)
          select coalesce(o.sent_at, o.created_at), 3, jsonb_build_object(
                   'tipo', 'ENVIO', 'id', o.id, 'em', coalesce(o.sent_at, o.created_at), 'modelo', o.template, 'params', o.params,
                   'status', o.status, 'erro', o.last_error, 'tentativas', o.attempts)
            from outbox_messages o
           where o.phone_e164 = any (v_tel) and o.template <> 'aviso_loja' and o.created_at > v_desde
          union all
          -- Os passos dos chamados
          select x.em, 4, jsonb_build_object('tipo', 'CHAMADO', 'em', x.em, 'evento', x.evento, 'numero', t.id,
                                             'motivo', t.reason, 'via', x.via, 'por', (select name from admin_users where id = x.por), 'nota', x.nota)
            from whatsapp_tickets t
            cross join lateral (values ('ABERTO', t.opened_at, null::text, null::uuid, null::smallint),
                                       ('ASSUMIDO', t.taken_at, t.taken_via, t.taken_by, null),
                                       ('LEMBRETE', t.followup_at, null, null, null),
                                       ('FINALIZADO', t.resolved_at, t.resolved_via, t.resolved_by, null),
                                       ('NOTA', t.rated_at, null, null, t.rating)) as x(evento, em, via, por, nota)
           where t.chat = p_chat and x.em is not null and x.em > v_desde
        ) u order by em desc, ordem desc limit 300) e), '[]'),
    'reservas', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.number, 'status', r.status, 'totalCentavos', r.total_cents,
                                          'criadaEm', r.created_at, 'expiraEm', r.expires_at, 'entregueEm', r.delivered_at,
                                          'substatus', (select f.substatus from fulfillments f where f.reservation_id = r.id and f.closed_at is null))
                       order by r.created_at desc)
        from (select * from reservations where phone_e164 = any (v_tel) and status <> 'SELECIONADO' order by created_at desc limit 5) r), '[]'),
    'chamados', coalesce((
      select jsonb_agg(wa_ticket_json(t) order by t.opened_at desc)
        from (select * from whatsapp_tickets where chat = p_chat order by opened_at desc limit 10) t), '[]'));
end $$;

-- ─── Envios ─────────────────────────────────────────────────────────────────────────────

-- Por que a mensagem não pode ser enviada de novo (null: pode). Só a que falhou; a da reserva
-- criada perdeu o link (sai do banco na primeira tentativa); a vencida e a que já não vale para
-- a reserva (ex.: lembrete de uma reserva paga) não voltam.
create function outbox_retry_block(o outbox_messages) returns text
language sql stable
security definer
set search_path = public
as $$
  select case
    when o.status <> 'FALHOU' then 'STATUS'
    when o.template = 'reserva_criada' then 'SEM_LINK'
    when o.valid_until is not null and o.valid_until <= app_now() then 'VENCIDA'
    when o.requires_status is not null
         and o.requires_status is distinct from (select status from reservations where id = o.reservation_id) then 'MUDOU'
  end
$$;

-- p_status: null (todas), FILA (na fila ou saindo), ENVIADA (enviada, entregue ou lida), FALHOU
-- ou DESCARTADA; p_dias de 1 a 30. Até 300 mensagens, as mais novas primeiro, e o resumo dos
-- últimos 7 dias (dia da loja).
create function admin_outbox_list(p_status text default null, p_dias integer default 7) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if p_status is not null and p_status not in ('FILA', 'ENVIADA', 'FALHOU', 'DESCARTADA') or p_dias is null or p_dias not between 1 and 30 then
    raise exception 'Filtro inválido' using errcode = 'TS110';
  end if;
  return jsonb_build_object(
    'mensagens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'telefone', o.phone_e164, 'modelo', o.template, 'params', o.params, 'status', o.status,
               'tentativas', o.attempts, 'criadaEm', o.created_at, 'enviadaEm', o.sent_at, 'entregueEm', o.delivered_at,
               'proximaTentativa', case when o.status = 'PENDENTE' then o.next_attempt_at end, 'erro', o.last_error,
               'nome', coalesce(nullif(split_part(btrim(r.customer_name), ' ', 1), ''), wa_customer_name(substr(o.phone_e164, 2))),
               'reserva', case when r.id is not null then jsonb_build_object('id', r.id, 'numero', r.number) end,
               'naoReenvia', outbox_retry_block(o))
             order by o.created_at desc)
        from (select * from outbox_messages
               where created_at > app_now() - make_interval(days => p_dias)
                 and (p_status is null
                      or (p_status = 'FILA' and status in ('PENDENTE', 'ENVIANDO'))
                      or (p_status = 'ENVIADA' and status in ('ENVIADA', 'ENTREGUE', 'LIDA'))
                      or status::text = p_status)
               order by created_at desc limit 300) o
        left join reservations r on r.id = o.reservation_id), '[]'),
    'dias', (
      select jsonb_agg(jsonb_build_object(
               'dia', d::date,
               'enviadas', (select count(*) from outbox_messages where (sent_at at time zone 'America/Bahia')::date = d::date),
               'falhas', (select count(*) from outbox_messages where status = 'FALHOU' and (created_at at time zone 'America/Bahia')::date = d::date),
               'descartadas', (select count(*) from outbox_messages where status = 'DESCARTADA' and (created_at at time zone 'America/Bahia')::date = d::date))
             order by d)
        from generate_series((app_now() at time zone 'America/Bahia')::date - 6, (app_now() at time zone 'America/Bahia')::date, interval '1 day') d));
end $$;

-- Volta a mensagem que falhou para a fila, na frente (sem esperar), e registra na auditoria.
create function admin_outbox_retry(p_admin uuid, p_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o outbox_messages;
  v_motivo text;
begin
  perform admin_guard(p_admin);
  select * into o from outbox_messages where id = p_id for update;
  if not found then
    raise exception 'Mensagem não encontrada' using errcode = 'TS123';
  end if;
  v_motivo := outbox_retry_block(o);
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;
  update outbox_messages
     set status = 'PENDENTE', attempts = 0, next_attempt_at = app_now(), last_error = null, claimed_at = null
   where id = o.id;
  perform log_audit('ADMIN', p_admin, 'whatsapp.reenvio', 'outbox_messages', o.id::text, o.reservation_id,
                    jsonb_build_object('modelo', o.template, 'erro', left(o.last_error, 200)));
  return jsonb_build_object('ok', true);
end $$;

-- ─── Números do atendimento ─────────────────────────────────────────────────────────────

-- p_dias: 7 ou 30. Conversas (quem escreveu), quantas a Clubinha resolveu sem chamado, os
-- chamados por motivo, o tempo médio até assumir e até finalizar, os lembretes e as notas.
create function admin_wa_report(p_dias integer default 7) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz;
begin
  if p_dias is null or p_dias not in (7, 30) then
    raise exception 'Período inválido' using errcode = 'TS110';
  end if;
  v_desde := app_now() - make_interval(days => p_dias);
  return (
    with conversas as (
      select distinct i.from_wa_id as chat from whatsapp_inbound i
       where i.received_at > v_desde and i.from_wa_id is not null
         and coalesce(i.handled_as, '') not in ('COMANDO', 'DA_LOJA') and not wa_is_team_chat(i.from_wa_id)
    ), chamados as (
      select * from whatsapp_tickets where opened_at > v_desde
    )
    select jsonb_build_object(
      'dias', p_dias,
      'conversas', (select count(*) from conversas),
      'soClubinha', (select count(*) from conversas c where not exists (select 1 from chamados t where t.chat = c.chat)),
      'chamados', (select count(*) from chamados),
      'porMotivo', jsonb_build_object('EQUIPE', (select count(*) from chamados where reason = 'EQUIPE'),
                                      'TROCA', (select count(*) from chamados where reason = 'TROCA'),
                                      'DUVIDA', (select count(*) from chamados where reason = 'DUVIDA')),
      'abertos', (select count(*) from whatsapp_tickets where status <> 'RESOLVIDO'),
      'minutosAteAssumir', (select round(avg(extract(epoch from taken_at - opened_at) / 60)) from chamados where taken_at is not null),
      'minutosAteFinalizar', (select round(avg(extract(epoch from resolved_at - opened_at) / 60)) from chamados where resolved_at is not null),
      'lembretes', (select count(*) from chamados where followup_at is not null),
      'notas', (select jsonb_build_object('media', round(avg(rating)::numeric, 1), 'total', count(rating),
                                          'porNota', jsonb_build_object('1', count(*) filter (where rating = 1), '2', count(*) filter (where rating = 2),
                                                                        '3', count(*) filter (where rating = 3), '4', count(*) filter (where rating = 4),
                                                                        '5', count(*) filter (where rating = 5)))
                  from whatsapp_tickets where rated_at > v_desde)));
end $$;

-- ─── Clubinha: horário de atendimento e dados da prévia ─────────────────────────────────

-- As respostas, a pausa, o horário de atendimento (os acompanhamentos só saem dentro dele), os
-- minutos até o lembrete e o endereço e o horário da loja (para a prévia do menu).
create or replace function admin_quick_replies() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pausaHoras', setting_int('whatsapp_pausa_horas'),
    'atendimento', jsonb_build_object('inicioHora', setting_int('atendimento_inicio_hora'), 'fimHora', setting_int('atendimento_fim_hora'),
                                      'lembreteMinutos', setting_int('atendimento_lembrete_minutos')),
    'loja', jsonb_build_object('endereco', nullif(setting('loja_endereco_retirada') #>> '{}', ''),
                               'horario', nullif(setting('loja_horario_retirada') #>> '{}', '')),
    'respostas', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'acao', action, 'titulo', title, 'palavras', to_jsonb(keywords),
                                          'texto', body, 'ativa', active) order by position, created_at)
        from whatsapp_quick_replies where removed_at is null), '[]'))
$$;

-- p: {pausaHoras?: 1 a 48, inicioHora?: 0 a 23, fimHora?: 1 a 24, lembreteMinutos?: 5 a 240}, ao
-- menos um. O início vem antes do fim. Cada mudança vai para a auditoria.
create or replace function admin_update_quick_reply_settings(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo record;
  v_inicio int;
  v_fim int;
begin
  perform admin_guard(p_admin);
  if jsonb_typeof(p) <> 'object' or not (p ?| array['pausaHoras', 'inicioHora', 'fimHora', 'lembreteMinutos']) then
    raise exception 'Nada para salvar' using errcode = 'TS188';
  end if;
  for v_campo in select * from (values ('pausaHoras', 'whatsapp_pausa_horas', 1, 48, 'whatsapp.pausa'),
                                       ('inicioHora', 'atendimento_inicio_hora', 0, 23, 'whatsapp.horario'),
                                       ('fimHora', 'atendimento_fim_hora', 1, 24, 'whatsapp.horario'),
                                       ('lembreteMinutos', 'atendimento_lembrete_minutos', 5, 240, 'whatsapp.lembrete')) as c(chave, ajuste, minimo, maximo, acao)
  loop
    if p ? v_campo.chave and (jsonb_typeof(p -> v_campo.chave) <> 'number' or (p ->> v_campo.chave) !~ '^[0-9]{1,3}$'
                              or (p ->> v_campo.chave)::int not between v_campo.minimo and v_campo.maximo) then
      raise exception 'Valor inválido: %', v_campo.chave using errcode = 'TS188';
    end if;
  end loop;
  v_inicio := coalesce((p ->> 'inicioHora')::int, setting_int('atendimento_inicio_hora'));
  v_fim := coalesce((p ->> 'fimHora')::int, setting_int('atendimento_fim_hora'));
  if v_inicio >= v_fim then
    raise exception 'O início do atendimento vem antes do fim' using errcode = 'TS188';
  end if;
  for v_campo in select * from (values ('pausaHoras', 'whatsapp_pausa_horas', 'whatsapp.pausa', 'horas'),
                                       ('inicioHora', 'atendimento_inicio_hora', 'whatsapp.horario', 'inicio'),
                                       ('fimHora', 'atendimento_fim_hora', 'whatsapp.horario', 'fim'),
                                       ('lembreteMinutos', 'atendimento_lembrete_minutos', 'whatsapp.lembrete', 'minutos')) as c(chave, ajuste, acao, nome)
  loop
    if p ? v_campo.chave and set_setting(v_campo.ajuste, p -> v_campo.chave, p_admin) then
      perform log_audit('ADMIN', p_admin, v_campo.acao, 'app_settings', v_campo.ajuste, null,
                        jsonb_build_object(v_campo.nome, (p ->> v_campo.chave)::int));
    end if;
  end loop;
  return admin_quick_replies();
end $$;

call lock_down_public();
