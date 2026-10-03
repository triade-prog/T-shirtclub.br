#!/usr/bin/env bash
# T16 · Aprovação e expiração no mesmo instante, cada uma numa conexão própria. 30 reservas com
# PIX pendente criado no prazo; o relógio vai para o fim da tolerância (a varredura já pode
# expirar) e, ao mesmo tempo, chega a aprovação de cada PIX (aprovado dentro da tolerância, o
# aviso atrasou) e rodam 3 varreduras. Cada reserva termina de um jeito só: paga (pagamento
# aplicado, peça vendida) ou expirada (pagamento em análise, peça devolvida). Nunca as duas
# coisas, nunca nenhuma, e o estoque fecha. Usa o banco já preparado pelo test-db.sh.
set -euo pipefail
PSQL=("$PGBIN/psql" -v ON_ERROR_STOP=1 -q -X -At)
SAIDA="$(mktemp -d /tmp/tshirtclub-t16.XXXXXX)"
trap 'rm -rf "$SAIDA"; "${PSQL[@]}" -c "select set_app_clock(interval '"'"'0'"'"')" >/dev/null' EXIT
N=30

"${PSQL[@]}" >/dev/null <<SQL
select set_app_clock(interval '0');
insert into collections (id, name, slug, color_key) values ('00000000-0000-4000-8000-0000000cc016', 'Teste T16', 'teste-t16', 'MENTA');
insert into products (id, collection_id, code, slug, name, price_cents)
values ('00000000-0000-4000-8000-0000000aa016', '00000000-0000-4000-8000-0000000cc016', 'T16-01', 't16-aprovacao', 'Aprovação e expiração', 4999);
update product_variants set qty_total = $N where sku = 'T16-01-UNI';
insert into product_images (product_id, storage_path, kind, alt_text, width, height, position)
values ('00000000-0000-4000-8000-0000000aa016', 'produtos/t16-01.webp', 'FRENTE', 'T16', 10, 10, 1);
update products set published_at = app_now() where code = 'T16-01';

-- Reserva de 1 peça e PIX pendente, criado dentro do prazo, para cada telefone
do \$\$
declare s uuid; a uuid; v_res uuid; v_pg uuid; v_tel text; v_tok text;
begin
  for n in 1..$N loop
    v_tel := '+55776' || lpad(n::text, 7, '0');
    v_tok := encode(extensions.digest('t16-' || n, 'sha256'), 'hex');
    insert into otp_sessions (phone_e164, purpose, status, verified_at) values (v_tel, 'RESERVA', 'VERIFICADA', app_now()) returning id into s;
    insert into reservation_attempts (ref, customer_name, phone_e164, delivery_intent, items, expected_total_cents, otp_session_id,
                                      status, verified_until, browser_token_hash)
    values (gen_attempt_ref(), 'Cliente T16', v_tel, 'RETIRADA', testes.com_unico('[{"produtoId": "00000000-0000-4000-8000-0000000aa016", "qtd": 1}]'),
            4999, s, 'VERIFICADA', app_now() + interval '10 minutes', v_tok)
    returning id into a;
    v_res := (create_reservation(a, v_tok, jsonb_build_object(
      'linhas', testes.com_unico('[{"produtoId": "00000000-0000-4000-8000-0000000aa016", "qtd": 1, "precoTabelaCentavos": 4999, "descontoCentavos": 0, "totalCentavos": 4999}]'),
      'subtotalCentavos', 4999, 'descontoCentavos', 0, 'totalCentavos', 4999, 'aplicada', null,
      'chaveHash', encode(extensions.digest('t16-chave-' || n, 'sha256'), 'hex'), 'link', 'https://tshirtclub.pt/r#x')) -> 'reserva' ->> 'id')::uuid;
    v_pg := (register_payment_attempt(v_res, v_tel, 'PIX', gen_random_uuid()) -> 'pagamento' ->> 'id')::uuid;
    perform payment_created(v_pg, jsonb_build_object('providerPaymentId', 'mp-t16-' || n, 'statusProvedor', 'pending'));
  end loop;
end \$\$;
SQL

