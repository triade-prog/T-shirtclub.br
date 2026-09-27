-- 0210 · Bucket das fotos do catálogo (D20)
-- Leitura pública (vitrine e next/image); envio só por URL assinada gerada na api-admin com a
-- service role, sempre em WebP (o painel converte no navegador). Sem políticas em
-- storage.objects: a leitura pública não passa por RLS e ninguém envia com a chave anon.
-- Espelha [storage.buckets.catalogo] do config.toml, que só vale no ambiente local.
-- No banco local de testes não existe o schema storage: o bloco é pulado.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('catalogo', 'catalogo', true, 15728640, array['image/webp'])
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;
