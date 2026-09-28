-- 0400 · Vitrine das coleções (28/09, pedido da loja)
-- Chamada: uma frase curta sobre o universo da coleção, para a faixa verde da página da coleção
-- (no lugar do texto que explicava o projeto). Fotos: até 4 capas das peças visíveis, da mais
-- recente para a mais antiga, para a capa da coleção e o cartão do início quando a coleção ainda
-- não tem foto de campanha (sem elas, o espaço ficava vazio).

alter table collections add column tagline text check (tagline is null or length(btrim(tagline)) between 1 and 120);

create or replace function collection_json(c collections) returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.name, 'slug', c.slug, 'descricao', c.description, 'chamada', c.tagline, 'cor', c.color_key,
    'capa', case when c.cover_path is null then null else jsonb_build_object('caminho', c.cover_path, 'alt', c.cover_alt) end,
    'posicao', c.position, 'ativa', c.active)
$$;

create or replace function catalog_collections() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(collection_json(c) - 'ativa' - 'posicao'
                              || jsonb_build_object(
                                   'produtos', (select count(*) from products p where p.collection_id = c.id and product_visible(p)),
                                   'fotos', (select coalesce(jsonb_agg(x.capa order by x.ord), '[]')
                                               from (select y.capa, row_number() over (order by y.published_at desc, y.name) as ord
                                                       from (select p.published_at, p.name, product_card_json(p) -> 'capa' as capa
                                                               from products p where p.collection_id = c.id and product_visible(p)) y
                                                      where y.capa is not null
                                                      order by y.published_at desc, y.name
                                                      limit 4) x))
                            order by c.position, c.name), '[]')
  from collections c where c.active
$$;

create or replace function admin_save_collection(p_admin uuid, p_id uuid, p jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform admin_guard(p_admin);
  if p_id is null then
    insert into collections (name, slug, description, tagline, color_key, cover_path, cover_alt, position, active)
    values (texto(p, 'nome'), p ->> 'slug', texto(p, 'descricao'), texto(p, 'chamada'), (p ->> 'cor')::collection_color,
            p -> 'capa' ->> 'caminho', p -> 'capa' ->> 'alt', coalesce((p ->> 'posicao')::int, 0), coalesce((p ->> 'ativa')::boolean, true))
    returning id into v_id;
    perform log_audit('ADMIN', p_admin, 'colecao.criada', 'collection', v_id::text);
  else
    update collections
       set name = texto(p, 'nome'), slug = p ->> 'slug', description = texto(p, 'descricao'), tagline = texto(p, 'chamada'),
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

call lock_down_public();
