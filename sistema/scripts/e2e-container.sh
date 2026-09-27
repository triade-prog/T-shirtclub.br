#!/usr/bin/env bash
# Ponta a ponta no mesmo container do CI (Playwright 1.63, Ubuntu noble): as imagens de
# referência da comparação visual só batem quando geradas e conferidas nele.
#   bash scripts/e2e-container.sh                           (build e todos os testes)
#   bash scripts/e2e-container.sh --update-snapshots=all    (regera as telas de referência)
# Precisa de Docker. Roda numa cópia limpa do commit atual, em /tmp; as telas regeradas voltam
# para tests/e2e/__telas__ deste checkout.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGEM="mcr.microsoft.com/playwright:v1.63.0-noble"
COPIA="$(mktemp -d /tmp/tshirtclub-e2e.XXXXXX)"
trap 'rm -rf "$COPIA"' EXIT

git clone -q "$RAIZ" "$COPIA"
# Alterações ainda não commitadas também entram (o teste é do que está no disco)
(cd "$RAIZ" && git ls-files -m -o --exclude-standard -z) | (cd "$RAIZ" && xargs -0 -r cp --parents -t "$COPIA")

# Proxy e certificados do ambiente, quando houver (ex.: ambientes com proxy corporativo)
EXTRA=()
for v in HTTPS_PROXY HTTP_PROXY NO_PROXY; do [ -n "${!v:-}" ] && EXTRA+=(-e "$v"); done
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$NODE_EXTRA_CA_CERTS" ]; then
  cp "$NODE_EXTRA_CA_CERTS" "$COPIA/ca.crt"; EXTRA+=(-e NODE_EXTRA_CA_CERTS=/w/ca.crt)
fi

docker run --rm --network host -v "$COPIA:/w" -w /w/sistema -e CI=true "${EXTRA[@]}" "$IMAGEM" bash -c '
  set -e
  corepack enable && corepack install >/dev/null
  pnpm install --frozen-lockfile --reporter=silent
  MOSTRAR_COMPONENTES=1 ORIGEM_IMAGENS=http://127.0.0.1:4010 pnpm build >/dev/null
  pnpm e2e "$@"' _ "$@" && status=0 || status=$?

if [[ " $* " == *"--update-snapshots"* ]]; then
  cp -r "$COPIA/sistema/tests/e2e/__telas__/." "$RAIZ/sistema/tests/e2e/__telas__/"
  echo "Telas de referência copiadas para sistema/tests/e2e/__telas__ (confira com git status)."
fi
exit "$status"
