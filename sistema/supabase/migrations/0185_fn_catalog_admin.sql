-- 0185 · Catálogo e promoções pelo painel (seção 11: CRUD de produtos, coleções, fotos, looks,
-- página inicial e promoções). As rotas da api-admin só validam a entrada (schemas do
-- packages/domain) e chamam estas funções; toda escrita vai para a auditoria.
--
-- Entrada e saída em JSON com os nomes da API (português, camelCase), para a rota não
-- precisar traduzir campo a campo.

-- ─── Montagem do JSON ────────────────────────────────────────────────────────────────

create function image_json(i product_images) returns jsonb
language sql stable
as $$
  select jsonb_build_object('id', i.id, 'caminho', i.storage_path, 'tipo', i.kind, 'alt', i.alt_text,
                            'largura', i.width, 'altura', i.height, 'posicao', i.position)
$$;

create function collection_json(c collections) returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.name, 'slug', c.slug, 'descricao', c.description, 'cor', c.color_key,
    'capa', case when c.cover_path is null then null else jsonb_build_object('caminho', c.cover_path, 'alt', c.cover_alt) end,
    'posicao', c.position, 'ativa', c.active)
$$;

-- Cartão do produto na vitrine: capa, coleção e disponibilidade (nunca os saldos internos).
create function product_card_json(p products) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'nome', p.name, 'precoCentavos', p.price_cents,
    'colecao', (select jsonb_build_object('slug', c.slug, 'nome', c.name, 'cor', c.color_key) from collections c where c.id = p.collection_id),
    'capa', (select image_json(i) - 'id' - 'posicao' from product_images i where i.product_id = p.id order by i.position limit 1),
    'disponivel', greatest(p.qty_total - p.qty_reserved - p.qty_sold, 0),
    'selo', availability_label(p.qty_total - p.qty_reserved - p.qty_sold))
$$;

-- Promoção no formato do motor de preço (packages/domain/src/preco.ts).
create function promotion_json(pr promotions) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', pr.id, 'tipo', pr.type, 'nome', pr.name,
    'inicio', pr.starts_at, 'fim', pr.ends_at, 'encerradaEm', pr.ended_at,
    'situacao', promotion_state(pr.starts_at, pr.ends_at, pr.ended_at),
    'escopo', pr.scope,
    'produtos', case
      when pr.type = 'DESCONTO_PRODUTO' then
        (select coalesce(jsonb_object_agg(pp.product_id, jsonb_build_object('modo', pp.discount_kind, 'valor', pp.discount_value)), '{}')
           from promotion_products pp where pp.promotion_id = pr.id)
      else
        (select coalesce(jsonb_agg(pp.product_id order by pp.product_id), '[]') from promotion_products pp where pp.promotion_id = pr.id)
    end,
    'modo', coalesce(pr.buy_more_mode::text, (select c.kind::text from coupons c where c.promotion_id = pr.id)),
    'niveis', case when pr.buy_more_mode = 'NIVEIS' then
      (select jsonb_agg(jsonb_build_object('qtdMin', t.min_qty, 'pct', t.percent) order by t.level) from promotion_tiers t where t.promotion_id = pr.id) end,
    'grupo', case when pr.group_qty is not null then jsonb_build_object('qtd', pr.group_qty, 'precoCentavos', pr.group_price_cents) end,
    'umaPorCliente', case when pr.type = 'COMPRE_MAIS' then pr.one_per_customer end,
    'orcamento', case when pr.budget_cents is not null then jsonb_build_object('totalCentavos', pr.budget_cents, 'usadoCentavos', pr.budget_used_cents) end
  ) || coalesce((
    select jsonb_build_object(
      'codigo', c.code, 'valor', c.value, 'descontoMaximoCentavos', c.max_discount_cents, 'gastoMinimoCentavos', c.min_spend_cents,
      'quantidadeTotal', c.total_quantity, 'quantidadeUsada', c.used_quantity, 'limitePorCliente', c.per_customer_limit,
      'validadeDias', c.validity_days)
    from coupons c where c.promotion_id = pr.id), '{}'))
$$;

-- ─── Guarda ──────────────────────────────────────────────────────────────────────────

create function admin_guard(p_admin uuid) returns void
language plpgsql stable
set search_path = public
as $$
begin
  if not admin_is_active(p_admin) then
    raise exception 'Administrador inativo' using errcode = 'TS122';
  end if;
end $$;

create function texto(p jsonb, k text) returns text
language sql immutable
as $$ select nullif(btrim(p ->> k), '') $$;

-- ─── Coleções ────────────────────────────────────────────────────────────────────────

