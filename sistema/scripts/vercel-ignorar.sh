#!/usr/bin/env bash
# "Ignored Build Step" da Vercel (ignoreCommand em apps/<app>/vercel.json): pula a publicação
# quando nada do que entra no build do app mudou desde a última publicação que deu certo
# (VERCEL_GIT_PREVIOUS_SHA). Assim, merge só de documentação, testes, banco ou do outro app não
# gasta o limite diário de publicações. Comparar com a última publicação (e não com o commit
# anterior) evita deixar para trás uma publicação recusada por limite.
#   Saída 0: pula. Saída 1: publica. Na dúvida (sem a referência), publica.
#   uso: bash scripts/vercel-ignorar.sh web|admin
set -uo pipefail
APP="${1:?web ou admin}"
OUTRO=$([ "$APP" = web ] && echo admin || echo web)
cd "$(dirname "$0")/.." || exit 1

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ]; then echo "Sem publicação anterior: publica."; exit 1; fi
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  git fetch -q --depth=100 origin "$BASE" 2>/dev/null || { echo "Commit $BASE fora do clone: publica."; exit 1; }
fi

# Tudo de sistema/ entra no build, menos o outro app e o que não vai para a Vercel
if git diff --quiet "$BASE" HEAD -- . \
  ":(exclude)apps/$OUTRO" ":(exclude)supabase" ":(exclude)tests" ":(exclude)docs" \
  ":(exclude)scripts" ":(exclude)*.md" ":(exclude)lighthouserc.cjs" ":(exclude)playwright.config.ts"; then
  echo "Nada do $APP mudou desde $BASE: pula a publicação."
  exit 0
fi
echo "O $APP mudou desde $BASE: publica."
exit 1
