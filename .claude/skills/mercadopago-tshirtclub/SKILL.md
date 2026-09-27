---
name: mercadopago-tshirtclub
description: Contexto da T-shirt Club para o plugin do Mercado Pago (mp-integrate, mp-webhooks, mp-test-setup, mp-review e o agente mp-integration-expert). Use sempre que a tarefa tocar em pagamento, PIX, cartão, Card Payment Brick, webhook do Mercado Pago, estorno, contestação, credenciais MP_* ou revisão/homologação da integração, antes de seguir o assistente do plugin.
---

# Mercado Pago na T-shirt Club

A integração **já existe e está testada** (F6, F7, F8). O plugin serve para revisar, testar,
configurar a conta e diagnosticar, não para gerar outra integração do zero. Nunca crie um
segundo cliente do Mercado Pago, um segundo receptor de webhook ou um SDK por cima do que existe.

Responda sempre em português do Brasil. Nas credenciais, as abas são **Teste** e **Produção**.

## Respostas fixas para o assistente do plugin

Use estes valores sem perguntar de novo (a loja já decidiu). Se o plugin pedir o
`.mp-integrate-progress.md`, grave estes mesmos valores nele; o arquivo fica fora do Git.

| Dimensão | Valor | Por quê |
|---|---|---|
| `country` | `BR` (moeda `BRL`, fuso de Brasília `-03:00`) | loja no Brasil |
| `lang` | `pt` | |
| `product` | `checkout-api` com `brick: card-payment` para o cartão | PIX e cartão dentro da loja, sem redirecionar |
| `mode` | `payments` (`/v1/payments`) | decisão de F6; **não migrar para `/v1/orders`** sem pedido da loja |
| `sdk` | nenhum no servidor: `fetch` direto na API REST, em Deno (Supabase Edge Functions) | o SDK Node oficial não é usado nas Edge Functions; não instalar |
| `client` | `react` (Next.js, `sistema/apps/web`) | SDK JS v2 só no navegador, carregado sob demanda |
| `recurrent` | `no` | sem assinatura |
| `three_ds` | `no` | cartão em `binary_mode` |
| `marketplace` | não | uma única conta recebedora |

Não se aplicam: Checkout Pro, QR presencial, Point, assinaturas, marketplace, Wallet Connect, payouts, SmartApps.

## Onde está cada coisa

| O quê | Arquivo |
|---|---|
| `PaymentProvider`, cliente Mercado Pago, versão falsa e a conferência do `x-signature` | `sistema/supabase/functions/_shared/pagamentos.ts` |
| Receptor do webhook | `sistema/supabase/functions/webhook-payments/app.ts` |
| Processamento, fim da tolerância, cancelamento do PIX e reconciliação | `sistema/supabase/functions/worker/pagamentos.ts` |
| Criação da cobrança na reserva | `sistema/supabase/functions/api-public/reservas.ts` |
| Estorno e conversão (análise) no painel | `sistema/supabase/functions/api-admin/` |
| Regras no banco (`apply_payment_result`, inbox, análise, disputa) | `sistema/supabase/migrations/0040_payments.sql`, `0130_fn_payments.sql` |
| PIX na loja | `sistema/apps/web/src/app/reserva/[numero]/BlocoPix.tsx` |
| Cartão (Card Payment Brick) | `sistema/apps/web/src/app/reserva/[numero]/BlocoCartao.tsx` |
| CSP com os domínios do Mercado Pago | `sistema/packages/servidor/src/cabecalhos.ts` |
| Textos de recusa do cartão | `textoRecusaCartao` em `sistema/packages/domain` |
| O que fazer quando o Mercado Pago cai | `sistema/docs/runbook.md` |

## Regras de negócio que a integração precisa manter

