# Sistema T-shirt Club.br

Loja com reserva por WhatsApp e painel da loja. Desenho completo em
[`docs/arquitetura-reservas.html`](../docs/arquitetura-reservas.html); acompanhamento em
[`docs/painel-execucao.html`](../docs/painel-execucao.html). O protótipo HTML (na raiz do
repositório) continua valendo para fluxo e regras.

## Estrutura

```
apps/web        loja (Next.js 16, mobile-first, só tema claro)
apps/admin      painel da loja (Next.js 16, claro e escuro)
packages/domain regras puras em TypeScript: carrinho, telefone E.164, erros, textos, schemas Zod
                (roda no Node e no Deno)
packages/ui     design system: tokens (tema.css, Tailwind v4) e componentes React
packages/servidor  cabeçalhos de segurança, CSP com nonce e o repasse /api
supabase/       migrations, Edge Functions (Deno + Hono) e testes pgTAP
tests/e2e       Playwright no celular: segurança, axe, comparação visual e PWA
tests/carga     roteiro k6 do lançamento (ambiente de teste)
scripts/        banco de teste, Deno, marca, subir os apps
docs/adr/       decisões técnicas da implementação
docs/runbook.md o que fazer quando algo sai do normal (WhatsApp, Mercado Pago, backup, incidente)
```

## Rodar

Requisitos: Node 22, pnpm 10, PostgreSQL 16 com pgTAP (`postgresql-16-pgtap`).

```bash
pnpm install
cp .env.example apps/web/.env.local   # e apps/admin/.env.local
pnpm dev:web          # loja em http://localhost:3000
pnpm dev:admin        # painel em http://localhost:3001
```

## Verificar (o mesmo que o CI faz)

```bash
pnpm lint && pnpm typecheck && pnpm test   # ESLint, TypeScript e Vitest
pnpm test:deno                             # Edge Functions no Deno
pnpm test:db                               # migrations, pgTAP, concorrência e integração num Postgres temporário
pnpm build && bash scripts/subir-apps.sh   # apps em modo produção (3000 e 3001)
pnpm e2e                                   # Playwright (use PW_CHROMIUM_PATH para outro Chromium)
npx lhci autorun --config=lighthouserc.cjs # metas de desempenho no celular
bash scripts/subir-apps.sh parar
```

As imagens de referência da comparação visual são geradas no container do CI: depois de
mudar um componente de propósito, rode o workflow **Atualizar telas de referência**.

## Variáveis

Ver [`.env.example`](.env.example). Nas Edge Functions (`supabase secrets set`): `REPASSE_SEGREDO`
(o mesmo valor dos apps), `TURNSTILE_SECRET`, `OTP_PEPPER` e `WEBHOOK_WHATSAPP_SEGREDO` (32+
caracteres, `openssl rand -base64 48`), `WORKER_SEGREDO`, `IP_SAL`, `ZAPI_INSTANCIA`, `ZAPI_TOKEN`,
`ZAPI_CLIENT_TOKEN`, `LOJA_WHATSAPP`, `LOJA_URL`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `MP_EMAIL_PIX`. `SUPABASE_URL` e as chaves o Supabase já entrega.
Opcionais, nas funções e nos apps: `SENTRY_DSN` (erros, sem dados pessoais) e `AMBIENTE` (`producao`
ou `teste`).
O webhook da Z-API aponta para `…/functions/v1/webhook-whatsapp/<WEBHOOK_WHATSAPP_SEGREDO>`; o do
Mercado Pago (só o tópico payment), para `…/functions/v1/webhook-payments`. A conta recebedora vai em
`app_settings.mp_collector_id`: pagamento de outra conta nunca é aplicado.

Para a varredura chamar o worker (0300), no SQL Editor do projeto:

```sql
update app_settings set value = '"https://<projeto>.supabase.co/functions/v1/worker"' where key = 'worker_url';
select vault.create_secret('<WORKER_SEGREDO>', 'worker_segredo');
```

## Primeiro administrador do painel

1. No painel do Supabase, em Authentication, crie o usuário com e-mail e senha de 12+ caracteres
   (o cadastro público fica desligado).
2. No SQL Editor: `insert into admin_users (id, name) values ('<id do usuário>', 'Loja');`
3. No primeiro login, o painel pede para cadastrar o aplicativo autenticador (QR code). Cadastre
   também um segundo aparelho, de reserva, em Minha conta.

## Monitoramento

Cadastre num monitor de disponibilidade (Better Stack, UptimeRobot ou similar) a URL
`https://<projeto>.supabase.co/functions/v1/worker/saude`, a cada 5 min, com aviso por e-mail quando
responder diferente de 200. O resto está no [runbook](docs/runbook.md).
