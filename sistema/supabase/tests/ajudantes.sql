-- Ajudantes dos testes do banco (só nos bancos de teste, depois das migrations).
-- Desde a 0370 o estoque é por variante: a peça nasce com o Único ativo e o Plus inativo.
create schema if not exists testes;

-- A variante de uma peça pelo código ("LIM-01") e tamanho.
create or replace function testes.variante(p_codigo text, p_tamanho product_size default 'UNICO') returns product_variants
language sql stable
as $$
  select v.* from product_variants v join products p on p.id = v.product_id where p.code = p_codigo and v.size = p_tamanho
$$;

-- Id do Único de uma peça.
create or replace function testes.unico(p_produto uuid) returns uuid
language sql stable
as $$ select id from product_variants where product_id = p_produto and size = 'UNICO' $$;

-- Itens ou linhas só com o produtoId ganham o varianteId do Único (o resto fica igual).
create or replace function testes.com_unico(p jsonb) returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(case when x ? 'varianteId' then x
                                 else x || jsonb_build_object('varianteId', testes.unico((x ->> 'produtoId')::uuid)) end
                            order by o), '[]')
    from jsonb_array_elements(p) with ordinality as t(x, o)
$$;

-- Estoque do Único (total, e opcionalmente reservado e vendido), como era na peça.
create or replace function testes.estoque(p_produto uuid, p_total integer, p_reservado integer default 0, p_vendido integer default 0) returns void
language sql
as $$
  update product_variants set qty_total = p_total, qty_reserved = p_reservado, qty_sold = p_vendido
   where product_id = p_produto and size = 'UNICO'
$$;
