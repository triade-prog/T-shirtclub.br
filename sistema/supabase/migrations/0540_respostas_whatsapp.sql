-- 0540 · Atendimento automático no WhatsApp (03/10): até aqui o robô respondia só a mensagens
-- exatas (código, "minha reserva", "ofertas", troca) e, ao resto, as boas-vindas com o site.
-- Agora:
--   • Respostas rápidas que a loja escreve no painel, cada uma com palavras que a disparam
--     ("frete", "pix", "tamanho"...), mesmo no meio da frase. A mesma resposta por palavra sai
--     no máximo 1 vez a cada respostas_intervalo_horas para o mesmo número.
--   • Menu numerado nas boas-vindas e quando a cliente manda "menu": as respostas ativas, na
--     ordem do painel (até 9). O número escolhido vale até boas_vindas_intervalo_horas depois do menu.
--   • Além dos textos, o menu tem as ações que já existiam (minha reserva, ofertas, trocas) e
--     "falar com a equipe", que avisa o WhatsApp da equipe (aviso atendimento, 0510).
--   • Pausa: quando a equipe responde a cliente pelo celular da loja, ou a cliente pede a
--     equipe, o robô fica quieto naquela conversa por whatsapp_pausa_horas. Só o pedido de
--     código, "minha reserva", "ofertas" e "menu" seguem respondidos.
-- As mensagens que o próprio sistema manda também chegam ao webhook como "da loja": para não
-- confundir com a equipe, cada resposta guarda o id que a ferramenta devolveu (reply_ids), e a
-- fila já guarda o dela (provider_message_id). A conferência é feita na hora de decidir, quando
-- os ids já foram gravados. Da mensagem da equipe fica só o id, a conversa e a hora, sem o texto.

insert into app_settings (key, value, description) values
  ('whatsapp_pausa_horas', '4', 'Horas que o atendimento automático fica quieto numa conversa depois que a equipe responde pelo celular da loja ou a cliente pede a equipe'),
  ('respostas_intervalo_horas', '12', 'Intervalo mínimo para a mesma resposta rápida, disparada por palavra, ao mesmo número');

-- Palavras já normalizadas (minúsculas, sem acento), de 2 a 40 letras ou números, em até 4 palavras.
create function quick_reply_keywords_ok(p text[]) returns boolean
language sql immutable
as $$
  select cardinality(p) <= 15
     and not exists (select 1 from unnest(p) k where k is null or k !~ '^[a-z0-9]+( [a-z0-9]+){0,3}$' or length(k) not between 2 and 40)
$$;

create table whatsapp_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  -- TEXTO: a resposta escrita no painel. As outras são as ações do robô; EQUIPE também tem texto.
  action     text not null check (action in ('TEXTO', 'MINHA_RESERVA', 'OFERTAS', 'TROCAS', 'EQUIPE')),
  title      text not null check (length(btrim(title)) between 2 and 40 and title = btrim(title)),
  keywords   text[] not null default '{}' check (quick_reply_keywords_ok(keywords)),
  body       text check (length(btrim(body)) between 2 and 1000),
  active     boolean not null default true,
  position   smallint not null check (position between 1 and 99),
  created_at timestamptz not null default app_now(),
  updated_at timestamptz not null default app_now(),
  -- Excluída pelo painel: some da tela e do robô (só as de texto; as ações se desligam)
  removed_at timestamptz,
  check ((action in ('TEXTO', 'EQUIPE')) = (body is not null)),
  check (removed_at is null or (action = 'TEXTO' and not active))
);

create unique index whatsapp_quick_replies_acao_idx on whatsapp_quick_replies (action) where action <> 'TEXTO';

alter table whatsapp_quick_replies enable row level security;

alter table whatsapp_inbound
  add column quick_reply_id uuid references whatsapp_quick_replies (id),
  -- Ids (na ferramenta) das respostas do robô a esta mensagem
  add column reply_ids text[] check (cardinality(reply_ids) <= 10);

create index whatsapp_inbound_conversa_idx on whatsapp_inbound (from_wa_id, received_at)
  where handled_as in ('DA_LOJA', 'EQUIPE', 'MENU', 'BOAS_VINDAS', 'RESPOSTA');

