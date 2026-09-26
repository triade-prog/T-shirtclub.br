#!/usr/bin/env bash
# Confere as Edge Functions no Deno: tipos, lint e testes (inclui o import do packages/domain, G22).
set -euo pipefail
cd "$(dirname "$0")/../supabase/functions"
DENO="${DENO:-$(command -v deno || echo ../../node_modules/.bin/deno)}"
"$DENO" check api-public/index.ts api-admin/index.ts webhook-whatsapp/index.ts worker/index.ts
"$DENO" lint
"$DENO" test --allow-env
