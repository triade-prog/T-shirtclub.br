-- 0190 · Leitura do catálogo pela loja (seção 11, rotas públicas /v1/catalog/*) e dados que
-- o motor de preço precisa (promoções vigentes e produtos da sacola). Só produto ativo,
-- publicado e de coleção ativa aparece. O preço promocional e a oferta "Monte seu Club"
-- são calculados na api-public pelo motor de preço, a partir de pricing_promotions().

create function product_visible(p products) returns boolean
language sql stable
set search_path = public
as $$
  select p.active and p.published_at is not null
     and exists (select 1 from collections c where c.id = p.collection_id and c.active)
$$;

create function catalog_collections() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(collection_json(c) - 'ativa' - 'posicao'
                              || jsonb_build_object('produtos', (select count(*) from products p where p.collection_id = c.id and product_visible(p)))
                            order by c.position, c.name), '[]')
  from collections c where c.active
$$;

-- p_availability = 'DISPONIVEL' esconde os esgotados.
create function catalog_products(p_collection text default null, p_availability text default null, p_limit integer default 200) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(product_card_json(x) order by x.published_at desc, x.name), '[]')
  from (
    select p.* from products p
     where product_visible(p)
       and (p_collection is null or exists (select 1 from collections c where c.id = p.collection_id and c.slug = p_collection))
       and (p_availability is distinct from 'DISPONIVEL' or p.qty_total - p.qty_reserved - p.qty_sold > 0)
     order by p.published_at desc, p.name
     limit least(greatest(p_limit, 1), 200)
  ) x
$$;

create function catalog_product(p_slug text) returns jsonb
language sql stable
set search_path = public
as $$
  select product_card_json(p) || jsonb_build_object(
    'descricao', p.description, 'composicao', p.composition, 'modelagem', p.fit, 'medidas', p.measurements, 'cuidados', p.care,
    'colecao', (select collection_json(c) - 'ativa' - 'posicao' - 'id' from collections c where c.id = p.collection_id),
    'fotos', coalesce((select jsonb_agg(image_json(i) - 'id' order by i.position) from product_images i where i.product_id = p.id), '[]'),
    'looks', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'titulo', l.title, 'foto', jsonb_build_object('caminho', l.image_path, 'alt', l.image_alt)))
                         from looks l join look_products lp on lp.look_id = l.id where lp.product_id = p.id and l.active), '[]'))
  from products p
  where p.slug = p_slug and product_visible(p)
$$;

create function catalog_looks() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(look_json(l, true) - 'ativo' - 'posicao' order by l.position, l.title), '[]')
  from looks l where l.active
$$;

-- Página inicial: os blocos na ordem do painel, cada um já com o conteúdo.
create function catalog_home() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', b.kind,
    'titulo', b.title,
    'conteudo', case b.kind
      when 'CAMPANHA' then (select look_json(l, true) - 'ativo' - 'posicao' from looks l
                             where l.active and (b.ref_id is null or l.id = b.ref_id) order by l.position limit 1)
      when 'NOVIDADES' then catalog_products(null, null, 8)
      when 'COLECOES' then catalog_collections()
      when 'LOOKS' then catalog_looks()
      when 'PRODUTOS' then catalog_products((select slug from collections where id = b.ref_id), null, 24)
      else null -- MONTE_SEU_CLUB: a api-public preenche com a oferta vigente
    end) order by b.position), '[]')
  from home_blocks b where b.active
$$;

-- Promoções para o motor de preço: as vigentes (menos cupons) e o cupom digitado, em
-- qualquer situação, para a loja explicar se está agendado ou encerrado.
create function pricing_promotions(p_coupon text default null) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(promotion_json(pr) order by pr.starts_at, pr.id), '[]')
  from promotions pr
  where (pr.type <> 'CUPOM' and promotion_state(pr.starts_at, pr.ends_at, pr.ended_at) = 'ATIVA')
     or (pr.type = 'CUPOM' and exists (select 1 from coupons c where c.promotion_id = pr.id and c.code = upper(btrim(p_coupon))))
$$;

-- Produtos da sacola (só os visíveis) e os limites de app_settings, para a cotação.
create function cart_products(p_ids uuid[]) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'produtos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.name, 'precoCentavos', p.price_cents,
                                                              'disponivel', greatest(p.qty_total - p.qty_reserved - p.qty_sold, 0)))
                            from products p where p.id = any(p_ids) and product_visible(p)), '[]'),
    'limites', jsonb_build_object('maxPecas', setting_int('max_pecas'), 'maxPorProduto', setting_int('max_por_produto')))
$$;
