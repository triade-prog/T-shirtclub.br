-- 0440 · Foto do Pick your story (28/09): a loja escolhe no painel a foto do círculo de cada
-- coleção no início. Sem foto escolhida, o círculo continua com a peça mais nova da coleção (0400).
-- A foto é enfeite (o nome da coleção vem logo abaixo), por isso não tem descrição.

alter table collections add column story_path text;

create or replace function collection_json(c collections) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.name, 'slug', c.slug, 'descricao', c.description, 'chamada', c.tagline, 'cor', c.color_key,
    'capa', case when c.cover_path is null then null else jsonb_build_object('caminho', c.cover_path, 'alt', c.cover_alt) end,
    'capaCelular', case when c.cover_mobile_path is null then null else jsonb_build_object('caminho', c.cover_mobile_path, 'alt', c.cover_mobile_alt) end,
    'fotoStory', case when c.story_path is null then null else jsonb_build_object('caminho', c.story_path) end,
    'campanha', c.campaign_name, 'campanhaAtiva', c.campaign_active, 'temporada', c.season, 'edicao', c.edition, 'paleta', c.palette,
    'capitulos', (select coalesce(jsonb_agg(jsonb_build_object(
                    'rotulo', k.label, 'titulo', k.title, 'texto', k.body,
                    'foto', case when k.photo_path is null then null else jsonb_build_object('caminho', k.photo_path, 'alt', k.photo_alt) end,
                    'produtos', to_jsonb(k.product_ids)) order by k.position), '[]')
                    from collection_chapters k where k.collection_id = c.id),
    'posicao', c.position, 'ativa', c.active)
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

  -- Campanha (0420): só quando o painel manda os campos (um painel antigo não apaga nada)
  if p ? 'paleta' then
    update collections
       set campaign_name = texto(p, 'campanha'), season = texto(p, 'temporada'), edition = texto(p, 'edicao'),
           cover_mobile_path = p -> 'capaCelular' ->> 'caminho', cover_mobile_alt = p -> 'capaCelular' ->> 'alt',
           palette = p ->> 'paleta', campaign_active = coalesce((p ->> 'campanhaAtiva')::boolean, false)
     where id = v_id;
  end if;
  -- Pick your story (0440): só quando o painel manda o campo; null volta para a peça mais nova
  if p ? 'fotoStory' then
    update collections set story_path = p -> 'fotoStory' ->> 'caminho' where id = v_id;
  end if;
  if p ? 'capitulos' then
    delete from collection_chapters where collection_id = v_id;
    insert into collection_chapters (collection_id, position, label, title, body, photo_path, photo_alt, product_ids)
    select v_id, (k.ord - 1)::int, texto(k.cap, 'rotulo'), texto(k.cap, 'titulo'), texto(k.cap, 'texto'),
           k.cap -> 'foto' ->> 'caminho', k.cap -> 'foto' ->> 'alt',
           array(select pr.id
                   from jsonb_array_elements_text(coalesce(k.cap -> 'produtos', '[]')) with ordinality as e(pid, ord)
                   join products pr on pr.id = e.pid::uuid and pr.collection_id = v_id
                  order by e.ord)
      from jsonb_array_elements(p -> 'capitulos') with ordinality as k(cap, ord);
  end if;
  return v_id;
end $$;

call lock_down_public();
