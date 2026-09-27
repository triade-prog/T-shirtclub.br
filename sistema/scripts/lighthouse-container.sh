#!/usr/bin/env bash
# Lighthouse no celular dentro do container do CI (Playwright 1.63, Ubuntu noble), com o mesmo
# lighthouserc.cjs do job "Lighthouse no celular": build da loja, next start e lhci autorun.
#   bash scripts/lighthouse-container.sh            (3 execuções, confere as metas)
#   RODADAS=5 bash scripts/lighthouse-container.sh  (mais execuções para comparar antes e depois)
#   ESTRANGULAMENTO=devtools bash scripts/lighthouse-container.sh
#     (rede e CPU estrangulados de verdade no navegador, em vez da simulação do CI: no localhost a
#      simulação soma tudo o que foi pedido antes do LCP observado, então serve de contraprova)
#   HTTP2=1 bash scripts/lighthouse-container.sh
#     (mede por um proxy HTTP/2 com TLS, como na Vercel; o next start só fala HTTP/1.1, com 6
#      conexões por origem, e aí as pré-cargas seguram o CSS na fila)
# Precisa de Docker. Roda numa cópia limpa do commit atual (mais o que ainda não foi commitado),
# em /tmp; os relatórios voltam para sistema/.lighthouseci e o resumo sai no fim.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGEM="mcr.microsoft.com/playwright:v1.63.0-noble"
COPIA="$(mktemp -d /tmp/tshirtclub-lh.XXXXXX)"
trap 'rm -rf "$COPIA"' EXIT

git clone -q "$RAIZ" "$COPIA"
(cd "$RAIZ" && git ls-files -m -o --exclude-standard -z) | (cd "$RAIZ" && xargs -0 -r cp --parents -t "$COPIA")

EXTRA=()
for v in HTTPS_PROXY HTTP_PROXY NO_PROXY; do [ -n "${!v:-}" ] && EXTRA+=(-e "$v"); done
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$NODE_EXTRA_CA_CERTS" ]; then
  cp "$NODE_EXTRA_CA_CERTS" "$COPIA/ca.crt"; EXTRA+=(-e NODE_EXTRA_CA_CERTS=/w/ca.crt)
fi

docker run --rm --network host --ipc=host -v "$COPIA:/w" -w /w/sistema -e CI=true -e RODADAS="${RODADAS:-3}" -e ESTRANGULAMENTO="${ESTRANGULAMENTO:-simulate}" -e HTTP2="${HTTP2:-}" "${EXTRA[@]}" "$IMAGEM" bash -c '
  set -e
  corepack enable && corepack install >/dev/null
  pnpm install --frozen-lockfile --reporter=silent
  pnpm --filter @tshirtclub/web build >/dev/null
  bash scripts/subir-apps.sh
  export CHROME_PATH="$(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome | head -1)"
  OPCOES=(--collect.numberOfRuns="$RODADAS" --collect.settings.throttlingMethod="$ESTRANGULAMENTO")
  if [ -n "$HTTP2" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -keyout /tmp/chave.pem -out /tmp/cert.pem 2>/dev/null
    node scripts/proxy-http2.mjs 8443 http://127.0.0.1:3000 /tmp/cert.pem /tmp/chave.pem & sleep 1
    OPCOES+=(--collect.url=https://localhost:8443/ "--collect.settings.chromeFlags=--no-sandbox --headless=new --ignore-certificate-errors")
  fi
  npx --yes @lhci/cli@0.15.x autorun --config=lighthouserc.cjs "${OPCOES[@]}" && status=0 || status=$?
  bash scripts/subir-apps.sh parar
  node -e "
    const fs = require(\"fs\"), dir = \".lighthouseci\";
    const lhrs = fs.readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(dir + \"/\" + f)));
    if (lhrs.length === 0) { console.log(\"\nNenhuma execução terminou.\"); process.exit(0); }
    const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const a = (l, id) => l.audits[id].numericValue;
    const fontes = (l) => l.audits[\"network-requests\"].details.items.filter((i) => i.resourceType === \"Font\");
    const linhas = [
      [\"Desempenho\", lhrs.map((l) => Math.round(l.categories.performance.score * 100))],
      [\"LCP (ms)\", lhrs.map((l) => Math.round(a(l, \"largest-contentful-paint\")))],
      [\"FCP (ms)\", lhrs.map((l) => Math.round(a(l, \"first-contentful-paint\")))],
      [\"TBT (ms)\", lhrs.map((l) => Math.round(a(l, \"total-blocking-time\")))],
      [\"CLS\", lhrs.map((l) => a(l, \"cumulative-layout-shift\").toFixed(3))],
      [\"Fontes (arquivos)\", lhrs.map((l) => fontes(l).length)],
      [\"HTTP\", lhrs.map((l) => l.audits[\"network-requests\"].details.items[0].protocol)],
      [\"Fontes (KB)\", lhrs.map((l) => Math.round(fontes(l).reduce((t, i) => t + i.transferSize, 0) / 1024))],
    ];
    console.log(\"\nResumo (\" + lhrs.length + \" execuções): mediana e cada execução\");
    for (const [n, v] of linhas) console.log(n.padEnd(18), String(v.every((x) => !isNaN(Number(x))) ? med(v.map(Number)) : v[0]).padStart(6), \"  [\" + v.join(\", \") + \"]\");
    const l = lhrs[0].audits[\"largest-contentful-paint-element\"].details;
    const el = l && l.items && l.items[0] && (l.items[0].items ? l.items[0].items[0] : l.items[0]);
    if (el && el.node) console.log(\"Elemento do LCP:  \", el.node.snippet);
  "
  exit $status' && status=0 || status=$?

rm -rf "$RAIZ/sistema/.lighthouseci"
cp -r "$COPIA/sistema/.lighthouseci" "$RAIZ/sistema/.lighthouseci" 2>/dev/null || true
exit "$status"
