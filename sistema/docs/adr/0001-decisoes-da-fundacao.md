# ADR 0001 · Decisões técnicas da fundação (F1)

Data: 25/09/2026 · Situação: aceita

1. **Pasta `sistema/` com pnpm workspaces.** O repositório guarda também o protótipo e a
   documentação (D2); o sistema fica separado. CI e Dependabot apontam para `sistema/`.

2. **Versões.** Next.js 16 (App Router, `proxy.ts` no lugar do middleware), React 19,
   Tailwind 4, Vitest 5, Zod 4. TypeScript fixado na linha 6 e ESLint na 9, porque o
   typescript-eslint ainda não suporta o TypeScript 7 e o plugin de React ainda não suporta
   o ESLint 10. Revisar quando o Dependabot trouxer suporte.

3. **Tokens como `@theme` do Tailwind 4.** No Tailwind 4 o "preset" é uma folha de estilo:
   `packages/ui/src/tema.css` declara os tokens em variáveis CSS e os expõe como utilitários
   (`bg-rosa`, `text-tinta`…). A loja só tem o tema claro; o painel ganha o escuro com
   `data-app="painel"` (D21).

4. **CSP com nonce exige renderização dinâmica.** Cada página recebe um nonce novo no `proxy`.
   Por isso as páginas renderizam por requisição (`connection()`). Na F2, quando o catálogo
   precisar da CDN, avaliar o SRI experimental do Next (hash em vez de nonce) só nas páginas
   públicas de catálogo.

5. **`style-src-attr 'unsafe-inline'`.** O `next/image` e as cores de coleção usam o atributo
   `style`. Atributos de estilo não executam código; `<style>` e scripts seguem presos ao
   nonce. Foi a única flexibilização da CSP.

6. **Domínio compartilhado entre Node e Deno (G22).** `packages/domain` só importa com caminho
   relativo e extensão `.ts`; a única dependência é o Zod, resolvida no Node pelo
   package.json e no Deno pelo `deno.json` (`npm:zod`). As Edge Functions importam o pacote
   por `@tshirtclub/domain` mapeado no `supabase/functions/deno.json`. `pnpm test:deno`
   prova o import. Risco: o empacotamento do `supabase functions deploy` precisa incluir
   arquivos fora de `supabase/functions`; conferir no primeiro deploy (F1.4) e, se falhar,
   copiar o pacote para `_shared` num passo de build.

7. **Relógio da aplicação.** `app_now()` soma o deslocamento da tabela `app_clock`, que só pode
   mudar fora de produção (`set_app_clock`). Assim os testes cobrem 14min59s e 20min01s sem
   depender de `now()` fixo (G18).

8. **Contexto da transição.** O gatilho guardião só aceita mudança de estado quando a função
   de domínio informou evento e ator (`set_transition_context`) na mesma transação. `UPDATE`
   direto na reserva é recusado, mesmo para quem tem acesso ao banco.

9. **RLS e privilégios.** O 0200 liga o RLS em todas as tabelas, tira todos os privilégios de
   `anon` e `authenticated` (inclusive os padrão para tabelas e funções futuras) e dá o
   EXECUTE só ao `service_role`. O teste `004_rls` falha se alguma tabela nova vier sem RLS.

10. **Ordem das migrations.** Os arquivos seguem a numeração do desenho técnico (0001…0300).
    Migrations de fases seguintes com número menor que o último aplicado (ex.: 0010 depois do
    0200) exigem `supabase db push --include-all` no projeto de desenvolvimento. O CI sempre
    aplica tudo do zero, em ordem.

11. **Comparação visual no container do Playwright.** Fontes e Chromium mudam de uma máquina
    para outra; por isso as imagens de referência são geradas no mesmo container do CI
    (workflow "Atualizar telas de referência"), com tolerância de 0,1% dos pixels.