criadas=$("${PSQL[@]}" -c "select count(*) from payments p join reservations r on r.id = p.reservation_id where r.phone_e164 like '+55776%' and p.status = 'PENDENTE' and r.status = 'RESERVADO'")
[ "$criadas" = "$N" ] || { echo "T16: preparo falhou ($criadas de $N reservas com PIX pendente)"; exit 1; }

# Como na produção, a varredura de cada minuto marca a tolerância logo depois do prazo (PIX
# pendente criado no prazo). Depois, fim da tolerância e mais 2 min: a varredura já expira mesmo
# com o PIX pendente. O aprovado veio aos 4 min da tolerância; o aviso é que chega agora.
"${PSQL[@]}" -c "select set_app_clock(make_interval(mins => setting_int('reserva_minutos'), secs => 30))" >/dev/null
tolerancias=$("${PSQL[@]}" -c "select sweep_reservations() ->> 'tolerancias'")
[ "$tolerancias" = "$N" ] || { echo "T16: tolerância marcada em $tolerancias de $N"; exit 1; }
"${PSQL[@]}" -c "select set_app_clock(make_interval(mins => setting_int('reserva_minutos') + setting_int('tolerancia_minutos') + 2, secs => 10))" >/dev/null

mapfile -t PAGAMENTOS < <("${PSQL[@]}" -c "select p.id || ' ' || (r.expires_at + interval '4 minutes') from payments p join reservations r on r.id = p.reservation_id where r.phone_e164 like '+55776%'")
for linha in "${PAGAMENTOS[@]}"; do
  read -r id aprovado <<<"$linha"
  "${PSQL[@]}" -c "select apply_payment_result('$id', jsonb_build_object('status', 'APROVADO', 'aprovadoEm', '$aprovado'::timestamptz, 'valorCentavos', 4999,
    'moeda', 'BRL', 'referencia', '$id', 'conta', setting('mp_collector_id') #>> '{}', 'statusProvedor', 'approved')) ->> 'resultado'" >"$SAIDA/pg-$id" &
done
for v in 1 2 3; do "${PSQL[@]}" -c "select sweep_reservations() ->> 'expiradas'" >"$SAIDA/varredura-$v" & done
wait

# Cada reserva: paga com o pagamento aplicado, ou expirada com o pagamento em análise
resumo=$("${PSQL[@]}" -c "
  select count(*) filter (where r.status = 'PAGAMENTO_CONFIRMADO' and p.status = 'APROVADO' and p.applied) || ' ' ||
         count(*) filter (where r.status = 'EXPIRADO' and p.status = 'EM_ANALISE' and not p.applied
                            and exists (select 1 from payment_reviews v where v.payment_id = p.id)) || ' ' ||
         count(*) filter (where (r.status = 'EXPIRADO' and p.applied) or r.status not in ('PAGAMENTO_CONFIRMADO', 'EXPIRADO'))
    from reservations r join payments p on p.reservation_id = r.id where r.phone_e164 like '+55776%'")
read -r pagas expiradas erradas <<<"$resumo"
estoque=$("${PSQL[@]}" -c "select qty_reserved || ' ' || qty_sold from product_variants where sku = 'T16-01-UNI'")
read -r reservado vendido <<<"$estoque"
divergencias=$("${PSQL[@]}" -c "select check_stock_invariants() ->> 'divergencias'")
respostas=$(cat "$SAIDA"/pg-* | sort | uniq -c | awk '{printf "%s %s; ", $2, $1}')
echo "T16: $N aprovações e 3 varreduras ao mesmo tempo → $pagas pagas, $expiradas expiradas com o pagamento em análise, $erradas inconsistentes; estoque reservado $reservado, vendido $vendido; divergências = $divergencias (respostas: $respostas)"
[ "$((pagas + expiradas))" = "$N" ] && [ "$erradas" = 0 ] && [ "$reservado" = 0 ] && [ "$vendido" = "$pagas" ] && [ "$divergencias" = 0 ] \
  || { echo "T16 FALHOU"; exit 1; }
echo "Aprovação e expiração simultâneas: ok"
