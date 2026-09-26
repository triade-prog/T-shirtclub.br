-- 0310 · Bucket das fotos do catálogo (F2, D20)
-- Leitura pública (vitrine e next/image). O envio só acontece por URL assinada gerada na
-- api-admin com a chave de serviço, então não há política de escrita em storage.objects:
-- anon e authenticated não gravam nem apagam nada. Só WebP (o painel converte no navegador),
-- até 15 MiB. O mesmo que [storage.buckets.catalogo] no config.toml, para o projeto publicado.
-- No banco local de testes não há o esquema storage do Supabase: a migration é pulada.

do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('catalogo', 'catalogo', true, 15728640, array['image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $$;
