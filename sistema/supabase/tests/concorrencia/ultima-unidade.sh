#!/usr/bin/env bash
# Concorrência da criação da reserva (F4.4, T1 e T3), cada confirmação numa conexão própria.
# Usa o banco já preparado pelo test-db.sh (PGHOST, PGPORT etc. no ambiente).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$PGBIN/psql" -v ON_ERROR_STOP=1 -q -X -At)
SAIDA="$(mktemp -d /tmp/tshirtclub-conc.XXXXXX)"
trap 'rm -rf "$SAIDA"' EXIT

"${PSQL[@]}" -f "$AQUI/preparar.sql" >/dev/null

linhas() { # linhas do motor para 1 unidade do produto
  printf '{"linhas":[{"produtoId":"%s","qtd":1,"precoTabelaCentavos":4999,"descontoCentavos":0,"totalCentavos":4999}],"subtotalCentavos":4999,"descontoCentavos":0,"totalCentavos":4999,"aplicada":null,"chaveHash":"%s","link":"https://tshirtclub.pt/r#x"}' \
    "$1" "$(printf '%s' "$2" | sha256sum | cut -c1-64)"
}

# T1: 50 clientes, 1 unidade
mapfile -t TENTATIVAS < <("${PSQL[@]}" -c "select id || ' ' || phone_e164 from reservation_attempts where items @> '[{\"produtoId\":\"00000000-0000-4000-8000-0000000aa001\"}]'")
for linha in "${TENTATIVAS[@]}"; do
  read -r id tel <<<"$linha"
  token=$(printf '%s' "t$tel" | sha256sum | cut -c1-64)
  "${PSQL[@]}" -c "select create_reservation('$id', '$token', '$(linhas 00000000-0000-4000-8000-0000000aa001 "$id")') ->> 'erro'" >"$SAIDA/$id" &
done
wait
venceu=$(grep -L . "$SAIDA"/* | wc -l)
sem_estoque=$(grep -l '^STOCK_UNAVAILABLE$' "$SAIDA"/* | wc -l)
reservado=$("${PSQL[@]}" -c "select qty_reserved from products where code = 'CON-01'")
echo "T1: ${#TENTATIVAS[@]} confirmações simultâneas → $venceu reserva, $sem_estoque STOCK_UNAVAILABLE, qty_reserved = $reservado"
[ "${#TENTATIVAS[@]}" = 50 ] && [ "$venceu" = 1 ] && [ "$sem_estoque" = 49 ] && [ "$reservado" = 1 ] || { echo "T1 FALHOU"; exit 1; }

# T3: duas abas do mesmo telefone confirmando juntas
rm -f "$SAIDA"/*
for ref in ABA2 ABA3; do
  id=$("${PSQL[@]}" -c "select id from reservation_attempts where ref = '$ref'")
  token=$(printf '%s' "aba-$ref" | sha256sum | cut -c1-64)
  "${PSQL[@]}" -c "select coalesce(create_reservation('$id', '$token', '$(linhas 00000000-0000-4000-8000-0000000aa002 "$id")') ->> 'erro', 'OK')" >"$SAIDA/$ref" &
done
wait
resultado=$(sort "$SAIDA"/* | tr '\n' ' ')
ativas=$("${PSQL[@]}" -c "select count(*) from reservations where phone_e164 = '+5577988887777' and status = 'RESERVADO'")
echo "T3: duas abas → $resultado(reservas ativas do telefone: $ativas)"
[ "$resultado" = "ACTIVE_RESERVATION_EXISTS OK " ] && [ "$ativas" = 1 ] || { echo "T3 FALHOU"; exit 1; }
echo "Concorrência: ok"