-- Os textos de partida, na voz da Clubinha (a assistente virtual da loja); a loja muda tudo no painel. {site}, {endereco} e {horario} viram o
-- endereço do site e o endereço e o horário da retirada (configurações da loja).
insert into whatsapp_quick_replies (position, action, title, keywords, body) values
  (1, 'TEXTO', 'Ver as peças e reservar', '{catalogo,colecao,colecoes,modelos,estampas,reservar,como comprar}',
   E'Todas as peças, com fotos, preços e tamanhos, estão no site 👇\n{site}\n\nEscolhe as suas, coloca na sacola e reserva com o seu WhatsApp. A reserva segura as peças enquanto você paga ✦'),
  (2, 'TEXTO', 'Tamanhos e medidas', '{tamanho,tamanhos,medida,medidas,numeracao,veste,vestir,forma pequeno,forma grande}',
   E'No site, cada peça mostra os tamanhos que ainda temos.\n\nFicou entre dois? Me manda aqui o nome da peça e o tamanho que você costuma usar, que a equipe te ajuda a escolher 💖'),
  (3, 'TEXTO', 'Entrega e frete', '{entrega,entregam,entregar,frete,envio,enviam,correios,motoboy,retirada,retirar,prazo}',
   E'Você escolhe depois de pagar a reserva:\n• *Retirada na loja*, sem custo\n• *Motoboy*, na cidade\n• *Envio* pelos Correios ou transportadora\n\nO frete do motoboy e do envio a loja calcula pelo seu endereço, e você paga pelo site.'),
  (4, 'TEXTO', 'Pagamento', '{pix,pagamento,pagar,cartao,credito,debito,parcela,parcelar,parcelado}',
   E'É tudo pelo site, com o Mercado Pago:\n• *PIX*, confirmado na hora\n• *Cartão de crédito*\n\nDepois de reservar, o link para pagar chega aqui no WhatsApp ✦'),
  (5, 'TEXTO', 'Horário e endereço', '{horario,endereco,onde fica,localizacao,aberto,abre,fecha,funcionamento}',
   E'A loja fica aqui:\n📍 {endereco}\n🕒 {horario}'),
  (6, 'MINHA_RESERVA', 'Minha reserva', '{}', null),
  (7, 'OFERTAS', 'Ofertas e cupons', '{cupom,cupons,desconto,descontos}', null),
  (8, 'TROCAS', 'Trocas e devoluções', '{}', null),
  (9, 'EQUIPE', 'Falar com a equipe', '{atendente,atendimento,falar com alguem,falar com voces}',
   E'Pronto! Já chamei a equipe, e alguém te responde por aqui assim que puder 💖');

-- ─── Pausa ───────────────────────────────────────────────────────────────────────────

-- A conversa está com a equipe: a mensagem mais recente da equipe (que não seja do robô) ou o
-- pedido de falar com a equipe, nas últimas whatsapp_pausa_horas, e sem "menu" depois disso.
create function whatsapp_chat_paused(p_from text) returns boolean
language sql stable
security definer
set search_path = public
as $$
  with pausa as (
    select max(i.received_at) as em
      from whatsapp_inbound i
     where i.from_wa_id = p_from
       and i.received_at > app_now() - make_interval(hours => setting_int('whatsapp_pausa_horas'))
       and (i.handled_as = 'EQUIPE'
            or (i.handled_as = 'DA_LOJA'
                and not exists (select 1 from outbox_messages o where o.provider_message_id = i.wa_message_id)
                and not exists (select 1 from whatsapp_inbound b
                                 where b.from_wa_id = p_from and b.received_at > i.received_at - interval '1 hour'
                                   and i.wa_message_id = any (b.reply_ids))))
  )
  select coalesce((select em from pausa)
                  > coalesce((select max(received_at) from whatsapp_inbound where from_wa_id = p_from and handled_as = 'MENU'), '-infinity'),
                  false)
$$;

-- Mensagem que saiu do número da loja (webhook "da loja"). As da API (fromApi) nem chegam aqui.
create function inbound_from_store(p_wa_message_id text, p_chat text) returns void
language sql
security definer
set search_path = public
as $$
  insert into whatsapp_inbound (wa_message_id, from_wa_id, handled_as)
  values (p_wa_message_id, left(p_chat, 60), 'DA_LOJA')
  on conflict (wa_message_id) do nothing
$$;

