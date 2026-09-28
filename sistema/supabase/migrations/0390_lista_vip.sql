-- 0390 · Lista VIP (28/09): quem quer receber drops e ofertas da loja pelo WhatsApp
-- Entrada pelo pop-up e pelo rodapé da loja, com o consentimento de marketing (LGPD, art. 7º, I)
-- guardado com o texto aceito e a hora. Quem entra vê o cupom de boas-vindas escolhido no painel
-- (app_settings.vip_cupom), se ele estiver valendo. Sair da lista apaga o registro.

create table vip_signups (
  id            uuid primary key default gen_random_uuid(),
  phone_e164    text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  name          text check (name is null or length(btrim(name)) between 1 and 60),
  source        text not null check (source in ('POPUP', 'RODAPE')),
  consent_text  text not null check (length(btrim(consent_text)) between 10 and 500),
  consented_at  timestamptz not null default app_now(),
  ip_hash       text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default app_now()
);
alter table vip_signups enable row level security;
create index vip_signups_recentes on vip_signups (created_at desc);

insert into app_settings (key, value, description) values
  ('vip_cupom', 'null', 'Código do cupom de boas-vindas mostrado a quem entra na lista VIP (null: sem cupom)');

-- O cupom de boas-vindas só aparece enquanto está valendo e ainda tem unidades.
create function vip_welcome_coupon() returns coupons
language sql stable
set search_path = public
as $$
  select c.* from coupons c join promotions pr on pr.id = c.promotion_id
   where c.code = (setting('vip_cupom') #>> '{}')
     and promotion_state(pr.starts_at, pr.ends_at, pr.ended_at) = 'ATIVA'
     and c.used_quantity < c.total_quantity
$$;

-- O benefício do cupom (sem o código), para o texto do pop-up e do rodapé.
create function vip_offer() returns jsonb
language sql stable
set search_path = public
as $$
  select case when c.code is null then null else jsonb_build_object('modo', c.kind, 'valor', c.value, 'minimoCentavos', c.min_spend_cents) end
    from vip_welcome_coupon() c
$$;

-- Entrada na lista: o mesmo número entra uma vez (renova o consentimento e o nome, se veio).
create function vip_signup(p_phone text, p_name text, p_source text, p_consent_text text, p_ip_hash text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_novo boolean; c coupons;
begin
  insert into vip_signups (phone_e164, name, source, consent_text, ip_hash)
  values (p_phone, nullif(btrim(p_name), ''), p_source, p_consent_text, p_ip_hash)
  on conflict (phone_e164) do update
     set name = coalesce(excluded.name, vip_signups.name), consent_text = excluded.consent_text,
         consented_at = app_now(), ip_hash = excluded.ip_hash
  returning (xmax = 0) into v_novo;
  c := vip_welcome_coupon();
  return jsonb_build_object('novo', v_novo, 'cupom', case when c.code is null then null else
    jsonb_build_object('codigo', c.code, 'modo', c.kind, 'valor', c.value, 'minimoCentavos', c.min_spend_cents) end);
end $$;

-- Painel: a lista, a mais recente primeiro (com o telefone inteiro: é para a loja entrar em contato).
create function admin_list_vip(p_q text default null, p_page integer default 1) returns jsonb
language sql stable
set search_path = public
as $$
  with filtrada as (
    select * from vip_signups
     where p_q is null or btrim(p_q) = ''
        or phone_e164 like '%' || regexp_replace(p_q, '\D', '', 'g') || '%' and regexp_replace(p_q, '\D', '', 'g') <> ''
        or name ilike '%' || btrim(p_q) || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'telefone', phone_e164, 'nome', name, 'origem', source, 'em', consented_at) order by created_at desc)
                         from (select * from filtrada order by created_at desc limit 50 offset (greatest(p_page, 1) - 1) * 50) x), '[]'))
$$;

-- Exportar a lista inteira (para enviar as novidades): fica na auditoria, sem os dados.
create function admin_export_vip(p_admin uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  perform admin_guard(p_admin);
  select coalesce(jsonb_agg(jsonb_build_object('telefone', phone_e164, 'nome', name, 'origem', source, 'em', consented_at) order by created_at), '[]')
    into v from vip_signups;
  perform log_audit('ADMIN', p_admin, 'vip.exportada', 'vip_signups', null, null, jsonb_build_object('contatos', jsonb_array_length(v)));
  return v;
end $$;

-- Sair da lista (a pedido da cliente): apaga o registro.
create function admin_remove_vip(p_admin uuid, p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  delete from vip_signups where id = p_id;
  if not found then
    raise exception 'Contato não encontrado' using errcode = 'TS130';
  end if;
  perform log_audit('ADMIN', p_admin, 'vip.removido', 'vip_signups', p_id::text);
end $$;

-- Cupom de boas-vindas: um cupom cadastrado em Promoções (ou nenhum).
create function admin_vip_settings() returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'cupom', setting('vip_cupom') #>> '{}',
    'valendo', (select code from vip_welcome_coupon()) is not null,
    'cupons', coalesce((select jsonb_agg(jsonb_build_object('codigo', c.code, 'nome', pr.name, 'modo', c.kind, 'valor', c.value,
                                                            'situacao', promotion_state(pr.starts_at, pr.ends_at, pr.ended_at)) order by pr.starts_at desc)
                          from coupons c join promotions pr on pr.id = c.promotion_id), '[]'),
    'contatos', (select count(*) from vip_signups))
$$;

create function admin_set_vip_coupon(p_admin uuid, p_code text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_code text := nullif(upper(btrim(p_code)), '');
begin
  perform admin_guard(p_admin);
  if v_code is not null and not exists (select 1 from coupons where code = v_code) then
    raise exception 'Cupom não encontrado' using errcode = 'TS130';
  end if;
  update app_settings set value = coalesce(to_jsonb(v_code), 'null'::jsonb), updated_at = now(), updated_by = p_admin where key = 'vip_cupom';
  perform log_audit('ADMIN', p_admin, 'vip.cupom', 'app_settings', 'vip_cupom', null, jsonb_build_object('cupom', v_code));
  return admin_vip_settings();
end $$;

call lock_down_public();
