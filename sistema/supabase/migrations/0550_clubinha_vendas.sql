-- 0550 · Clubinha vendedora (03/10): o atendimento segue um fluxo de venda, com acompanhamento.
--   • Aviso para a equipe (troca e falar com a equipe) com o que a equipe precisa para atender:
--     o primeiro nome, o telefone, o último pedido do número e o que a cliente escreveu nas
--     últimas 2 horas (até 3 mensagens, sem os números do menu). O telefone e as mensagens saem
--     do aviso assim que ele é enviado (ou descartado): na fila fica só o resto.
--   • Boas-vindas com o primeiro nome (da última reserva do número) e a coleção mais nova.
--   • Reserva não paga: a mensagem de reserva expirada leva as peças da reserva que ainda estão
--     à venda, com o link de cada uma. Se a expiração bloqueia o número (0160), o convite sai.
--   • Equipe demorou: a cliente pediu a equipe e, depois de atendimento_lembrete_minutos, ninguém
--     respondeu pelo celular da loja nem ela voltou ao menu. Dentro do horário de atendimento, a
--     Clubinha avisa a cliente e a equipe recebe o aviso de novo, uma vez por pedido.
--   • Pós-entrega: pos_venda_dias depois da entrega ou retirada, a Clubinha pergunta se a cliente
--     gostou e convida para a lista VIP, sempre dentro do horário de atendimento.
-- As mensagens novas são opcionais (a loja desliga no painel) e só vão para quem já conversou ou
-- comprou, no máximo uma de cada por pedido.

insert into app_settings (key, value, description) values
  ('atendimento_lembrete_minutos', '20', 'Minutos sem resposta da equipe, depois que a cliente pede a equipe no WhatsApp, até a Clubinha avisar a cliente e a equipe de novo'),
  ('atendimento_inicio_hora', '8', 'Hora (da loja) em que começam as mensagens de acompanhamento'),
  ('atendimento_fim_hora', '20', 'Hora (da loja) em que param as mensagens de acompanhamento'),
  ('pos_venda_dias', '2', 'Dias depois da entrega ou retirada para a Clubinha perguntar se a cliente gostou');

alter table whatsapp_inbound
  -- Quando a Clubinha avisou de novo a cliente e a equipe (pedido de falar com a equipe sem resposta)
  add column followup_at timestamptz;

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
-- escreveu nas últimas 2 horas (sem "menu" nem os números do menu), na ordem da conversa.
create function wa_customer_brief(p_from text) returns jsonb
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
               where i.from_wa_id = p_from and i.text is not null and i.received_at > app_now() - interval '2 hours'
                 and length(btrim(i.text)) >= 3
                 and lower(btrim(i.text)) !~ '^(op[cç][aã]o\s*)?[0-9]\W*$'
                 and lower(btrim(i.text)) !~ '^(menu|op[cç][oõ]es|in[ií]cio|voltar)\W*$'
               order by i.received_at desc, i.id desc limit 3) m), '[]'))
$$;

-- A equipe respondeu pelo celular da loja nessa conversa depois de p_desde (o robô e a fila não contam).
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

-- ─── Aviso para a equipe com os dados da cliente ────────────────────────────────────

-- Igual à 0540, com os dados da cliente no aviso de falar com a equipe.
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
  if p_handled_as = 'EQUIPE' and not exists (
       select 1 from whatsapp_inbound
        where from_wa_id = v_from and handled_as = 'EQUIPE'
          and received_at > app_now() - make_interval(hours => setting_int('whatsapp_pausa_horas'))) then
    perform store_alert('atendimento', v_id::text, wa_customer_brief(v_from));
  end if;
  update whatsapp_inbound set handled_as = p_handled_as, quick_reply_id = p_quick_reply where wa_message_id = p_wa_message_id;
  return true;
end $$;

-- Cliente falou em troca ou devolução (0510), agora com os dados dela.
create or replace function trg_alert_exchange() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.handled_as = 'TROCAS' and old.handled_as is distinct from 'TROCAS' then
    perform store_alert('troca', new.id::text, case when new.from_wa_id is null then '{}'::jsonb else wa_customer_brief(new.from_wa_id) end);
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

-- ─── Boas-vindas: o nome e a coleção mais nova ──────────────────────────────────────

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
    'pausada', v_from is not null and whatsapp_chat_paused(v_from),
    'menuRecente', v_from is not null and exists (
      select 1 from whatsapp_inbound
       where from_wa_id = v_from and handled_as in ('BOAS_VINDAS', 'MENU') and wa_message_id <> p_wa_message_id
         and received_at > app_now() - make_interval(hours => setting_int('boas_vindas_intervalo_horas'))),
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

-- A cada minuto, dentro do horário de atendimento: o primeiro pedido de falar com a equipe de
-- cada pausa, sem resposta da equipe e sem a cliente voltar ao menu depois de
-- atendimento_lembrete_minutos (e de no máximo 12 horas atrás). Uma vez por pedido.
create function whatsapp_team_followup() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  i record;
  n integer := 0;
begin
  if next_business_time(app_now()) <> app_now() then
    return 0;
  end if;
  for i in
    select w.id, w.from_wa_id, w.received_at
      from whatsapp_inbound w
     where w.handled_as = 'EQUIPE' and w.followup_at is null and w.from_wa_id ~ '^[0-9]{10,15}$'
       and w.received_at between app_now() - interval '12 hours'
                             and app_now() - make_interval(mins => setting_int('atendimento_lembrete_minutos'))
       and not exists (select 1 from whatsapp_inbound b
                        where b.from_wa_id = w.from_wa_id and b.handled_as = 'EQUIPE' and b.received_at < w.received_at
                          and b.received_at > w.received_at - make_interval(hours => setting_int('whatsapp_pausa_horas')))
       and not exists (select 1 from whatsapp_inbound m
                        where m.from_wa_id = w.from_wa_id and m.handled_as = 'MENU' and m.received_at >= w.received_at)
       and not wa_team_replied(w.from_wa_id, w.received_at)
     order by w.received_at
     limit 20
     for update of w skip locked
  loop
    update whatsapp_inbound set followup_at = app_now() where id = i.id;
    perform enqueue_message('atendimento_lembrete:' || i.id, '+' || i.from_wa_id, 'atendimento_lembrete',
                            jsonb_strip_nulls(jsonb_build_object('nome', wa_customer_name(i.from_wa_id))),
                            1::smallint, app_now() + interval '1 hour', p_optional => true);
    perform store_alert('atendimento', i.id::text || ':lembrete',
                        wa_customer_brief(i.from_wa_id) || jsonb_build_object('lembrete', true, 'desde', i.received_at));
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

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('atendimento-acompanhamento', '* * * * *', 'select public.whatsapp_team_followup()');
  end if;
end
$$;

call lock_down_public();
