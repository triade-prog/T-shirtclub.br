---
name: frontend-design-tshirtclub
description: Especialista em frontend e design da loja e do painel do T-shirt Club (Next.js 16, Tailwind 4, packages/ui, V4 aprovada, CSP com nonce). Use sempre que a tarefa mexer em tela, componente, CSS, fontes, imagens, acessibilidade ou desempenho da loja (LCP, FCP, CLS, TBT, Lighthouse, PageSpeed, "a página está lenta", pré-carregamento, cache de página), mesmo que o pedido não fale em "frontend" ou "design": por exemplo "o Lighthouse reprovou", "melhorar o carregamento das fontes", "ajustar o cartão do produto", "criar a página /privacidade", "a loja pisca ao abrir".
---

# Frontend e design do T-shirt Club

Este projeto já tem desenho aprovado e regras fechadas. O trabalho aqui é mudar o necessário sem
mexer no que a loja aprovou, e provar com medição e teste que ficou melhor. A dona da loja lê as
respostas: explique em português do Brasil, sem jargão desnecessário, o que mudou e o que ela
precisa fazer.

## Antes de começar

Leia `docs/CONTEXTO.md` (decisões D1 a D29 e onde está cada coisa), `sistema/README.md` e, para
tela nova, a referência V4 em `docs/design/v4/` e o critério de pronto na seção 18 de
`docs/arquitetura-reservas.html`. Atualize `docs/painel-execucao.html` no mesmo commit da entrega,
seguindo o comentário do topo dele, e valide o JSON com `json.JSONDecoder().raw_decode`.

## O que não se negocia

- **Desenho aprovado (D24).** Fraunces nos títulos, Poppins no sistema, Baloo 2 nos momentos pop.
  Não mude o desenho da Fraunces (eixos `opsz` e peso, arquivos, métricas). Mudança de desempenho
  que "não muda o desenho" precisa ser provada pela comparação visual (`tests/e2e/__telas__`).
- **CSP com nonce por acesso (D29).** Nada de `unsafe-inline`, ISR ou cache de CDN no HTML. Página
  estática sai sem nonce e a CSP bloqueia os scripts: toda página da loja chama `connection()`.
  `style=""` é proibido; CSS vai em classe.
- **Loja só no tema claro (D21);** painel no estilo V4 (`apps/admin/src/app/painel-v4.css`).
- **Nunca desligar, pular ou afrouxar teste para passar,** nem trocar a régua de medição (config do
  Lighthouse, metas) para uma meta passar. Mudar a forma de medir é decisão da loja, com os números
  dos dois jeitos na mesa.
- **Acessibilidade:** alvos de 44 px (`tc-alvo`), foco visível, axe sem violação nas telas.

## Investigação de desempenho: com orçamento

A loja paga cada rodada de medição e pediu (27/09) que toda otimização de desempenho siga este
roteiro, parando assim que houver dados para decidir:

1. **Baseline:** registre os números de hoje. Reaproveite o que já existe antes de medir de novo
   (tabela abaixo e `docs/CONTEXTO.md`).
2. **Hipótese principal:** uma só, escrita antes de mexer. Descubra primeiro o elemento do LCP.
3. **Ganho mínimo:** diga antes quanto a mudança precisa ganhar para valer a pena (por exemplo,
   LCP −300 ms em HTTP/2 simulado sem piorar FCP ou CLS).
4. **No máximo 1 ou 2 experimentos** para confirmar ou derrubar a hipótese.
5. **Se não atingir o ganho mínimo, encerre:** registre a conclusão no CONTEXTO e no painel de
   execução, e não abra PR da mudança.
6. **Nada de infraestrutura nova** (scripts, proxies, variações) sem que seja necessária para a
   decisão. Use o que já existe:
   - `bash sistema/scripts/lighthouse-container.sh` (container do CI; `RODADAS=5` para comparar);
   - `HTTP2=1` mede como na Vercel (o `next start` só fala HTTP/1.1, 6 conexões, e distorce);
   - `ESTRANGULAMENTO=devtools` aplica rede lenta de verdade em vez da simulação;
   - para o "antes", um worktree limpo do commit base com os dois scripts copiados.

Como ler os números: a simulação (o modo do CI e do PageSpeed) soma tudo o que foi pedido antes
do LCP observado; no localhost ele sai em ~0,15 s, então só reduzir bytes pedidos cedo mexe nela.
O número que a loja vê é o do PageSpeed (simulado em HTTP/2): uma mudança que o piora não passa.
Mostre sempre uma tabela com modo, protocolo, mediana e cada execução, e diga o que não melhorou.

Baseline de 27/09/2026 (página inicial sem catálogo; o LCP é o título "3 escolhas. / Seu Club."):

| Modo | LCP | FCP |
|---|---|---|
| HTTP/1.1, simulado (o CI) | 3,49 s | 1,08 s |
| HTTP/2, simulado (como o PageSpeed na Vercel) | 2,86 s | 1,06 s |
| HTTP/2, rede lenta real | 2,15 s | 2,15 s |

## Fontes: investigação encerrada

Não reabra sem fato novo (catálogo e fotos reais, medição de produção). O que já se sabe:
- O `next/font` pré-carrega por família inteira (188 KB na loja) e não permite escolher arquivo;
  dividir uma família em duas chamadas quebra o casamento de estilo e peso do CSS.
- Pré-carregar só o topo exigiria servir as fontes de `public/` e, medido em HTTP/2, não
  compensou: LCP simulado 2,86 → 2,88 s, FCP simulado 1,06 → 1,52 s (pior), LCP com rede real
  2,15 → 1,94 s. Os números e a conclusão estão no CONTEXTO.
- Se um dia for preciso: `preload()` do `react-dom` só vira cabeçalho `Link` se for chamado antes
  de qualquer `await`, e o `not-found.tsx` da raiz é montado em todo pedido (pré-carga ali vale
  para todas as páginas).

## Telas

- Componentes compartilhados ficam em `packages/ui` (tokens em `tema.css`, Tailwind 4 `@theme`).
  Prefira compor com `Selo`, `Sobretitulo`, `ProgressoClub`, `CardProduto`, `Botao` e `Campo`.
- Tela nova segue a V4; o que a V4 não mostra segue o protótipo (`NN-*.html` na raiz) no estilo
  V4. Textos em português, sem "Club.br" nas mensagens de WhatsApp (vira link).
- Imagens pelo `next/image`, com `priority` só no que está no topo.

## Validação antes de cada push

O CI do GitHub não roda (conta bloqueada por cobrança), então tudo passa aqui, dentro de
`sistema/`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:deno`,
`bash scripts/test-db.sh` e `bash scripts/e2e-container.sh` (Docker ligado: `dockerd &`). As telas
de referência só batem no container; regere com `--update-snapshots=all` apenas quando a mudança
visual for intencional e aprovada.

Um PR por assunto; merge só quando a loja disser "faz o merge e publica".
