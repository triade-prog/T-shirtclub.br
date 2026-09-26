-- 0016 · JSON do catálogo e das promoções, com os nomes da API (português, camelCase).
-- Usado pela loja (0190), pelo painel (0185) e pela reserva (0120).

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
