#!/usr/bin/env bash
# Sobe loja (3000) e painel (3001) em modo produção, com a vitrine de componentes ligada.
# Para parar: bash scripts/subir-apps.sh parar
set -euo pipefail
cd "$(dirname "$0")/.."
PIDS=/tmp/tshirtclub-apps.pids

parar() {
  if [ -f "$PIDS" ]; then
    while read -r pid; do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done < "$PIDS"
    rm -f "$PIDS"
  fi
  # Servidor que ficou de uma rodada anterior (sem o arquivo de pids) também sai
  pkill -f "next start --port 300[01]" 2>/dev/null || true
  pkill -f "next-serve[r]" 2>/dev/null || true
  sleep 1
}

parar
[ "${1:-}" = "parar" ] && exit 0

# Porta ocupada faria o teste rodar contra um build antigo: melhor falhar aqui
for porta in 3000 3001; do
  if curl -s -o /dev/null "http://localhost:$porta/"; then echo "Porta $porta ocupada por outro servidor"; exit 1; fi
done

for app in web admin; do
  porta=$([ "$app" = web ] && echo 3000 || echo 3001)
  (cd "apps/$app" && MOSTRAR_COMPONENTES=1 setsid nohup npx next start --port "$porta" >"/tmp/tshirtclub-$app.log" 2>&1 & echo $! >> "$PIDS")
done
for porta in 3000 3001; do
  for _ in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$porta/_componentes" && break; sleep 0.5; done
done
echo "loja em http://localhost:3000 · painel em http://localhost:3001"
