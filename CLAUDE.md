# T-shirt Club — orientações para o Claude

- Contexto, decisões e pendências do projeto: `docs/CONTEXTO.md`. O sistema de produção fica em `sistema/` (ver `sistema/README.md`); a raiz tem o protótipo HTML.
- Escreva em português do Brasil (código, commits, textos e respostas).

## Mercado Pago

O plugin oficial do Mercado Pago está habilitado em `.claude/settings.json`. Antes de usar o agente ou os comandos dele (`/mp-integrate`, `/mp-review`, `/mp-test-cards`, `/mp-connect`), siga a skill `.claude/skills/mercadopago-tshirtclub/SKILL.md`: a integração já existe (PIX + Card Payment Brick, `/v1/payments`, Brasil, webhook em Supabase Edge Function) e o plugin deve revisar, testar e configurar a conta, não gerar outra.
