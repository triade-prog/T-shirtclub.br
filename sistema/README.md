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
tests/e2e       Playwright no celular: segurança, axe e comparação visual
scripts/        banco de teste, Deno, marca, subir os apps
docs/adr/       decisões técnicas da implementação
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
pnpm test:db                               # migrations + pgTAP num Postgres temporário
pnpm build && bash scripts/subir-apps.sh   # apps em modo produção (3000 e 3001)
pnpm e2e                                   # Playwright (use PW_CHROMIUM_PATH para outro Chromium)
npx lhci autorun --config=lighthouserc.cjs # metas de desempenho no celular
bash scripts/subir-apps.sh parar
```

As imagens de referência da comparação visual são geradas no container do CI: depois de
mudar um componente de propósito, rode o workflow **Atualizar telas de referência**.

## Variáveis

Ver [`.env.example`](.env.example). Nas Edge Functions: `REPASSE_SEGREDO` (o mesmo valor dos apps)
e `TURNSTILE_SECRET`; `SUPABASE_URL` e as chaves o Supabase já entrega.

## Primeiro administrador do painel

1. No painel do Supabase, em Authentication, crie o usuário com e-mail e senha de 12+ caracteres
   (o cadastro público fica desligado).
2. No SQL Editor: `insert into admin_users (id, name) values ('<id do usuário>', 'Loja');`
3. No primeiro login, o painel pede para cadastrar o aplicativo autenticador (QR code). Cadastre
   também um segundo aparelho, de reserva, em Minha conta.
