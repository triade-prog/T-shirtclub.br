-- 0550 · Clubinha vendedora e chamados (03/10): o atendimento segue um fluxo de venda, com
-- acompanhamento, e o que precisa de gente vira um chamado que a equipe assume e finaliza.
--   • Chamados: abrem quando a cliente pede a equipe, fala em troca ou manda uma dúvida que a
--     Clubinha não sabe responder (depois das boas-vindas). Um aberto por conversa, numerado
--     (#12). A equipe recebe o aviso com quem é a cliente, o telefone, o último pedido e o que
--     ela escreveu; assume e finaliza pelo painel ou respondendo o aviso no WhatsApp ("assumi
--     12", "resolvido 12"). Se a equipe responde pelo celular da loja, o chamado passa sozinho
--     para em atendimento. Enquanto ele está aberto, o robô fica quieto na conversa (pausa da
--     0540); ao finalizar, a Clubinha agradece, pede uma nota de 1 a 5 e volta a responder.
--   • O telefone e as mensagens da cliente saem dos parâmetros do aviso assim que ele deixa a fila.
--   • Boas-vindas com o primeiro nome (da última reserva do número) e a coleção mais nova.
--   • Reserva não paga: a mensagem de reserva expirada leva as peças da reserva que ainda estão
--     à venda, com o link de cada uma. Se a expiração bloqueia o número (0160), o convite sai.
--   • Equipe demorou: o chamado segue aberto, sem ninguém assumir, depois de
--     atendimento_lembrete_minutos. Dentro do horário de atendimento, a Clubinha avisa a cliente
--     e a equipe recebe o aviso de novo, uma vez por chamado.
--   • Pós-entrega: pos_venda_dias depois da entrega ou retirada, a Clubinha pergunta se a cliente
--     gostou e convida para a lista VIP, sempre dentro do horário de atendimento.
--   • Respostas rápidas de partida conferidas com a loja: cartão só à vista (sem parcelamento nem
--     débito), tamanhos Único e Plus, motoboy só em Caetité e o frete pago em até 2 horas.
-- As mensagens novas são opcionais (a loja desliga no painel) e só vão para quem já conversou ou
-- comprou, no máximo uma de cada por pedido ou chamado.

insert into app_settings (key, value, description) values
  ('atendimento_lembrete_minutos', '20', 'Minutos com o chamado aberto sem ninguém assumir até a Clubinha avisar a cliente e a equipe de novo'),
  ('atendimento_inicio_hora', '8', 'Hora (da loja) em que começam as mensagens de acompanhamento'),
  ('atendimento_fim_hora', '20', 'Hora (da loja) em que param as mensagens de acompanhamento'),
  ('pos_venda_dias', '2', 'Dias depois da entrega ou retirada para a Clubinha perguntar se a cliente gostou');

-- ─── Chamados ────────────────────────────────────────────────────────────────────────

create table whatsapp_tickets (
  id           bigint generated always as identity primary key,
  -- A conversa (remetente do WhatsApp) e o telefone dela, quando é telefone
  chat         text not null check (length(chat) between 1 and 60),
  phone_e164   text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  reason       text not null check (reason in ('EQUIPE', 'TROCA', 'DUVIDA')),
  status       text not null default 'ABERTO' check (status in ('ABERTO', 'EM_ATENDIMENTO', 'RESOLVIDO')),
  inbound_id   bigint,
  opened_at    timestamptz not null default app_now(),
  taken_at     timestamptz,
  taken_via    text check (taken_via in ('PAINEL', 'WHATSAPP', 'CELULAR')),
  taken_by     uuid references admin_users (id),
  resolved_at  timestamptz,
  resolved_via text check (resolved_via in ('PAINEL', 'WHATSAPP')),
  resolved_by  uuid references admin_users (id),
  -- Quando a Clubinha avisou de novo a cliente e a equipe (ninguém assumiu)
  followup_at  timestamptz,
  rating_asked boolean not null default false,
  rating       smallint check (rating between 1 and 5),
  rated_at     timestamptz,
  check ((status = 'RESOLVIDO') = (resolved_at is not null)),
  check ((taken_at is null) = (taken_via is null)),
  check (rating is null or rating_asked)
);

create unique index whatsapp_tickets_aberto_idx on whatsapp_tickets (chat) where status <> 'RESOLVIDO';
create index whatsapp_tickets_conversa_idx on whatsapp_tickets (chat, opened_at);

alter table whatsapp_tickets enable row level security;

-- ─── Quem é a cliente ────────────────────────────────────────────────────────────────

-- O telefone (E.164) do remetente do WhatsApp, com o nono dígito quando ele vem sem (como em
-- candidatosDoRemetente). Vazio quando não é telefone (identificador LID).
create function wa_phone_candidates(p_from text) returns text[]
language sql immutable
as $$
  select case when p_from ~ '^55[0-9]{10}$' then array['+' || left(p_from, 4) || '9' || substr(p_from, 5)]
              when p_from ~ '^[0-9]{10,15}$' then array['+' || p_from]
              else '{}'::text[] end
$$;

-- Primeiro nome da última reserva do número, ou null.
create function wa_customer_name(p_from text) returns text
language sql stable
security definer
set search_path = public
as $$
  select nullif(split_part(btrim(customer_name), ' ', 1), '')
    from reservations where phone_e164 = any (wa_phone_candidates(p_from)) order by created_at desc limit 1
$$;

-- O que a equipe precisa para atender: nome, telefone, final, último pedido e o que a cliente
-- escreveu nas 2 horas antes de p_ate (agora, se nulo), até 3 mensagens, sem "menu" nem os
-- números do menu, na ordem da conversa.
create function wa_customer_brief(p_from text, p_ate timestamptz default null) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nome', wa_customer_name(p_from),
    'telefone', (wa_phone_candidates(p_from))[1],
    'final', right(p_from, 4),
    'pedido', (select jsonb_build_object('numero', r.number, 'status', r.status, 'substatus', f.substatus)
                 from reservations r left join fulfillments f on f.reservation_id = r.id
                where r.phone_e164 = any (wa_phone_candidates(p_from))
                order by r.created_at desc limit 1),
    'mensagens', coalesce((
      select jsonb_agg(m.t order by m.received_at, m.id)
        from (select left(btrim(i.text), 160) as t, i.received_at, i.id
                from whatsapp_inbound i
               where i.from_wa_id = p_from and i.text is not null
                 and i.received_at between coalesce(p_ate, app_now()) - interval '2 hours' and coalesce(p_ate, app_now())
                 and coalesce(i.handled_as, '') not in ('COMANDO', 'AVALIACAO')
                 and length(btrim(i.text)) >= 3
                 and lower(btrim(i.text)) !~ '^(op[cç][aã]o\s*)?[0-9]\W*$'
                 and lower(btrim(i.text)) !~ '^(menu|op[cç][oõ]es|in[ií]cio|voltar)\W*$'
               order by i.received_at desc, i.id desc limit 3) m), '[]'))
$$;

-- A equipe respondeu pelo celular da loja nessa conversa desde p_desde (o robô e a fila não contam).
create function wa_team_replied(p_from text, p_desde timestamptz) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from whatsapp_inbound i
     where i.from_wa_id = p_from and i.handled_as = 'DA_LOJA' and i.received_at >= p_desde
       and not exists (select 1 from outbox_messages o where o.provider_message_id = i.wa_message_id)
       and not exists (select 1 from whatsapp_inbound b
                        where b.from_wa_id = p_from and b.received_at > i.received_at - interval '1 hour'
                          and i.wa_message_id = any (b.reply_ids)))
