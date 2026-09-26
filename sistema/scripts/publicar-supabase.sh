#!/usr/bin/env bash
# Publica o Supabase de produção (projeto woetzyiutwrpxgeiecsu, sa-east-1): migrations (com o
# bucket catalogo), as 5 Edge Functions, os segredos das funções e o worker no Vault.
# Pode rodar de novo: não troca segredo que já existe (trocar o OTP_PEPPER invalidaria os
# códigos em andamento) e só mexe no WORKER_SEGREDO quando ele e o Vault não batem.
#
# Uso (em sistema/): bash scripts/publicar-supabase.sh
# Precisa de: SUPABASE_ACCESS_TOKEN e SUPABASE_DB_PASSWORD no ambiente; rede para
# api.supabase.com, <ref>.supabase.co, o banco do projeto e o download da CLI (github.com).
# Opcionais: LOJA_URL (padrão https://tshirtclub.pt), SUPABASE_REF.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

REF="${SUPABASE_REF:-woetzyiutwrpxgeiecsu}"
LOJA_URL="${LOJA_URL:-https://tshirtclub.pt}"
LOJA_WHATSAPP="5577998155772"
ZAPI_INSTANCIA="3F9C1155D634D15F62F75E00F85CEB2F"
FUNCOES=(api-public api-admin webhook-whatsapp webhook-payments worker)
JA_CADASTRADOS=(REPASSE_SEGREDO WEBHOOK_WHATSAPP_SEGREDO ZAPI_TOKEN ZAPI_CLIENT_TOKEN)
API="https://api.supabase.com/v1/projects/$REF"

: "${SUPABASE_ACCESS_TOKEN:?defina SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_DB_PASSWORD:?defina SUPABASE_DB_PASSWORD}"
export SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
command -v jq >/dev/null || { echo "Falta o jq"; exit 1; }
command -v openssl >/dev/null || { echo "Falta o openssl"; exit 1; }

SUPABASE=(npx --yes supabase@2)
command -v supabase >/dev/null && SUPABASE=(supabase)

# Arquivos com segredo ficam num diretório só do usuário e somem no fim.
TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
aleatorio() { openssl rand -hex 32; }

# SQL pela API de gestão (sem depender do host do banco). O corpo vai por arquivo, nunca na
# linha de comando, porque pode levar segredo.
sql() {
  jq -n --arg q "$1" '{query: $q}' > "$TMP/consulta.json"
  curl -sS --fail-with-body -X POST "$API/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data @"$TMP/consulta.json"
  rm -f "$TMP/consulta.json"
}

echo "== Projeto"
curl -sS --fail-with-body "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | jq -r '"\(.name) · \(.region) · \(.status)"'

echo "== Migrations"
"${SUPABASE[@]}" link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD"
"${SUPABASE[@]}" db push --linked -p "$SUPABASE_DB_PASSWORD" --yes
"${SUPABASE[@]}" migration list --linked -p "$SUPABASE_DB_PASSWORD"
sql "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'catalogo'" | jq -c .

echo "== Edge Functions"
"${SUPABASE[@]}" functions deploy "${FUNCOES[@]}" --project-ref "$REF" --use-api

echo "== Segredos (só os nomes)"
# A listagem traz nome e resumo (hash), nunca o valor; aqui só o nome é usado.
"${SUPABASE[@]}" secrets list --project-ref "$REF" -o json | jq -r '.[].name' | sort > "$TMP/nomes"
existe() { grep -qx "$1" "$TMP/nomes"; }
faltando=()
for n in "${JA_CADASTRADOS[@]}"; do
  if existe "$n"; then echo "ok  $n"; else echo "FALTA $n"; faltando+=("$n"); fi
done

: > "$TMP/segredos.env"; chmod 600 "$TMP/segredos.env"
for n in OTP_PEPPER IP_SAL; do
  if existe "$n"; then echo "ok  $n (mantido)"; else echo "$n=$(aleatorio)" >> "$TMP/segredos.env"; echo "novo $n"; fi
done

# WORKER_SEGREDO precisa ser o mesmo na função e no Vault (o pg_net manda no cabeçalho).
# Como não lemos o valor da função, se um dos dois faltar os dois recebem um valor novo.
no_vault=$(sql "select count(*) as n from vault.secrets where name = 'worker_segredo'" | jq -r '.[0].n')
if existe WORKER_SEGREDO && [ "$no_vault" = "1" ]; then
  echo "ok  WORKER_SEGREDO (função e Vault, mantido)"
else
  worker="$(aleatorio)"
  echo "WORKER_SEGREDO=$worker" >> "$TMP/segredos.env"
  sql "do \$\$ begin
         if exists (select 1 from vault.secrets where name = 'worker_segredo') then
           perform vault.update_secret((select id from vault.secrets where name = 'worker_segredo'), '$worker');
         else
           perform vault.create_secret('$worker', 'worker_segredo', 'Segredo do worker (x-worker-segredo)');
         end if;
       end \$\$" > /dev/null
  unset worker
  echo "novo WORKER_SEGREDO (função e Vault)"
fi

cat >> "$TMP/segredos.env" <<EOF
ZAPI_INSTANCIA=$ZAPI_INSTANCIA
LOJA_WHATSAPP=$LOJA_WHATSAPP
LOJA_URL=$LOJA_URL
EOF
"${SUPABASE[@]}" secrets set --project-ref "$REF" --env-file "$TMP/segredos.env"
rm -f "$TMP/segredos.env"

echo "== Worker e ambiente no banco"
sql "update app_settings set value = to_jsonb('https://$REF.supabase.co/functions/v1/worker'::text), updated_at = now() where key = 'worker_url';
     update app_settings set value = '\"producao\"', updated_at = now() where key = 'ambiente';" > /dev/null
sql "select key, value from app_settings where key in ('worker_url', 'ambiente') order by key" | jq -c .
sql "select name from vault.secrets where name = 'worker_segredo'" | jq -c .
sql "select jobname, schedule from cron.job order by jobname" | jq -c .

echo "== Conferência"
"${SUPABASE[@]}" functions list --project-ref "$REF"
saude=$(curl -sS -o /dev/null -w '%{http_code}' "https://$REF.supabase.co/functions/v1/worker/saude" || true)
echo "worker/saude: HTTP $saude (200 saudável; 503 com alerta aberto)"

# Sem estes, as funções que os exigem param na subida (exigir): api-public, api-admin,
# webhook-payments e worker precisam do Mercado Pago; a loja e o painel, do Turnstile.
depois=()
for n in TURNSTILE_SECRET MP_ACCESS_TOKEN MP_EMAIL_PIX MP_WEBHOOK_SECRET; do existe "$n" || depois+=("$n"); done
[ ${#depois[@]} -gt 0 ] && echo "Ainda sem cadastro (as funções que os usam não sobem): ${depois[*]}"

if [ ${#faltando[@]} -gt 0 ]; then
  echo "Atenção: faltam no Supabase ${faltando[*]}"; exit 2
fi
echo "Publicação do Supabase concluída."
