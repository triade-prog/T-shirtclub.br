-- 0160 · Bloqueio de telefone por abuso (seção 09, regra 21)
-- 3 reservas expiradas por prazo em 30 dias pausam as reservas do telefone. O bloqueio não
-- expira sozinho: só o painel libera (zera o contador operacional, sem apagar histórico) ou
-- mantém, sempre com motivo. Cancelamento aprovado não conta (só PRAZO_ESGOTADO).

-- Chamada dentro da expiração (0140). O índice único do bloqueio ativo evita dois bloqueios
-- sem precisar travar a cliente.
create function check_phone_block(p_customer_id uuid, p_reservation_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c customers;
  v_ids uuid[];
  v_block uuid;
begin
  select * into c from customers where id = p_customer_id;
  select array_agg(id order by expired_at) into v_ids
    from reservations
   where customer_id = p_customer_id and status = 'EXPIRADO' and closure_reason = 'PRAZO_ESGOTADO'
     and expired_at > greatest(app_now() - make_interval(days => setting_int('bloqueio_janela_dias')),
                               coalesce(c.expiration_counter_reset_at, '-infinity'));
  if coalesce(array_length(v_ids, 1), 0) < setting_int('bloqueio_expiracoes') then
    return false;
  end if;

  insert into phone_blocks (customer_id, trigger_reservations) values (p_customer_id, v_ids)
  on conflict (customer_id) where status = 'ATIVO' do nothing
  returning id into v_block;
  if v_block is null then
    return false; -- já estava bloqueado
  end if;

  perform enqueue_message('telefone_bloqueado:' || v_block, c.phone_e164, 'telefone_bloqueado', '{}'::jsonb,
                          2::smallint, app_now() + interval '1 day', p_optional => true);
  perform log_audit('SISTEMA', null, 'telefone.bloqueado', 'phone_block', v_block::text, p_reservation_id,
                    jsonb_build_object('customer_id', p_customer_id, 'expiracoes', array_length(v_ids, 1)));
  return true;
end $$;

-- Liberar: o contador recomeça a partir de agora (a 4ª expiração conta como 1, T14).
create function release_phone_block(p_block_id uuid, p_admin uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b phone_blocks;
  v_motivo text := btrim(coalesce(p_reason, ''));
begin
  perform admin_guard(p_admin);
  if length(v_motivo) not between 3 and 500 then
    raise exception 'A decisão precisa de um motivo' using errcode = 'TS121';
  end if;
  select * into b from phone_blocks where id = p_block_id for update;
  if not found then
    raise exception 'Bloqueio não encontrado' using errcode = 'TS130';
  end if;
  if b.status <> 'ATIVO' then
    raise exception 'Este bloqueio já foi liberado' using errcode = 'TS161';
  end if;
  update phone_blocks set status = 'LIBERADO', released_at = app_now(), released_by = p_admin, release_reason = v_motivo where id = b.id;
  update customers set expiration_counter_reset_at = app_now() where id = b.customer_id;
  insert into phone_block_decisions (block_id, decision, reason, admin_id) values (b.id, 'LIBERAR', v_motivo, p_admin);
  perform enqueue_message('telefone_liberado:' || b.id, (select phone_e164 from customers where id = b.customer_id),
                          'telefone_liberado', '{}'::jsonb, 2::smallint, app_now() + interval '1 day', p_optional => true);
  perform log_audit('ADMIN', p_admin, 'telefone.liberado', 'phone_block', b.id::text, null,
                    jsonb_build_object('customer_id', b.customer_id, 'motivo', v_motivo));
end $$;

-- Manter: registra a decisão e o motivo; o bloqueio continua ativo.
create function keep_phone_block(p_block_id uuid, p_admin uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b phone_blocks;
  v_motivo text := btrim(coalesce(p_reason, ''));
begin
  perform admin_guard(p_admin);
  if length(v_motivo) not between 3 and 500 then
    raise exception 'A decisão precisa de um motivo' using errcode = 'TS121';
  end if;
  select * into b from phone_blocks where id = p_block_id for update;
  if not found then
    raise exception 'Bloqueio não encontrado' using errcode = 'TS130';
  end if;
  if b.status <> 'ATIVO' then
    raise exception 'Este bloqueio já foi liberado' using errcode = 'TS161';
  end if;
  insert into phone_block_decisions (block_id, decision, reason, admin_id) values (b.id, 'MANTER', v_motivo, p_admin);
  perform enqueue_message('bloqueio_mantido:' || b.id || ':' || extract(epoch from app_now())::bigint,
                          (select phone_e164 from customers where id = b.customer_id),
                          'bloqueio_mantido', '{}'::jsonb, 2::smallint, app_now() + interval '1 day', p_optional => true);
  perform log_audit('ADMIN', p_admin, 'telefone.bloqueio_mantido', 'phone_block', b.id::text, null,
                    jsonb_build_object('customer_id', b.customer_id, 'motivo', v_motivo));
end $$;

-- Painel: bloqueios com as reservas que levaram a eles e as decisões. O administrador vê o
-- telefone completo (seção 13).
create function admin_list_phone_blocks(p_status phone_block_status default 'ATIVO') returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'status', b.status, 'criadoEm', b.created_at, 'liberadoEm', b.released_at, 'motivoLiberacao', b.release_reason,
    'telefone', c.phone_e164, 'nome', c.last_name_informed,
    'reservas', (select jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.number, 'expiradaEm', r.expired_at) order by r.expired_at)
                   from reservations r where r.id = any(b.trigger_reservations)),
    'decisoes', coalesce((select jsonb_agg(jsonb_build_object('decisao', d.decision, 'motivo', d.reason, 'em', d.created_at) order by d.created_at)
                            from phone_block_decisions d where d.block_id = b.id), '[]'))
    order by b.created_at desc), '[]')
  from phone_blocks b join customers c on c.id = b.customer_id
  where p_status is null or b.status = p_status
$$;
