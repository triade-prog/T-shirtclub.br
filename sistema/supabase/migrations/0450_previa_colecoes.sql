-- 0450 · Prévia na loja no painel (28/09): a lista de coleções do painel traz também a foto da
-- peça mais nova que aparece na loja (a mesma regra de catalog_collections, 0400), para a prévia
-- desenhar o círculo do Pick your story de quem ainda não tem foto escolhida (0440).

create or replace function admin_list_collections() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(collection_json(c) || jsonb_build_object(
                              'produtos', (select count(*) from products p where p.collection_id = c.id),
                              'pecaMaisNova', (select y.capa
                                                 from (select p.published_at, p.name, product_card_json(p) -> 'capa' as capa
                                                         from products p where p.collection_id = c.id and product_visible(p)) y
                                                where y.capa is not null
                                                order by y.published_at desc, y.name
                                                limit 1))
                            order by c.position, c.name), '[]')
  from collections c
$$;

call lock_down_public();