$$;

-- O mesmo instante, ou o começo do próximo horário de atendimento (hora da loja).
create function next_business_time(p timestamptz) returns timestamptz
language sql stable
set search_path = public
as $$
  with h as (select p at time zone 'America/Bahia' as local, setting_int('atendimento_inicio_hora') as ini, setting_int('atendimento_fim_hora') as fim)
  select case when extract(hour from local) >= ini and extract(hour from local) < fim then p
              when extract(hour from local) < ini then (date_trunc('day', local) + make_interval(hours => ini)) at time zone 'America/Bahia'
              else (date_trunc('day', local) + interval '1 day' + make_interval(hours => ini)) at time zone 'America/Bahia' end
    from h
$$;

-- ─── Abrir, assumir e finalizar ─────────────────────────────────────────────────────

-- Abre o chamado da conversa (ou devolve o que já está aberto) e avisa a equipe uma vez, com o
-- número do chamado e os dados da cliente.
create function ticket_open(p_chat text, p_reason text, p_inbound bigint default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare t whatsapp_tickets;
begin
  perform pg_advisory_xact_lock(hashtext('chamado:' || p_chat));
  select * into t from whatsapp_tickets where chat = p_chat and status <> 'RESOLVIDO';
  if found then
    return jsonb_build_object('numero', t.id, 'novo', false);
  end if;
  insert into whatsapp_tickets (chat, phone_e164, reason, inbound_id)
  values (left(p_chat, 60), (wa_phone_candidates(p_chat))[1], p_reason, p_inbound)
  returning * into t;
  perform store_alert(case when p_reason = 'TROCA' then 'troca' else 'atendimento' end, 'chamado:' || t.id,
                      wa_customer_brief(p_chat) || jsonb_build_object('chamado', t.id, 'motivo', p_reason));
  return jsonb_build_object('numero', t.id, 'novo', true);
end $$;

create function ticket_take(p_id bigint, p_via text, p_admin uuid default null) returns whatsapp_tickets
language plpgsql
security definer
set search_path = public
as $$
declare t whatsapp_tickets;
begin
  update whatsapp_tickets set status = 'EM_ATENDIMENTO', taken_at = app_now(), taken_via = p_via, taken_by = p_admin
   where id = p_id and status = 'ABERTO'
  returning * into t;
  if not found then
    select * into t from whatsapp_tickets where id = p_id;
    if not found then
      raise exception 'Chamado não encontrado' using errcode = 'TS130';
    end if;
  else
    perform log_audit(case when p_admin is null then 'SISTEMA' else 'ADMIN' end::actor_type, p_admin, 'chamado.assumido',
                      'whatsapp_ticket', t.id::text, null, jsonb_build_object('via', p_via));
  end if;
  return t;
end $$;

-- Finaliza: a Clubinha agradece e pede a nota (mensagem opcional; desligada, a nota não é pedida).
create function ticket_resolve(p_id bigint, p_via text, p_admin uuid default null) returns whatsapp_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  t whatsapp_tickets;
  v_msg uuid;
begin
  select * into t from whatsapp_tickets where id = p_id for update;
  if not found then
    raise exception 'Chamado não encontrado' using errcode = 'TS130';
  end if;
  if t.status = 'RESOLVIDO' then
    return t;
  end if;
  if t.chat ~ '^[0-9]{10,15}$' then
    v_msg := enqueue_message('atendimento_encerrado:' || t.id, '+' || t.chat, 'atendimento_encerrado',
                             jsonb_strip_nulls(jsonb_build_object('nome', wa_customer_name(t.chat))),
                             1::smallint, app_now() + interval '1 day', p_optional => true);
  end if;
  update whatsapp_tickets
     set status = 'RESOLVIDO', resolved_at = app_now(), resolved_via = p_via, resolved_by = p_admin, rating_asked = v_msg is not null
   where id = p_id
  returning * into t;
  perform log_audit(case when p_admin is null then 'SISTEMA' else 'ADMIN' end::actor_type, p_admin, 'chamado.finalizado',
                    'whatsapp_ticket', t.id::text, null, jsonb_build_object('via', p_via, 'notaPedida', t.rating_asked));
  return t;
end $$;

-- Dúvida que a Clubinha não soube responder: abre o chamado (ou junta ao aberto).
create function inbound_ticket(p_wa_message_id text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_from text;
  v jsonb;
begin
  select id, from_wa_id into v_id, v_from from whatsapp_inbound where wa_message_id = p_wa_message_id;
  if v_from is null then
    return '{"numero": null, "novo": false}';
  end if;
  v := ticket_open(v_from, 'DUVIDA', v_id);
  update whatsapp_inbound set handled_as = 'CHAMADO' where id = v_id;
  return v;
end $$;

-- Comando da equipe no WhatsApp ("assumi 12", "resolvido 12"): só do número que recebe os avisos.
-- Do resto, {"equipe": false}, e a mensagem segue como a de qualquer cliente.
create function ticket_command(p_wa_message_id text, p_acao text, p_numero bigint) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_from text;
  t whatsapp_tickets;
  v_nome text;
  v_resultado text;
begin
  if p_acao not in ('ASSUMIR', 'RESOLVER') then
    raise exception 'Comando inválido: %', p_acao using errcode = '22023';
  end if;
  select id, from_wa_id into v_id, v_from from whatsapp_inbound where wa_message_id = p_wa_message_id;
  if v_from is null or (setting('avisos_loja_telefone') #>> '{}') is null
     or not (setting('avisos_loja_telefone') #>> '{}') = any (wa_phone_candidates(v_from)) then
    return '{"equipe": false}';
  end if;
  update whatsapp_inbound set handled_as = 'COMANDO' where id = v_id;
  select * into t from whatsapp_tickets where id = p_numero;
  if not found then
    return jsonb_build_object('equipe', true, 'resultado', 'NAO_ENCONTRADO', 'numero', p_numero);
  end if;
  v_nome := wa_customer_name(t.chat);
  if t.status = 'RESOLVIDO' then
    v_resultado := 'JA_RESOLVIDO';
  elsif p_acao = 'ASSUMIR' and t.status = 'EM_ATENDIMENTO' then
    v_resultado := 'JA_ASSUMIDO';
  elsif p_acao = 'ASSUMIR' then
    t := ticket_take(t.id, 'WHATSAPP');
    v_resultado := 'ASSUMIDO';
  else
    t := ticket_resolve(t.id, 'WHATSAPP');
    v_resultado := 'RESOLVIDO';
  end if;
  return jsonb_strip_nulls(jsonb_build_object('equipe', true, 'resultado', v_resultado, 'numero', t.id, 'nome', v_nome,
                                              'notaPedida', case when v_resultado = 'RESOLVIDO' then t.rating_asked end));
end $$;

-- Nota de 1 a 5 do último chamado finalizado da conversa (nas 24 horas depois do pedido).
create function ticket_rate(p_wa_message_id text, p_nota integer) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_from text;
  t whatsapp_tickets;
begin
  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'Nota fora de 1 a 5' using errcode = '22023';
  end if;
  select id, from_wa_id into v_id, v_from from whatsapp_inbound where wa_message_id = p_wa_message_id;
  update whatsapp_tickets set rating = p_nota, rated_at = app_now()
   where id = (select id from whatsapp_tickets
                where chat = v_from and status = 'RESOLVIDO' and rating_asked and rating is null
                  and resolved_at > app_now() - interval '24 hours'
                order by resolved_at desc limit 1)
  returning * into t;
  if not found then
    return '{"ok": false}';
  end if;
  update whatsapp_inbound set handled_as = 'AVALIACAO' where id = v_id;
  perform store_alert('avaliacao', t.id::text, jsonb_build_object('chamado', t.id, 'nome', wa_customer_name(t.chat), 'nota', p_nota));
  return jsonb_build_object('ok', true, 'numero', t.id, 'nota', p_nota);
end $$;

-- ─── Pausa: chamado aberto, equipe no celular ───────────────────────────────────────

-- A conversa está com a equipe (0540): a última atividade do chamado aberto (aberto ou
-- assumido), o último pedido de falar com a equipe ou a última mensagem da equipe pelo celular
-- (que não seja do robô), nas últimas whatsapp_pausa_horas, e sem "menu" nem chamado finalizado
-- depois disso.
create or replace function whatsapp_chat_paused(p_from text) returns boolean
language sql stable
security definer
set search_path = public
as $$
  with pausa as (
    select max(x.em) as em
      from (select greatest(t.opened_at, coalesce(t.taken_at, t.opened_at)) as em
              from whatsapp_tickets t where t.chat = p_from and t.status <> 'RESOLVIDO'
            union all
            select i.received_at
              from whatsapp_inbound i
             where i.from_wa_id = p_from
               and (i.handled_as = 'EQUIPE'
                    or (i.handled_as = 'DA_LOJA'
                        and not exists (select 1 from outbox_messages o where o.provider_message_id = i.wa_message_id)
                        and not exists (select 1 from whatsapp_inbound b
                                         where b.from_wa_id = p_from and b.received_at > i.received_at - interval '1 hour'
                                           and i.wa_message_id = any (b.reply_ids))))) x
     where x.em > app_now() - make_interval(hours => setting_int('whatsapp_pausa_horas'))
  ), volta as (
    select max(y.em) as em
      from (select max(received_at) as em from whatsapp_inbound where from_wa_id = p_from and handled_as = 'MENU'
            union all
            select max(resolved_at) from whatsapp_tickets where chat = p_from) y
  )
  select coalesce((select em from pausa) > coalesce((select em from volta), '-infinity'), false)
$$;

-- ─── Aviso para a equipe com os dados da cliente ────────────────────────────────────

-- Igual à 0540; falar com a equipe abre o chamado (que avisa a equipe uma vez).
create or replace function inbound_answer(p_wa_message_id text, p_handled_as text, p_quick_reply uuid default null, p_explicit boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_from text;
begin
  if p_handled_as not in ('RESPOSTA', 'MENU', 'EQUIPE', 'TROCAS') then
    raise exception 'Tratamento inválido: %', p_handled_as using errcode = '22023';
  end if;
  select id, from_wa_id into v_id, v_from from whatsapp_inbound where wa_message_id = p_wa_message_id;
  if v_from is null then
    return false;
  end if;
  -- Duas mensagens seguidas do mesmo número não disparam duas respostas
  perform pg_advisory_xact_lock(hashtext('respostas:' || v_from));
  if not p_explicit and p_quick_reply is not null and exists (
       select 1 from whatsapp_inbound
        where from_wa_id = v_from and quick_reply_id = p_quick_reply and wa_message_id <> p_wa_message_id
          and received_at > app_now() - make_interval(hours => setting_int('respostas_intervalo_horas'))) then
    return false;
  end if;
  if p_handled_as = 'EQUIPE' then
    perform ticket_open(v_from, 'EQUIPE', v_id);
  end if;
  update whatsapp_inbound set handled_as = p_handled_as, quick_reply_id = p_quick_reply where wa_message_id = p_wa_message_id;
  return true;
end $$;

-- Cliente falou em troca ou devolução (0510): abre o chamado, que avisa a equipe com os dados dela.
create or replace function trg_alert_exchange() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.handled_as = 'TROCAS' and old.handled_as is distinct from 'TROCAS' then
    if new.from_wa_id is null then
      perform store_alert('troca', new.id::text);
    else
      perform ticket_open(new.from_wa_id, 'TROCA', new.id);
    end if;
  end if;
  return null;
end $$;

-- O telefone e as mensagens da cliente ficam no aviso só até ele sair da fila.
create function trg_outbox_alert_scrub() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.template = 'aviso_loja' and new.status not in ('PENDENTE', 'ENVIANDO') then
    new.params := new.params - 'telefone' - 'mensagens';
  end if;
  return new;
end $$;

create trigger outbox_aviso_sem_dados before update of status on outbox_messages
  for each row execute function trg_outbox_alert_scrub();

create or replace function store_alert_types() returns text[]
language sql immutable
as $$
  select array['nova_reserva', 'pagamento_aprovado', 'lista_vip', 'frete_calcular', 'cancelamento',
               'pagamento_analise', 'contestacao', 'troca', 'atendimento', 'avaliacao', 'sistema']
$$;

-- ─── O que o webhook pergunta antes de responder ────────────────────────────────────

create or replace function inbound_context(p_wa_message_id text) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare v_from text;
begin
  select from_wa_id into v_from from whatsapp_inbound where wa_message_id = p_wa_message_id;
  return jsonb_build_object(
    'ligadas', not (setting('notificacoes_opcionais') = 'false'::jsonb or setting('notificacoes_desligadas') ? 'resposta_rapida'),
    'chamados', not (setting('notificacoes_opcionais') = 'false'::jsonb or setting('notificacoes_desligadas') ? 'chamado_aberto'),
    'pausada', v_from is not null and whatsapp_chat_paused(v_from),
    'menuRecente', v_from is not null and exists (
      select 1 from whatsapp_inbound
       where from_wa_id = v_from and handled_as in ('BOAS_VINDAS', 'MENU') and wa_message_id <> p_wa_message_id
         and received_at > app_now() - make_interval(hours => setting_int('boas_vindas_intervalo_horas'))),
    -- O último chamado foi finalizado e a nota foi pedida (e não há outro aberto)
    'avaliacaoPendente', v_from is not null
      and exists (select 1 from whatsapp_tickets t
                   where t.chat = v_from and t.status = 'RESOLVIDO' and t.rating_asked and t.rating is null
                     and t.resolved_at > app_now() - interval '24 hours')
      and not exists (select 1 from whatsapp_tickets t where t.chat = v_from and t.status <> 'RESOLVIDO'),
    'endereco', nullif(setting('loja_endereco_retirada') #>> '{}', ''),
    'horario', nullif(setting('loja_horario_retirada') #>> '{}', ''),
    'nome', case when v_from is null then null else wa_customer_name(v_from) end,
    -- A coleção ativa mais nova com alguma peça à venda
    'novidade', (select jsonb_build_object('nome', c.name, 'slug', c.slug)
                   from collections c
                  where c.active and exists (select 1 from products p where p.collection_id = c.id and p.active and p.published_at <= app_now())
                  order by c.created_at desc limit 1),
    'respostas', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'numero', q.n, 'acao', q.action, 'titulo', q.title,
                                          'palavras', to_jsonb(q.keywords), 'texto', q.body) order by q.n)
        from (select r.*, row_number() over (order by r.position, r.created_at) as n
                from whatsapp_quick_replies r where r.active and r.removed_at is null) q), '[]'));
end $$;

create or replace function whatsapp_queue_stats() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with respostas as (
    select count(*) filter (where handled_as in ('CODIGO_ENVIADO', 'MINHA_RESERVA', 'OFERTAS', 'TROCAS', 'BOAS_VINDAS',
                                                  'NUMERO_DIFERENTE', 'REFERENCIA_INVALIDA', 'BLOQUEADO',
                                                  'RESPOSTA', 'MENU', 'EQUIPE', 'CHAMADO', 'AVALIACAO')) as enviadas,
           count(*) filter (where handled_as = 'FALHA_ENVIO') as falhas
      from whatsapp_inbound
     where received_at >= inicio_do_dia()
  )
  select jsonb_build_object(
    'pendentes', (select count(*) from outbox_messages where status in ('PENDENTE', 'ENVIANDO')),
    'enviadasHoje', (select count(*) from outbox_messages where sent_at >= inicio_do_dia()) + (select enviadas from respostas),
    'respostasHoje', (select enviadas from respostas),
    'falhasHoje', (select count(*) from outbox_messages where status = 'FALHOU' and created_at >= inicio_do_dia()) + (select falhas from respostas),
    'descartadasHoje', (select count(*) from outbox_messages where status = 'DESCARTADA' and created_at >= inicio_do_dia()),
    'maisAntigaPendente', (select min(created_at) from outbox_messages where status = 'PENDENTE'))
$$;

-- ─── Reserva não paga: as peças que ainda estão à venda ─────────────────────────────

-- Ao entrar na fila, a mensagem de reserva expirada ganha as peças da reserva que seguem à venda
-- (até 5). Número já bloqueado: sem convite para reservar de novo.
create function trg_outbox_expired_items() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.template <> 'reserva_expirada' or new.reservation_id is null then
    return new;
  end if;
  if exists (select 1 from phone_blocks b join reservations r on r.customer_id = b.customer_id
              where r.id = new.reservation_id and b.status = 'ATIVO') then
    new.params := new.params || '{"pausada": true}';
    return new;
  end if;
  new.params := new.params || jsonb_build_object('disponiveis', coalesce((
    select jsonb_agg(jsonb_build_object('nome', x.nome, 'slug', x.slug) order by x.nome)
      from (select distinct p.name || case when v.size = 'PLUS' then ' (Plus)' else '' end as nome, p.slug
              from reservation_items i
              join product_variants v on v.id = i.variant_id
              join products p on p.id = i.product_id
              join collections c on c.id = p.collection_id
             where i.reservation_id = new.reservation_id
               and p.active and p.published_at <= app_now() and c.active and v.active
               and v.qty_total - v.qty_reserved - v.qty_sold > 0
             limit 5) x), '[]'));
  return new;
exception when others then
  -- A mensagem sai mesmo sem a lista
  return new;
end $$;

create trigger outbox_reserva_expirada_pecas before insert on outbox_messages
  for each row execute function trg_outbox_expired_items();

-- A expiração que bloqueia o número (0160) enfileira a mensagem antes do bloqueio: tira o convite.
create function trg_block_expired_message() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update outbox_messages set params = (params - 'disponiveis') || '{"pausada": true}'
   where template = 'reserva_expirada' and status = 'PENDENTE' and reservation_id = any (new.trigger_reservations);
  return null;
end $$;

create trigger bloqueio_sem_convite after insert on phone_blocks
  for each row execute function trg_block_expired_message();

-- ─── Equipe demorou ─────────────────────────────────────────────────────────────────

-- A cada minuto. Primeiro, o chamado em que a equipe já respondeu pelo celular da loja passa a
-- em atendimento. Depois, dentro do horário de atendimento: o chamado aberto há mais de
-- atendimento_lembrete_minutos (e no máximo 12 horas), sem ninguém assumir e sem a cliente
-- voltar ao menu, ganha o aviso para a cliente e o aviso de novo para a equipe. Uma vez por chamado.
create function whatsapp_team_followup() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  n integer := 0;
begin
  for t in select id from whatsapp_tickets where status = 'ABERTO' and wa_team_replied(chat, opened_at) loop
    perform ticket_take(t.id, 'CELULAR');
  end loop;
  if next_business_time(app_now()) <> app_now() then
    return 0;
  end if;
  for t in
    select w.id, w.chat, w.reason, w.opened_at
      from whatsapp_tickets w
     where w.status = 'ABERTO' and w.followup_at is null and w.chat ~ '^[0-9]{10,15}$'
       and w.opened_at between app_now() - interval '12 hours'
                           and app_now() - make_interval(mins => setting_int('atendimento_lembrete_minutos'))
       and not exists (select 1 from whatsapp_inbound m
                        where m.from_wa_id = w.chat and m.handled_as = 'MENU' and m.received_at >= w.opened_at)
     order by w.opened_at
     limit 20
     for update of w skip locked
  loop
    update whatsapp_tickets set followup_at = app_now() where id = t.id;
    perform enqueue_message('atendimento_lembrete:' || t.id, '+' || t.chat, 'atendimento_lembrete',
                            jsonb_strip_nulls(jsonb_build_object('nome', wa_customer_name(t.chat))),
                            1::smallint, app_now() + interval '1 hour', p_optional => true);
    perform store_alert('atendimento', t.id::text || ':lembrete',
                        wa_customer_brief(t.chat, t.opened_at)
                        || jsonb_build_object('chamado', t.id, 'motivo', t.reason, 'lembrete', true, 'desde', t.opened_at));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ─── Pós-entrega ────────────────────────────────────────────────────────────────────

create function trg_after_sale_followup() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_quando timestamptz;
begin
  if new.status = 'ENTREGUE' and old.status is distinct from 'ENTREGUE' then
    v_quando := next_business_time(app_now() + make_interval(days => setting_int('pos_venda_dias')));
    v_id := enqueue_message('pos_venda:' || new.id, new.phone_e164, 'pos_venda', '{}'::jsonb, 2::smallint,
                            v_quando + interval '1 day', new.id, 'ENTREGUE', p_optional => true);
    if v_id is not null then
      update outbox_messages set next_attempt_at = v_quando where id = v_id;
    end if;
  end if;
  return null;
exception when others then
  -- O acompanhamento é um extra: a entrega segue mesmo se ele falhar
  return null;
end $$;

create trigger pos_venda after update of status on reservations
  for each row execute function trg_after_sale_followup();

-- ─── Painel ─────────────────────────────────────────────────────────────────────────

-- Os chamados abertos (mais antigos primeiro) e os finalizados dos últimos 7 dias, com a nota
-- média dos últimos 30 dias.
create function admin_tickets() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with linhas as (
    select t.*, wa_customer_brief(t.chat, t.opened_at) as cliente from whatsapp_tickets t
     where t.status <> 'RESOLVIDO' or t.resolved_at > app_now() - interval '7 days'
  ), json as (
    select l.status, l.opened_at, l.resolved_at,
           jsonb_build_object('numero', l.id, 'status', l.status, 'motivo', l.reason,
                              'nome', l.cliente -> 'nome', 'telefone', l.cliente -> 'telefone', 'final', l.cliente -> 'final',
                              'pedido', l.cliente -> 'pedido', 'mensagens', l.cliente -> 'mensagens',
                              'abertoEm', l.opened_at, 'assumidoEm', l.taken_at, 'assumidoVia', l.taken_via,
                              'resolvidoEm', l.resolved_at, 'resolvidoVia', l.resolved_via,
                              'notaPedida', l.rating_asked, 'nota', l.rating) as j
      from linhas l
  )
  select jsonb_build_object(
    'abertos', coalesce((select jsonb_agg(j order by opened_at) from json where status <> 'RESOLVIDO'), '[]'),
    'finalizados', coalesce((select jsonb_agg(j order by resolved_at desc)
                               from (select * from json where status = 'RESOLVIDO' order by resolved_at desc limit 30) f), '[]'),
    'notas', (select jsonb_build_object('media', round(avg(rating)::numeric, 1), 'total', count(rating))
                from whatsapp_tickets where rated_at > app_now() - interval '30 days'))
$$;

create function admin_take_ticket(p_admin uuid, p_id bigint) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  perform ticket_take(p_id, 'PAINEL', p_admin);
  return admin_tickets();
end $$;

create function admin_resolve_ticket(p_admin uuid, p_id bigint) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  perform ticket_resolve(p_id, 'PAINEL', p_admin);
  return admin_tickets();
end $$;

-- ─── Respostas de partida conferidas com a loja ─────────────────────────────────────
-- Só as que a loja ainda não mudou no painel.

update whatsapp_quick_replies set updated_at = app_now(), body =
  E'A maioria das nossas T-shirts é em tamanho *Único*, e algumas também têm a versão *Plus*. Na página de cada peça você vê os tamanhos que ainda temos 👇\n{site}\n\nQuer saber se uma peça veste bem em você? Me conta aqui o nome da peça e o tamanho que você costuma usar, que eu passo pra equipe 💖'
 where action = 'TEXTO' and title = 'Tamanhos e medidas'
   and body = E'No site, cada peça mostra os tamanhos que ainda temos.\n\nFicou entre dois? Me manda aqui o nome da peça e o tamanho que você costuma usar, que a equipe te ajuda a escolher 💖';

update whatsapp_quick_replies set updated_at = app_now(), body =
  E'Você escolhe na sacola e confirma depois de pagar a reserva:\n• *Retirada na loja*, sem custo\n• *Motoboy*, só em Caetité\n• *Envio* pelos Correios ou transportadora, para as outras cidades\n\nO frete do motoboy e do envio a loja calcula pelo seu endereço, e você paga pelo site em até 2 horas.'
 where action = 'TEXTO' and title = 'Entrega e frete'
   and body = E'Você escolhe depois de pagar a reserva:\n• *Retirada na loja*, sem custo\n• *Motoboy*, na cidade\n• *Envio* pelos Correios ou transportadora\n\nO frete do motoboy e do envio a loja calcula pelo seu endereço, e você paga pelo site.';

update whatsapp_quick_replies set updated_at = app_now(), body =
  E'É tudo pelo site, com o Mercado Pago:\n• *PIX*, confirmado na hora\n• *Cartão de crédito*, à vista\n\nPor enquanto não temos parcelamento nem cartão de débito.\n\nDepois de reservar, o link para pagar chega aqui no WhatsApp ✦'
 where action = 'TEXTO' and title = 'Pagamento'
   and body = E'É tudo pelo site, com o Mercado Pago:\n• *PIX*, confirmado na hora\n• *Cartão de crédito*\n\nDepois de reservar, o link para pagar chega aqui no WhatsApp ✦';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('atendimento-acompanhamento', '* * * * *', 'select public.whatsapp_team_followup()');
  end if;
end
$$;

call lock_down_public();
