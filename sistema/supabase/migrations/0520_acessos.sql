-- 0520 · Acessos da loja (02/10): quantas visitas e visitantes por dia, as páginas mais vistas,
-- de onde as visitas chegaram e se foi celular ou computador, para o painel. Sem cookie e sem
-- dado pessoal: só os totais por dia. Para não contar a mesma pessoa duas vezes no mesmo dia, a
-- api-public manda um código embaralhado (sha256 do IP, do navegador e do dia, com o sal do
-- servidor), que muda todo dia e é apagado no dia seguinte.

create table site_traffic_days (
  day      date primary key,
  views    integer not null default 0 check (views >= 0),
  visitors integer not null default 0 check (visitors >= 0),
  -- Aparelho de cada visitante do dia
  mobile   integer not null default 0 check (mobile >= 0),
  tablet   integer not null default 0 check (tablet >= 0),
  desktop  integer not null default 0 check (desktop >= 0)
);

create table site_traffic_pages (
  day   date not null,
  path  text not null check (path ~ '^/[a-z0-9/_-]{0,100}$'),
  views integer not null default 0 check (views >= 0),
  primary key (day, path)
);

-- Entradas no site (a primeira página de cada visita) por origem
create table site_traffic_sources (
  day    date not null,
  source text not null check (source ~ '^[a-z_]{1,20}$'),
  visits integer not null default 0 check (visits >= 0),
  primary key (day, source)
);

create table site_traffic_visitors (
  day          date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  primary key (day, visitor_hash)
);

alter table site_traffic_days enable row level security;
alter table site_traffic_pages enable row level security;
alter table site_traffic_sources enable row level security;
alter table site_traffic_visitors enable row level security;

-- O dia da loja (o mesmo fuso das mensagens)
create function store_today() returns date
language sql stable
set search_path = public
as $$ select (app_now() at time zone 'America/Bahia')::date $$;

-- Uma página vista. p_path já vem normalizado pelo domínio (caminhoDaVisita); coleção e peça que
-- não existem viram só "/colecao" ou "/produto", para ninguém encher a tabela de endereços falsos.
-- p_source só na entrada (a primeira página da visita). Devolve se o visitante é novo no dia.
create function register_visit(p_path text, p_source text, p_device text, p_visitor text) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := store_today();
  v_path text := p_path;
  v_novo boolean;
begin
  if p_device not in ('mobile', 'tablet', 'desktop') or p_visitor !~ '^[0-9a-f]{64}$' then
    raise exception 'Visita inválida' using errcode = 'TS187';
  end if;
  if v_path ~ '^/colecao/' and not exists (select 1 from collections where slug = substr(v_path, 10) and active) then
    v_path := '/colecao';
  elsif v_path ~ '^/produto/' and not exists (select 1 from products where slug = substr(v_path, 10) and published_at is not null) then
    v_path := '/produto';
  end if;

  insert into site_traffic_visitors (day, visitor_hash) values (v_day, p_visitor) on conflict do nothing;
  v_novo := found;

  insert into site_traffic_days as d (day, views, visitors, mobile, tablet, desktop)
  values (v_day, 1, v_novo::int, (v_novo and p_device = 'mobile')::int, (v_novo and p_device = 'tablet')::int, (v_novo and p_device = 'desktop')::int)
  on conflict (day) do update
     set views = d.views + 1, visitors = d.visitors + excluded.visitors,
         mobile = d.mobile + excluded.mobile, tablet = d.tablet + excluded.tablet, desktop = d.desktop + excluded.desktop;

  insert into site_traffic_pages as p (day, path, views) values (v_day, v_path, 1)
  on conflict (day, path) do update set views = p.views + 1;

  if p_source is not null then
    insert into site_traffic_sources as s (day, source, visits) values (v_day, p_source, 1)
    on conflict (day, source) do update set visits = s.visits + 1;
  end if;

  -- O código de ontem ainda conta quem atravessa a meia-noite; o de antes disso sai
  delete from site_traffic_visitors where day < v_day - 1;
  return v_novo;
end $$;

-- Painel: os totais de hoje, de ontem e do período, um ponto por dia (dias sem visita contam
-- zero), as páginas mais vistas com o nome da coleção ou da peça, as origens e os aparelhos.
create function admin_site_traffic(p_days integer default 30) returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_fim date := store_today();
  v_inicio date := store_today() - (least(greatest(coalesce(p_days, 30), 7), 90) - 1);
begin
  return jsonb_build_object(
    'inicio', v_inicio, 'fim', v_fim,
    'hoje', (select jsonb_build_object('visitas', coalesce(sum(views), 0), 'visitantes', coalesce(sum(visitors), 0)) from site_traffic_days where day = v_fim),
    'ontem', (select jsonb_build_object('visitas', coalesce(sum(views), 0), 'visitantes', coalesce(sum(visitors), 0)) from site_traffic_days where day = v_fim - 1),
    'seteDias', (select jsonb_build_object('visitas', coalesce(sum(views), 0), 'visitantes', coalesce(sum(visitors), 0)) from site_traffic_days where day > v_fim - 7),
    'periodo', (select jsonb_build_object('visitas', coalesce(sum(views), 0), 'visitantes', coalesce(sum(visitors), 0)) from site_traffic_days where day >= v_inicio),
    'dias', (select jsonb_agg(jsonb_build_object('dia', g.dia::date, 'visitas', coalesce(d.views, 0), 'visitantes', coalesce(d.visitors, 0)) order by g.dia)
               from generate_series(v_inicio, v_fim, interval '1 day') as g(dia)
               left join site_traffic_days d on d.day = g.dia::date),
    'paginas', (select coalesce(jsonb_agg(jsonb_build_object('caminho', x.path, 'nome', x.nome, 'visitas', x.views) order by x.views desc, x.path), '[]')
                  from (select p.path, sum(p.views)::int as views,
                               coalesce((select c.name from collections c where p.path = '/colecao/' || c.slug),
                                        (select pr.name from products pr where p.path = '/produto/' || pr.slug)) as nome
                          from site_traffic_pages p where p.day >= v_inicio
                         group by p.path order by sum(p.views) desc, p.path limit 10) x),
    'origens', (select coalesce(jsonb_agg(jsonb_build_object('origem', x.source, 'entradas', x.visits) order by x.visits desc, x.source), '[]')
                  from (select source, sum(visits)::int as visits from site_traffic_sources where day >= v_inicio group by source) x),
    'aparelhos', (select jsonb_build_object('celular', coalesce(sum(mobile), 0), 'tablet', coalesce(sum(tablet), 0), 'computador', coalesce(sum(desktop), 0))
                    from site_traffic_days where day >= v_inicio));
end $$;

call lock_down_public();