- Uma forma por reserva: PIX **ou** cartão; a primeira cobrança fixa a forma, que vale também para o frete.
- PIX nasce com 30 min (`date_of_expiration`, o mínimo do Mercado Pago) e é cancelado no fim da tolerância (15 + 5 min). Nenhuma cobrança nova depois do minuto 15.
- Cartão: crédito à vista (`installments: 1`), `binary_mode: true`, só o token do Brick chega à API.
- `external_reference` é o id do **nosso** pagamento (UUID); `notification_url` é o `webhook-payments`.
- PIX usa `MP_EMAIL_PIX` como e-mail do pagador (a loja não coleta o e-mail da cliente).
- Status: `approved`→APROVADO; `pending`/`in_process`/`authorized`→PENDENTE; `rejected`→RECUSADO; `cancelled`→CANCELADO; `refunded`→ESTORNADO; `charged_back`/`in_mediation`→CONTESTADO.
- Valor, moeda ou conta (`collector_id` ≠ `app_settings.mp_collector_id`) diferentes: descartado ou análise, nunca aprovado direto. Aprovado depois da tolerância: análise (a loja estorna ou converte em pedido novo). Reserva expirada nunca é reativada.
- Estorno ou contestação aberta trava o "Entregue".

## Webhook (para o `mp-webhooks`)

Não gere outro receptor. O que existe já cumpre o piso de segurança do plugin:

- HMAC-SHA256 do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com `MP_WEBHOOK_SECRET`, comparação em tempo constante e janela de 5 min.
- Só o tópico `payment`; grava na inbox (`payment_event_register`), responde 200 e processa depois.
- O corpo do webhook nunca é aplicado: o worker **consulta o pagamento no Mercado Pago** e só então aplica.
- Idempotência em 5 camadas: `Idempotency-Key` da loja, `x-idempotency-key` no provedor (id do nosso pagamento), inbox do webhook, `applied` e a constraint final.

URL para cadastrar com `save_webhook` (produção, tópico **payment** apenas):
`https://woetzyiutwrpxgeiecsu.supabase.co/functions/v1/webhook-payments`

Para diagnosticar, use `notifications_history` e compare com o alerta `PAGAMENTOS_PARADOS` do painel.

## Revisão (para o `mp-review`)

- `/v1/payments` com o `CardPayment` do Brick é o uso correto (exceção 2 do próprio plugin): não marque como dívida técnica nem sugira `/mp-integrate migrate`.
- A chave pública pode ir ao navegador (`NEXT_PUBLIC_MP_PUBLIC_KEY`); o access token nunca. Nenhuma variável `NEXT_PUBLIC_*` pode conter `MP_ACCESS_TOKEN` ou `MP_WEBHOOK_SECRET`.
- Segredos das Edge Functions: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_EMAIL_PIX` (no Supabase, nunca no repositório). Na Vercel (loja): `NEXT_PUBLIC_MP_PUBLIC_KEY`.
- Relate no formato do plugin, em português, citando `arquivo:linha`.

## Testes (para o `mp-test-setup`)

- Rodar a partir de `sistema/`: `pnpm test` (regras), `pnpm test:deno` (Edge Functions, inclui `pagamentos_test.ts` e `webhook_test.ts`) e `pnpm test:db` (pgTAP, `015_payments_test.sql`).
- Os testes usam `pagamentosFalso()`; não chame o Mercado Pago real em teste automatizado.
- Com credenciais de **Teste**: usar cartões de teste do Brasil (`/mp-test-cards`) e um usuário comprador de teste; conferir o Brick com a CSP atual (`style-src` só com nonce), que ainda não foi validada com o SDK real.

## Pendências da loja com o Mercado Pago

Ajude a fechar estas quando o assunto aparecer (detalhes em `docs/CONTEXTO.md`):

1. Credenciais de teste e de produção (E1); cadastrar `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `MP_EMAIL_PIX` no Supabase: sem eles, `api-public`, `api-admin`, `webhook-payments` e `worker` não iniciam.
2. Gravar `app_settings.mp_collector_id` com o id da conta recebedora.
3. Cadastrar o webhook (URL acima, só `payment`).
4. Confirmar com a conta real o prazo mínimo de 30 min do PIX (G14) e o formato das datas (E4).
5. Validar o Card Payment Brick com a chave pública de teste e `NEXT_PUBLIC_MP_PUBLIC_KEY` na Vercel.
6. Antes de abrir: um PIX real de valor baixo, pago e estornado (checklist do runbook).

## Limites

- Não mude as regras acima nem o contrato do `PaymentProvider` sem pedido explícito da loja; mudanças de regra entram também em `docs/CONTEXTO.md`.
- Não instale SDK nem dependência nova sem autorização.
- Credenciais nunca em código, commit, log ou mensagem; o hook do plugin bloqueia leitura de `.env`, e isso é esperado.