-- Id da resposta que o robô mandou a uma mensagem recebida.
create function inbound_reply_sent(p_wa_message_id text, p_reply_id text) returns void
language sql
security definer
set search_path = public
as $$
  update whatsapp_inbound set reply_ids = coalesce(reply_ids, '{}') || left(p_reply_id, 200)
   where wa_message_id = p_wa_message_id and length(p_reply_id) > 0 and coalesce(cardinality(reply_ids), 0) < 10
$$;

-- ─── O que o webhook pergunta antes de responder ────────────────────────────────────

create function inbound_context(p_wa_message_id text) returns jsonb
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
    'respostas', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'numero', q.n, 'acao', q.action, 'titulo', q.title,
                                          'palavras', to_jsonb(q.keywords), 'texto', q.body) order by q.n)
        from (select r.*, row_number() over (order by r.position, r.created_at) as n
                from whatsapp_quick_replies r where r.active and r.removed_at is null) q), '[]'));
end $$;

-- Decide e marca de uma vez: true quando a resposta deve sair. Por palavra (p_explicit false),
-- a mesma resposta não se repete ao mesmo número dentro de respostas_intervalo_horas; escolhida
-- no menu, sempre sai. EQUIPE avisa a equipe uma vez por pausa, com o primeiro nome da última
-- reserva do número e o final do telefone (a conversa a equipe acha no WhatsApp da loja).
create function inbound_answer(p_wa_message_id text, p_handled_as text, p_quick_reply uuid default null, p_explicit boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_from text;
  v_nome text;
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
    select split_part(btrim(customer_name), ' ', 1) into v_nome
      from reservations where phone_e164 = '+' || v_from order by created_at desc limit 1;
    perform store_alert('atendimento', v_id::text, jsonb_build_object('final', right(v_from, 4), 'nome', nullif(v_nome, '')));
  end if;
  update whatsapp_inbound set handled_as = p_handled_as, quick_reply_id = p_quick_reply where wa_message_id = p_wa_message_id;
  return true;
end $$;

-- ─── Aviso para a equipe e contador ─────────────────────────────────────────────────

create or replace function store_alert_types() returns text[]
language sql immutable
as $$
  select array['nova_reserva', 'pagamento_aprovado', 'lista_vip', 'frete_calcular', 'cancelamento',
               'pagamento_analise', 'contestacao', 'troca', 'atendimento', 'sistema']
$$;

create or replace function whatsapp_queue_stats() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with respostas as (
    select count(*) filter (where handled_as in ('CODIGO_ENVIADO', 'MINHA_RESERVA', 'OFERTAS', 'TROCAS', 'BOAS_VINDAS',
                                                  'NUMERO_DIFERENTE', 'REFERENCIA_INVALIDA', 'BLOQUEADO',
                                                  'RESPOSTA', 'MENU', 'EQUIPE')) as enviadas,
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

-- ─── Painel ─────────────────────────────────────────────────────────────────────────

create function admin_quick_replies() returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pausaHoras', setting_int('whatsapp_pausa_horas'),
    'respostas', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'acao', action, 'titulo', title, 'palavras', to_jsonb(keywords),
                                          'texto', body, 'ativa', active) order by position, created_at)
        from whatsapp_quick_replies where removed_at is null), '[]'))
$$;

