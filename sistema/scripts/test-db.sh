#!/usr/bin/env bash
# Sobe um Postgres temporário, aplica as migrations em ordem e roda os testes pgTAP.
# Depois roda o teste de concorrência da reserva.
# Uso: bash scripts/test-db.sh   (precisa de PostgreSQL 15+ com pgTAP e pg_prove)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(pg_config --bindir 2>/dev/null || ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
PORTA="${PGPORT_TESTE:-54329}"
DADOS="$(mktemp -d /tmp/tshirtclub-pg.XXXXXX)"

como_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DADOS"

limpar() { como_pg "$PGBIN/pg_ctl" -D "$DADOS" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DADOS"; }
trap limpar EXIT

como_pg "$PGBIN/initdb" -D "$DADOS" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
como_pg "$PGBIN/pg_ctl" -D "$DADOS" -o "-p $PORTA -k /tmp -c listen_addresses=127.0.0.1 -c max_connections=200" -w start >/dev/null

export PGHOST=/tmp PGPORT="$PORTA" PGUSER=postgres PGDATABASE=postgres
PSQL=("$PGBIN/psql" -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$RAIZ/supabase/tests/bootstrap.sql"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  echo "migration $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

pg_prove --ext .sql -r "$RAIZ/supabase/tests/pgtap"

# Concorrência da criação da reserva: 50 clientes pela última unidade e duas abas (F4.4).
PGBIN="$PGBIN" bash "$RAIZ/supabase/tests/concorrencia/ultima-unidade.sh"

# Integração das Edge Functions com o banco de verdade (fluxo da reserva, F3 + F4).
DENO="${DENO:-$(command -v deno || echo "$RAIZ/node_modules/.bin/deno")}"
if [ -x "$DENO" ]; then
  (cd "$RAIZ/supabase/functions" && PGURL_TESTE="postgres://postgres@127.0.0.1:$PORTA/postgres" \
    "$DENO" test --allow-env --allow-read --allow-net=127.0.0.1 integracao/)
else
  echo "Deno não encontrado: integração das Edge Functions pulada (rode pnpm install)"
fi
