-- 0380 · Bloco "Almost Gone" da página inicial (28/09, estratégia do Drop 01)
-- As peças com o selo de últimas unidades (app_settings.ultimas_unidades), da que tem menos
-- para a que tem mais, até 8. A escassez é a real do estoque: o bloco some sozinho quando
-- nenhuma peça estiver acabando, e a peça esgotada sai dele.

alter type home_block_kind add value if not exists 'QUASE_ESGOTADAS';

-- Menos unidades primeiro; no empate, a ordem da vitrine (publicadas mais recentes antes).
create function catalog_quase_esgotadas(p_limit integer default 8) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(s.x order by (s.x ->> 'disponivel')::int, s.ord), '[]')
  from (
    select t.x, t.ord from jsonb_array_elements(catalog_products(null, null)) with ordinality as t(x, ord)
     where t.x ->> 'selo' = 'ULTIMAS_UNIDADES'
     order by (t.x ->> 'disponivel')::int, t.ord
     limit least(greatest(p_limit, 1), 24)
  ) s
$$;

-- O tipo novo é comparado como texto: o valor do enum criado acima só pode ser usado depois
-- que esta transação terminar.
create or replace function catalog_home() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', b.kind,
    'titulo', b.title,
    'conteudo', case b.kind::text
      when 'CAMPANHA' then (select look_json(l, true) - 'ativo' - 'posicao' from looks l
                             where l.active and (b.ref_id is null or l.id = b.ref_id) order by l.position limit 1)
      when 'NOVIDADES' then catalog_products(null, null, 8)
      when 'COLECOES' then catalog_collections()
      when 'LOOKS' then catalog_looks()
      when 'PRODUTOS' then catalog_products((select slug from collections where id = b.ref_id), null, 24)
      when 'QUASE_ESGOTADAS' then catalog_quase_esgotadas(8)
      else null -- MONTE_SEU_CLUB: a api-public preenche com a oferta vigente
    end) order by b.position), '[]')
  from home_blocks b where b.active
$$;

call lock_down_public();