create function admin_save_collection(p_admin uuid, p_id uuid, p jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform admin_guard(p_admin);
  if p_id is null then
    insert into collections (name, slug, description, color_key, cover_path, cover_alt, position, active)
    values (texto(p, 'nome'), p ->> 'slug', texto(p, 'descricao'), (p ->> 'cor')::collection_color,
            p -> 'capa' ->> 'caminho', p -> 'capa' ->> 'alt', coalesce((p ->> 'posicao')::int, 0), coalesce((p ->> 'ativa')::boolean, true))
    returning id into v_id;
    perform log_audit('ADMIN', p_admin, 'colecao.criada', 'collection', v_id::text);
  else
    update collections
       set name = texto(p, 'nome'), slug = p ->> 'slug', description = texto(p, 'descricao'),
           color_key = (p ->> 'cor')::collection_color, cover_path = p -> 'capa' ->> 'caminho', cover_alt = p -> 'capa' ->> 'alt',
           position = coalesce((p ->> 'posicao')::int, 0), active = coalesce((p ->> 'ativa')::boolean, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Coleção não encontrada' using errcode = 'TS130';
    end if;
    perform log_audit('ADMIN', p_admin, 'colecao.editada', 'collection', v_id::text);
  end if;
  return v_id;
end $$;

create function admin_list_collections() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(collection_json(c) || jsonb_build_object('produtos', (select count(*) from products p where p.collection_id = c.id))
                            order by c.position, c.name), '[]')
  from collections c
$$;

-- ─── Produtos ────────────────────────────────────────────────────────────────────────

create function admin_save_product(p_admin uuid, p_id uuid, p jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v products;
  v_id uuid;
  v_publicar boolean := coalesce((p ->> 'publicado')::boolean, false);
begin
  perform admin_guard(p_admin);
  if p_id is null then
    insert into products (collection_id, code, slug, name, price_cents, description, composition, fit, measurements, care, active, published_at)
    values ((p ->> 'colecaoId')::uuid, p ->> 'codigo', p ->> 'slug', texto(p, 'nome'), (p ->> 'precoCentavos')::int,
            texto(p, 'descricao'), texto(p, 'composicao'), texto(p, 'modelagem'), coalesce(p -> 'medidas', '{}'), texto(p, 'cuidados'),
            coalesce((p ->> 'ativo')::boolean, true), case when v_publicar then app_now() end)
    returning id into v_id;
    perform log_audit('ADMIN', p_admin, 'produto.criado', 'product', v_id::text, null,
                      jsonb_build_object('preco_centavos', (p ->> 'precoCentavos')::int));
    return v_id;
  end if;

  select * into v from products where id = p_id for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'TS130';
  end if;
  update products
     set collection_id = (p ->> 'colecaoId')::uuid, code = p ->> 'codigo', slug = p ->> 'slug', name = texto(p, 'nome'),
         price_cents = (p ->> 'precoCentavos')::int, description = texto(p, 'descricao'), composition = texto(p, 'composicao'),
         fit = texto(p, 'modelagem'), measurements = coalesce(p -> 'medidas', '{}'), care = texto(p, 'cuidados'),
         active = coalesce((p ->> 'ativo')::boolean, true),
         published_at = case when v_publicar then coalesce(v.published_at, app_now()) end
   where id = p_id;
  perform log_audit('ADMIN', p_admin, 'produto.editado', 'product', p_id::text, null,
                    jsonb_strip_nulls(jsonb_build_object(
                      'preco_antes', case when v.price_cents <> (p ->> 'precoCentavos')::int then v.price_cents end,
                      'preco_depois', case when v.price_cents <> (p ->> 'precoCentavos')::int then (p ->> 'precoCentavos')::int end,
                      'publicado', v_publicar)));
  return p_id;
end $$;

create function admin_product_row_json(p products) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'codigo', p.code, 'slug', p.slug, 'nome', p.name, 'precoCentavos', p.price_cents,
    'colecaoId', p.collection_id, 'ativo', p.active, 'publicado', p.published_at is not null, 'publicadoEm', p.published_at,
    'capa', (select image_json(i) from product_images i where i.product_id = p.id order by i.position limit 1),
    'fotos', (select count(*) from product_images i where i.product_id = p.id),
    'estoque', jsonb_build_object('total', p.qty_total, 'reservado', p.qty_reserved, 'vendido', p.qty_sold,
                                  'disponivel', greatest(p.qty_total - p.qty_reserved - p.qty_sold, 0)))
$$;

create function admin_list_products(p_q text default null, p_collection uuid default null, p_page integer default 1) returns jsonb
language sql stable
set search_path = public
as $$
  with filtrados as (
    select p.* from products p
     where (p_collection is null or p.collection_id = p_collection)
       and (nullif(btrim(p_q), '') is null or p.name ilike '%' || btrim(p_q) || '%' or p.code ilike '%' || btrim(p_q) || '%')
  )
  select jsonb_build_object(
    'itens', coalesce((select jsonb_agg(admin_product_row_json(f) order by f.name)
                         from (select * from filtrados order by name limit 20 offset (greatest(p_page, 1) - 1) * 20) f), '[]'),
    'total', (select count(*) from filtrados),
    'pagina', greatest(p_page, 1),
    'porPagina', 20)
$$;

create function admin_get_product(p_id uuid) returns jsonb
language sql stable
set search_path = public
as $$
  select admin_product_row_json(p) || jsonb_build_object(
    'descricao', p.description, 'composicao', p.composition, 'modelagem', p.fit, 'medidas', p.measurements, 'cuidados', p.care,
    'fotos', coalesce((select jsonb_agg(image_json(i) order by i.position) from product_images i where i.product_id = p.id), '[]'),
    'movimentos', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.kind, 'qtd', m.qty, 'motivo', m.reason, 'em', m.created_at) order by m.id desc)
                              from (select * from stock_movements m where m.product_id = p.id order by m.id desc limit 20) m), '[]'))
  from products p where p.id = p_id