-- p: {id?, titulo, palavras, texto?, ativa}. Sem id, cria uma resposta de texto no fim da lista.
-- Até 20 respostas e 9 ativas (o menu vai de 1 a 9).
create function admin_save_quick_reply(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r whatsapp_quick_replies;
  v_titulo text := btrim(p ->> 'titulo');
  v_palavras text[];
  v_texto text := nullif(btrim(p ->> 'texto'), '');
  v_ativa boolean := coalesce((p ->> 'ativa')::boolean, true);
begin
  perform admin_guard(p_admin);
  if jsonb_typeof(p -> 'palavras') <> 'array'
     or exists (select 1 from jsonb_array_elements(p -> 'palavras') x where jsonb_typeof(x) <> 'string') then
    raise exception 'Palavras inválidas' using errcode = 'TS188';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_palavras from jsonb_array_elements_text(p -> 'palavras') x;
  if v_titulo is null or length(v_titulo) not between 2 and 40 or not quick_reply_keywords_ok(v_palavras) then
    raise exception 'Resposta inválida' using errcode = 'TS188';
  end if;

  if p ? 'id' then
    select * into r from whatsapp_quick_replies where id = (p ->> 'id')::uuid and removed_at is null for update;
    if not found then
      raise exception 'Resposta não encontrada' using errcode = 'TS123';
    end if;
  else
    if (select count(*) from whatsapp_quick_replies where removed_at is null) >= 20 then
      raise exception 'Limite de respostas' using errcode = 'TS189';
    end if;
    r.action := 'TEXTO';
  end if;
  if r.action not in ('TEXTO', 'EQUIPE') then
    v_texto := null;
  elsif v_texto is null or length(v_texto) > 1000 then
    raise exception 'Texto da resposta inválido' using errcode = 'TS188';
  end if;
  if v_ativa and (select count(*) from whatsapp_quick_replies where active and removed_at is null and id is distinct from r.id) >= 9 then
    raise exception 'O menu tem até 9 opções' using errcode = 'TS189';
  end if;

  if r.id is null then
    insert into whatsapp_quick_replies (action, title, keywords, body, active, position)
    values ('TEXTO', v_titulo, v_palavras, v_texto, v_ativa,
            least(99, coalesce((select max(position) from whatsapp_quick_replies where removed_at is null), 0) + 1))
    returning * into r;
  else
    update whatsapp_quick_replies
       set title = v_titulo, keywords = v_palavras, body = v_texto, active = v_ativa, updated_at = app_now()
     where id = r.id
     returning * into r;
  end if;
  perform log_audit('ADMIN', p_admin, 'whatsapp.resposta', 'whatsapp_quick_replies', r.id::text, null,
                    jsonb_build_object('acao', r.action, 'titulo', r.title, 'ativa', r.active, 'nova', not (p ? 'id')));
  return admin_quick_replies();
end $$;

-- A ordem do menu: todos os ids da tela, na ordem nova.
create function admin_order_quick_replies(p_admin uuid, p_ids uuid[]) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  if p_ids is null or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or array(select x from unnest(p_ids) x order by x) <> array(select id from whatsapp_quick_replies where removed_at is null order by id) then
    raise exception 'Ordem inválida' using errcode = 'TS188';
  end if;
  update whatsapp_quick_replies r set position = o.n, updated_at = app_now()
    from unnest(p_ids) with ordinality as o (id, n)
   where r.id = o.id and r.position <> o.n;
  perform log_audit('ADMIN', p_admin, 'whatsapp.respostas_ordem', 'whatsapp_quick_replies', 'ordem');
  return admin_quick_replies();
end $$;

-- Só as de texto saem; as ações (minha reserva, ofertas, trocas, equipe) se desligam.
create function admin_remove_quick_reply(p_admin uuid, p_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r whatsapp_quick_replies;
begin
  perform admin_guard(p_admin);
  select * into r from whatsapp_quick_replies where id = p_id and removed_at is null for update;
  if not found then
    raise exception 'Resposta não encontrada' using errcode = 'TS123';
  end if;
  if r.action <> 'TEXTO' then
    raise exception 'Esta opção só pode ser desligada' using errcode = 'TS188';
  end if;
  update whatsapp_quick_replies set removed_at = app_now(), active = false, updated_at = app_now() where id = p_id;
  perform log_audit('ADMIN', p_admin, 'whatsapp.resposta_excluida', 'whatsapp_quick_replies', p_id::text, null, jsonb_build_object('titulo', r.title));
  return admin_quick_replies();
end $$;

-- p: {pausaHoras: 1 a 48}
create function admin_update_quick_reply_settings(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  if jsonb_typeof(p -> 'pausaHoras') <> 'number' or (p ->> 'pausaHoras') !~ '^[0-9]{1,2}$' or (p ->> 'pausaHoras')::int not between 1 and 48 then
    raise exception 'Pausa inválida' using errcode = 'TS188';
  end if;
  if set_setting('whatsapp_pausa_horas', p -> 'pausaHoras', p_admin) then
    perform log_audit('ADMIN', p_admin, 'whatsapp.pausa', 'app_settings', 'whatsapp_pausa_horas', null, jsonb_build_object('horas', (p ->> 'pausaHoras')::int));
  end if;
  return admin_quick_replies();
end $$;

call lock_down_public();
