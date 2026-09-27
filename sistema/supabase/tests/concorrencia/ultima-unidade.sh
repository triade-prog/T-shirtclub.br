#!/usr/bin/env bash
# Concorrência da criação da reserva (F4.4, T1 e T3), cada confirmação numa conexão própria.
# Usa o banco já preparado pelo test-db.sh (PGHOST, PGPORT etc. no ambiente).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$PGBIN/psql" -v ON_ERROR_STOP=1 -q -X -At)
SAIDA="$(mktemp -d /tmp/tshirtclub-conc.XXXXXX)"
trap 'rm -rf "$SAIDA"' EXIT

"${PSQL[@]}" -f "$AQUI/preparar.sql" >/dev/null

linhas() { # linhas do motor para 1 unidade: os itens da tentativa ($1) com preço e total
  printf '{"linhas":[%s],"subtotalCentavos":4999,"descontoCentavos":0,"totalCentavos":4999,"aplicada":null,"chaveHash":"%s","link":"https://tshirtclub.pt/r#x"}' \
    "$1" "$(printf '%s' "$2" | sha256sum | cut -c1-64)"
}
item() { # o item da tentativa, já com precoTabelaCentavos, descontoCentavos e totalCentavos
  "${PSQL[@]}" -c "select (items -> 0) || '{\"precoTabelaCentavos\":4999,\"descontoCentavos\":0,\"totalCentavos\":4999}'::jsonb from reservation_attempts where id = '$1'"
}

# T1: 50 clientes pelo último Plus e, ao mesmo tempo, 5 pelo Único (que tem 5)
mapfile -t TENTATIVAS < <("${PSQL[@]}" -c "select id || ' ' || phone_e164 from reservation_attempts where items @> '[{\"produtoId\":\"00000000-0000-4000-8000-0000000aa001\"}]'")
mkdir -p "$SAIDA/plus" "$SAIDA/unico"
for linha in "${TENTATIVAS[@]}"; do
  read -r id tel <<<"$linha"
  token=$(printf '%s' "t$tel" | sha256sum | cut -c1-64)
  grupo=$([[ "$tel" == +55779* ]] && echo plus || echo unico)
  "${PSQL[@]}" -c "select create_reservation('$id', '$token', '$(linhas "$(item "$id")" "$id")') ->> 'erro'" >"$SAIDA/$grupo/$id" &
done
wait
# (grep sai com 1 quando nenhum arquivo casa; aqui zero é resposta, não erro)
contar() { { grep "$@" || true; } | wc -l; }
venceu=$(contar -L . "$SAIDA"/plus/*)
sem_estoque=$(contar -l '^STOCK_UNAVAILABLE$' "$SAIDA"/plus/*)
unico_ok=$(contar -L . "$SAIDA"/unico/*)
reservado=$("${PSQL[@]}" -c "select string_agg(sku || '=' || qty_reserved, ' ' order by sku) from product_variants where sku like 'CON-01-%'")
divergencias=$("${PSQL[@]}" -c "select check_stock_invariants() ->> 'divergencias'")
echo "T1: ${#TENTATIVAS[@]} confirmações simultâneas → Plus: $venceu reserva, $sem_estoque STOCK_UNAVAILABLE; Único: $unico_ok de 5; $reservado; divergências = $divergencias"
[ "${#TENTATIVAS[@]}" = 55 ] && [ "$venceu" = 1 ] && [ "$sem_estoque" = 49 ] && [ "$unico_ok" = 5 ] \
  && [ "$reservado" = "CON-01-PLUS=1 CON-01-UNI=5" ] && [ "$divergencias" = 0 ] || { echo "T1 FALHOU"; exit 1; }

# T3: duas abas do mesmo telefone confirmando juntas
rm -rf "${SAIDA:?}"/*
for ref in ABA2 ABA3; do
  id=$("${PSQL[@]}" -c "select id from reservation_attempts where ref = '$ref'")
  token=$(printf '%s' "aba-$ref" | sha256sum | cut -c1-64)
  "${PSQL[@]}" -c "select coalesce(create_reservation('$id', '$token', '$(linhas "$(item "$id")" "$id")') ->> 'erro', 'OK')" >"$SAIDA/$ref" &
done
wait
resultado=$(sort "$SAIDA"/* | tr '\n' ' ')
ativas=$("${PSQL[@]}" -c "select count(*) from reservations where phone_e164 = '+5577988887777' and status = 'RESERVADO'")
echo "T3: duas abas → $resultado(reservas ativas do telefone: $ativas)"
[ "$resultado" = "ACTIVE_RESERVATION_EXISTS OK " ] && [ "$ativas" = 1 ] || { echo "T3 FALHOU"; exit 1; }
echo "Concorrência: ok"
