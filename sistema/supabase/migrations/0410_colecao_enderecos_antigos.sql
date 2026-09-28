-- 0410 · Endereços antigos das coleções (28/09: "La Dolce Vita Club" virou "Estate Italiana")
-- Ao trocar o endereço (slug) de uma coleção, o antigo fica guardado e a loja redireciona para o
-- novo, para os links já postados (Instagram, anúncios, WhatsApp) continuarem funcionando. Um
-- endereço que volta a ser usado por uma coleção deixa de ser apelido.

create table collection_slug_aliases (
  slug          text primary key check (slug ~ '^[a-z0-9-]{1,80}$'),
  collection_id uuid not null references collections(id) on delete cascade,
  created_at    timestamptz not null default app_now()
);
alter table collection_slug_aliases enable row level security;

create function remember_collection_slug() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    insert into collection_slug_aliases (slug, collection_id) values (old.slug, old.id)
    on conflict (slug) do update set collection_id = excluded.collection_id, created_at = app_now();
  end if;
  delete from collection_slug_aliases where slug = new.slug;
  return new;
end $$;

create trigger collections_slug_aliases after insert or update of slug on collections
  for each row execute function remember_collection_slug();

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
                                                      limit 4) x),
                                   'slugsAntigos', (select coalesce(jsonb_agg(a.slug order by a.created_at, a.slug), '[]')
                                                      from collection_slug_aliases a where a.collection_id = c.id))
                            order by c.position, c.name), '[]')
  from collections c where c.active
$$;

call lock_down_public();