$$;

-- ─── Fotos do produto ────────────────────────────────────────────────────────────────
-- O painel reduz a foto para WebP e envia direto ao Storage pela URL assinada; o caminho
-- é gerado aqui, nunca vem da tela.

create function admin_add_product_image(p_admin uuid, p_product uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos integer;
  v product_images;
begin
  perform admin_guard(p_admin);
  perform 1 from products where id = p_product for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'TS130';
  end if;
  select min(g) into v_pos from generate_series(1, 10) g
   where not exists (select 1 from product_images where product_id = p_product and position = g);
  if v_pos is null then
    raise exception 'Cada produto tem no máximo 10 fotos' using errcode = 'TS102';
  end if;
  insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
  values (p_product, 'produtos/' || p_product || '/' || gen_random_uuid() || '.webp', (p ->> 'tipo')::product_image_kind,
          texto(p, 'alt'), (p ->> 'largura')::int, (p ->> 'altura')::int, v_pos)
  returning * into v;
  perform log_audit('ADMIN', p_admin, 'produto.foto.adicionada', 'product', p_product::text, null, jsonb_build_object('foto', v.id));
  return image_json(v);
end $$;

create function admin_update_product_image(p_admin uuid, p_image uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v product_images;
begin
  perform admin_guard(p_admin);
  update product_images set kind = (p ->> 'tipo')::product_image_kind, alt_text = texto(p, 'alt')
   where id = p_image returning * into v;
  if v.id is null then
    raise exception 'Foto não encontrada' using errcode = 'TS130';
  end if;
  perform log_audit('ADMIN', p_admin, 'produto.foto.editada', 'product', v.product_id::text, null, jsonb_build_object('foto', v.id));
  return image_json(v);
end $$;

-- Posições de 1 a n, na ordem recebida (a primeira é a capa). Reordena dentro da
-- transação com a restrição de posição única adiada.
create function reorder_images(p_product uuid, p_ids uuid[]) returns void
language plpgsql
set search_path = public
as $$
begin
  set constraints product_images_posicao_unica deferred;
  update product_images i set position = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where i.id = o.id and i.product_id = p_product;
  set constraints product_images_posicao_unica immediate;
end $$;

create function admin_reorder_product_images(p_admin uuid, p_product uuid, p_ids uuid[]) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  perform 1 from products where id = p_product for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'TS130';
  end if;
  if (select array_agg(id order by id) from product_images where product_id = p_product)
     is distinct from (select array_agg(x order by x) from unnest(p_ids) x) then
    raise exception 'A nova ordem precisa ter exatamente as fotos do produto' using errcode = 'TS132';
  end if;
  perform reorder_images(p_product, p_ids);
  perform log_audit('ADMIN', p_admin, 'produto.fotos.reordenadas', 'product', p_product::text);
  return (select jsonb_agg(image_json(i) order by i.position) from product_images i where i.product_id = p_product);
end $$;

-- Apaga e devolve o caminho, para a rota apagar o arquivo do Storage. As que ficam
-- sobem de posição (a capa continua sendo a primeira).
create function admin_delete_product_image(p_admin uuid, p_image uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v product_images;
begin
  perform admin_guard(p_admin);
  select * into v from product_images where id = p_image;
  if not found then
    raise exception 'Foto não encontrada' using errcode = 'TS130';
  end if;
  perform 1 from products where id = v.product_id for update;
  delete from product_images where id = p_image;
  perform reorder_images(v.product_id, (select array_agg(id order by position) from product_images where product_id = v.product_id));
  perform log_audit('ADMIN', p_admin, 'produto.foto.apagada', 'product', v.product_id::text, null, jsonb_build_object('foto', v.id));
  return v.storage_path;
end $$;

-- ─── Looks e página inicial ──────────────────────────────────────────────────────────

create function look_json(l looks, p_so_publicados boolean) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id, 'titulo', l.title, 'foto', jsonb_build_object('caminho', l.image_path, 'alt', l.image_alt),
    'posicao', l.position, 'ativo', l.active,
    'produtos', coalesce((
      select jsonb_agg(product_card_json(p) || jsonb_build_object('x', lp.x, 'y', lp.y) order by p.name)
        from look_products lp join products p on p.id = lp.product_id
       where lp.look_id = l.id and (not p_so_publicados or (p.active and p.published_at is not null))), '[]'))
$$;

create function admin_save_look(p_admin uuid, p_id uuid, p jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform admin_guard(p_admin);
  if p_id is null then
    insert into looks (title, image_path, image_alt, position, active)
    values (texto(p, 'titulo'), p -> 'foto' ->> 'caminho', p -> 'foto' ->> 'alt', coalesce((p ->> 'posicao')::int, 0), coalesce((p ->> 'ativo')::boolean, true))
    returning id into v_id;
  else
    update looks set title = texto(p, 'titulo'), image_path = p -> 'foto' ->> 'caminho', image_alt = p -> 'foto' ->> 'alt',
                     position = coalesce((p ->> 'posicao')::int, 0), active = coalesce((p ->> 'ativo')::boolean, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Look não encontrado' using errcode = 'TS130';
    end if;
    delete from look_products where look_id = v_id;
  end if;
  insert into look_products (look_id, product_id, x, y)
  select v_id, x."produtoId", x.x, x.y
    from jsonb_to_recordset(coalesce(p -> 'produtos', '[]')) as x("produtoId" uuid, x numeric, y numeric);
  perform log_audit('ADMIN', p_admin, case when p_id is null then 'look.criado' else 'look.editado' end, 'look', v_id::text);
  return v_id;
end $$;

create function admin_delete_look(p_admin uuid, p_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_caminho text;
begin
  perform admin_guard(p_admin);
  delete from home_blocks where ref_id = p_id and kind = 'CAMPANHA';
  delete from looks where id = p_id returning image_path into v_caminho;
  if v_caminho is null then
    raise exception 'Look não encontrado' using errcode = 'TS130';
  end if;
  perform log_audit('ADMIN', p_admin, 'look.apagado', 'look', p_id::text);
  return v_caminho;
end $$;

create function admin_list_looks() returns jsonb
language sql stable
set search_path = public
as $$ select coalesce(jsonb_agg(look_json(l, false) order by l.position, l.title), '[]') from looks l $$;

-- A página inicial inteira é regravada na ordem recebida. CAMPANHA aponta para um look e
-- PRODUTOS, se tiver referência, para uma coleção.
create function admin_set_home_blocks(p_admin uuid, p jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_guard(p_admin);
  if exists (
    select 1 from jsonb_array_elements(p) b
     where (b ->> 'refId') is not null
       and not case b ->> 'tipo'
             when 'CAMPANHA' then exists (select 1 from looks where id = (b ->> 'refId')::uuid)
             when 'PRODUTOS' then exists (select 1 from collections where id = (b ->> 'refId')::uuid)
             else false
           end) then
    raise exception 'Referência do bloco inválida' using errcode = 'TS133';
  end if;
  delete from home_blocks where true;
  insert into home_blocks (kind, ref_id, title, position, active)
  select (b ->> 'tipo')::home_block_kind, (b ->> 'refId')::uuid, texto(b, 'titulo'), (ord - 1)::int, coalesce((b ->> 'ativo')::boolean, true)
    from jsonb_array_elements(p) with ordinality as x(b, ord);
  perform log_audit('ADMIN', p_admin, 'inicio.reordenado', 'home_blocks', null, null, jsonb_build_object('blocos', jsonb_array_length(p)));
  return admin_list_home_blocks();
end $$;

create function admin_list_home_blocks() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'tipo', b.kind, 'refId', b.ref_id, 'titulo', b.title, 'ativo', b.active)
                            order by b.position), '[]')
  from home_blocks b
$$;

-- ─── Promoções ───────────────────────────────────────────────────────────────────────
-- Criar e editar gravam a promoção e as linhas filhas juntas; o formato de cada tipo é
-- conferido no fim da transação (0015). Editar não muda reservas já criadas.

create function admin_save_promotion(p_admin uuid, p_id uuid, p jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v promotions;
  v_id uuid;
  v_tipo promotion_type := (p ->> 'tipo')::promotion_type;
begin
  perform admin_guard(p_admin);
  if p_id is null then
    insert into promotions (type, buy_more_mode, group_qty, group_price_cents, name, starts_at, ends_at, scope,
                            one_per_customer, budget_cents, created_by)
    values (v_tipo, case when v_tipo = 'COMPRE_MAIS' then (p ->> 'modo')::buy_more_mode end,
            (p -> 'grupo' ->> 'qtd')::int, (p -> 'grupo' ->> 'precoCentavos')::int, texto(p, 'nome'),
            (p ->> 'inicio')::timestamptz, (p ->> 'fim')::timestamptz, coalesce((p ->> 'escopo')::promotion_scope, 'TODOS'),
            coalesce((p ->> 'umaPorCliente')::boolean, false), (p ->> 'orcamentoCentavos')::int, p_admin)
    returning id into v_id;
  else
    select * into v from promotions where id = p_id for update;
    if not found then
      raise exception 'Promoção não encontrada' using errcode = 'TS130';
    end if;
    if v.type <> v_tipo then
      raise exception 'O tipo da promoção não muda; crie outra' using errcode = 'TS131';
    end if;
    if promotion_state(v.starts_at, v.ends_at, v.ended_at) = 'ENCERRADA' then
      raise exception 'Promoção encerrada não é editada' using errcode = 'TS116';
    end if;
    update promotions
       set buy_more_mode = case when v_tipo = 'COMPRE_MAIS' then (p ->> 'modo')::buy_more_mode end,
           group_qty = (p -> 'grupo' ->> 'qtd')::int, group_price_cents = (p -> 'grupo' ->> 'precoCentavos')::int,
           name = texto(p, 'nome'), starts_at = (p ->> 'inicio')::timestamptz, ends_at = (p ->> 'fim')::timestamptz,
           scope = coalesce((p ->> 'escopo')::promotion_scope, 'TODOS'), one_per_customer = coalesce((p ->> 'umaPorCliente')::boolean, false),
           budget_cents = (p ->> 'orcamentoCentavos')::int
     where id = p_id;
    delete from promotion_tiers where promotion_id = p_id;
    delete from promotion_products where promotion_id = p_id;
    v_id := p_id;
  end if;

  insert into promotion_tiers (promotion_id, level, min_qty, percent)
  select v_id, ord::int, (t ->> 'qtdMin')::int, (t ->> 'pct')::int
    from jsonb_array_elements(coalesce(p -> 'niveis', '[]')) with ordinality as x(t, ord);

  insert into promotion_products (promotion_id, product_id, discount_kind, discount_value)
  select v_id, (e ->> 'produtoId')::uuid, (e ->> 'modo')::product_discount_kind, (e ->> 'valor')::int
    from jsonb_array_elements(coalesce(p -> 'produtos', '[]')) e;

  if jsonb_typeof(p -> 'cupom') = 'object' then
    insert into coupons (promotion_id, code, kind, value, max_discount_cents, min_spend_cents, total_quantity, per_customer_limit, validity_days)
    values (v_id, upper(p -> 'cupom' ->> 'codigo'), (p -> 'cupom' ->> 'modo')::coupon_kind, (p -> 'cupom' ->> 'valor')::int,
            (p -> 'cupom' ->> 'descontoMaximoCentavos')::int, (p -> 'cupom' ->> 'gastoMinimoCentavos')::int,
            (p -> 'cupom' ->> 'quantidadeTotal')::int, coalesce((p -> 'cupom' ->> 'limitePorCliente')::int, 1),
            (p -> 'cupom' ->> 'validadeDias')::int)
    on conflict (promotion_id) do update
       set code = excluded.code, kind = excluded.kind, value = excluded.value, max_discount_cents = excluded.max_discount_cents,
           min_spend_cents = excluded.min_spend_cents, total_quantity = excluded.total_quantity,
           per_customer_limit = excluded.per_customer_limit, validity_days = excluded.validity_days;
  end if;

  perform log_audit('ADMIN', p_admin, case when p_id is null then 'promocao.criada' else 'promocao.editada' end,
                    'promotion', v_id::text, null, jsonb_build_object('tipo', v_tipo));
  return v_id;
end $$;

create function admin_list_promotions() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(promotion_json(pr) order by pr.starts_at desc, pr.name), '[]') from promotions pr
$$;
