#!/usr/bin/env bash
# Termina a publicação do Supabase de produção: segredos das Edge Functions e as 5 funções.
# O banco (migrations 0001–0300, bucket catalogo, worker_url e worker_segredo no Vault) já foi
# publicado em 27/09/2026; ver docs/CONTEXTO.md, seção "Publicação".
#
# Precisa de SUPABASE_ACCESS_TOKEN no ambiente. Nenhum valor de segredo é impresso: dos
# segredos que já existem, só os nomes são lidos.
#   bash scripts/publicar-supabase.sh            (confere, grava os segredos e publica)
#   bash scripts/publicar-supabase.sh conferir   (só confere os nomes, sem gravar nada)
#   LOJA_URL=https://outro.dominio bash scripts/publicar-supabase.sh
set -euo pipefail

REF="woetzyiutwrpxgeiecsu"
API="https://api.supabase.com/v1/projects/$REF"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
FUNCOES=(api-public api-admin webhook-whatsapp webhook-payments worker)
JA_EXISTENTES=(REPASSE_SEGREDO WEBHOOK_WHATSAPP_SEGREDO ZAPI_TOKEN ZAPI_CLIENT_TOKEN
  MP_ACCESS_TOKEN MP_EMAIL_PIX MP_WEBHOOK_SECRET TURNSTILE_SECRET)
ZAPI_INSTANCIA="3F9C1155D634D15F62F75E00F85CEB2F"
LOJA_WHATSAPP="5577998155772"
LOJA_URL="${LOJA_URL:-https://tshirtclub.vercel.app}"

: "${SUPABASE_ACCESS_TOKEN:?Defina SUPABASE_ACCESS_TOKEN no ambiente}"

api() { # api MÉTODO CAMINHO [corpo-json]
  curl -sS --fail-with-body -X "$1" "$API$2" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" ${3:+--data-binary "$3"}
}

# ─── 1. Nomes dos segredos (sem valores) ────────────────────────────────────────────
NOMES="$(api GET /secrets | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const x of JSON.parse(s))console.log(x.name)})')"
tem() { grep -qx "$1" <<<"$NOMES"; }

echo "Segredos já cadastrados (só os nomes):"
sed 's/^/  /' <<<"$NOMES"
FALTAM=()
for n in "${JA_EXISTENTES[@]}"; do tem "$n" || FALTAM+=("$n"); done
if ((${#FALTAM[@]})); then
  echo "Faltam no Supabase: ${FALTAM[*]}. Cadastre antes de publicar." >&2
  exit 1
fi
echo "OK: ${JA_EXISTENTES[*]} estão cadastrados."
[[ "${1:-}" == "conferir" ]] && exit 0

# ─── 2. Segredos internos e da loja ─────────────────────────────────────────────────
# OTP_PEPPER e IP_SAL só nascem uma vez: trocar o pepper invalida os códigos em aberto.
# WORKER_SEGREDO vem do Vault (gerado no banco), para ser o mesmo que a varredura manda.
export ZAPI_INSTANCIA LOJA_WHATSAPP LOJA_URL
tem OTP_PEPPER || export OTP_PEPPER="$(openssl rand -base64 48)"
tem IP_SAL || export IP_SAL="$(openssl rand -base64 32)"
WORKER_SEGREDO="$(api POST /database/query '{"query":"select decrypted_secret as v from vault.decrypted_secrets where name = '\''worker_segredo'\''"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(!r[0]?.v)process.exit(1);process.stdout.write(r[0].v)})')"
export WORKER_SEGREDO

CORPO="$(node -e '
  const nomes = ["WORKER_SEGREDO", "ZAPI_INSTANCIA", "LOJA_WHATSAPP", "LOJA_URL", "OTP_PEPPER", "IP_SAL"];
  console.log(JSON.stringify(nomes.filter((n) => process.env[n]).map((n) => ({ name: n, value: process.env[n] }))));')"
api POST /secrets "$CORPO" >/dev/null
echo "Gravados: $(node -e 'console.log(JSON.parse(process.argv[1]).map((x) => x.name).join(" "))' "$CORPO")"
unset WORKER_SEGREDO OTP_PEPPER IP_SAL CORPO

# ─── 3. Edge Functions ──────────────────────────────────────────────────────────────
# verify_jwt = false e o import map vêm do supabase/config.toml. O @tshirtclub/domain fica
# fora de supabase/functions (ADR 0001, item 6): se o empacotamento não o incluir, copie
# packages/domain/src para _shared num passo de build.
cd "$RAIZ"
for f in "${FUNCOES[@]}"; do
  npx --yes supabase@latest functions deploy "$f" --project-ref "$REF" --use-api
done

# ─── 4. Conferência ─────────────────────────────────────────────────────────────────
api GET /functions | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const f of JSON.parse(s))console.log(`  ${f.slug}: ${f.status}, versão ${f.version}, verify_jwt=${f.verify_jwt}`)})'
echo "Saúde do worker (200 = jobs em dia; 503 = algum atrasado):"
curl -sS -o /dev/null -w "  HTTP %{http_code}\n" "https://$REF.supabase.co/functions/v1/worker/saude"
