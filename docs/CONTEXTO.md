# Contexto do projeto — Sistema de Reserva T-shirt Club

Resumo para quem continuar o trabalho (pessoa ou nova sessão do Claude). Atualizado em 25/09/2026, depois da revisão geral.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Especificação funcional (atualizada com as decisões) | `especificacao_funcional_sistema_reserva.html` |
| Desenho técnico, versão 14 | `docs/arquitetura-reservas.html` |
| Relatório da revisão geral (achados G1 a G24) | `docs/REVISAO-GERAL.md` |
| Painel de execução (fases, entregas, testes, publicação, dependências) | `docs/painel-execucao.html` |
| Design do frontend (identidade, design system, telas finais, textos) | `docs/design-frontend.html` |
| Protótipo navegável (23 páginas: 00 a 22) | raiz do repositório, começar por `00-mapa.html` |
| Estilos e scripts do protótipo | `assets/css/`, `assets/js/` (um script por tela em `assets/js/paginas/`) |

O protótipo **não é código de produção**: serve para validar fluxo, telas e regras.

## Decisões fechadas

- **Stack:** Supabase (projeto novo) + Next.js (React), mobile-first e PWA, na Vercel. Lógica crítica (estoque, transições, idempotência) em funções do PostgreSQL.
- **Repositório:** este (`triade-prog/T-shirtclub.br`), com o sistema numa pasta separada do protótipo.
- **Domínio:** `tshirtclub.pt`. **Volume:** menos de 50 pessoas simultâneas em lançamentos.
- **Pagamento:** Mercado Pago; PIX **ou** cartão, fixo na primeira cobrança da reserva. No celular, "Copiar código PIX" é a ação principal.
- **Tolerância:** 15 + 5 min fixos; tentativa real = cobrança criada no provedor; sem pagamento novo após o minuto 15.
- **Pagamento tardio:** vai para análise; o admin estorna ou converte em novo pedido. Reserva expirada nunca é reativada.
- **Cancelamento aprovado:** termina em EXPIRADO com motivo "cancelamento aprovado" e não conta para o bloqueio de 3 expirações.
- **Frete:** calculado manualmente pelo admin; 2 h para pagar; vencido gera só alerta no painel.
- **Produtos:** tamanho único, preço fixo. Promoções em 3 formatos (desconto do produto, compre e economize mais, cupom); **vale só a mais vantajosa**. Cupom é digitado na reserva.
- **WhatsApp:** Z-API (não oficial) no número principal 77 99815-5772, nome "T-shirt Club"; risco de banimento aceito. **Verificação invertida:** a cliente envia "Quero meu código da reserva (ref. XXXX)" pelo próprio WhatsApp e recebe o código. 5 notificações essenciais sempre ligadas; as demais com liga/desliga.
- **Link da reserva:** chave aleatória no fragmento (`tshirtclub.pt/r#chave`), só o hash no banco, mostra só aquela reserva, com telefone e endereço mascarados. Acompanhar, pagar e pedir cancelamento; confirmar ou mudar a entrega pede o código do WhatsApp (D13).
- **Admin:** 1 administrador, e-mail, senha e autenticador (TOTP) obrigatório (D12), bloqueio de 15 min após 5 senhas erradas, contado por e-mail + rede.
- **WhatsApp em lançamentos:** modo lançamento aprovado (D14), ligado pela loja no painel.
- **Endereço de entrega:** guardado por 90 dias após a entrega (D15).
- **Sessão:** o navegador só chama o próprio domínio (`/api`, repasse no Next.js), para o cookie funcionar no iPhone (G1).
- **Publicação:** Supabase Pro (`sa-east-1`) e Vercel Pro (`gru1`); checklist na seção 17 do desenho técnico.
- **Frontend e design (D16):** frente de design D1 a D6 antes e junto da F1; o Claude cria e a loja aprova. Marca oficial T-shirt Club.br (D17): paleta da prancha 2, Baloo 2 + Poppins; rosa e verde como tempero e cores de coleção (D18); descoberta editorial antes da reserva e loja pública só no tema claro (D21); referências em `docs/design/marca/`. `packages/ui` com os tokens, critério de pronto de cada tela na seção 18 do desenho técnico.
- **LGPD:** aviso no formulário e política em texto-modelo (`20-privacidade.html`), dados da empresa entre colchetes.

## Situação

A revisão geral pedida pela loja (segurança, web e celular, testes e publicação, acessibilidade e textos) foi feita em 25/09/2026. O relatório está em `docs/REVISAO-GERAL.md`, e as correções foram aplicadas no desenho técnico (v8), na especificação e no protótipo. Os plugins Security Guidance, Modern Web Guidance, Engineering e Design não estavam ativos na sessão; a revisão cobriu as mesmas frentes manualmente.

As decisões da loja sobre a revisão (D12 a D15) foram registradas no desenho técnico (v9), na especificação e no protótipo. A situação de cada achado está no fim de `docs/REVISAO-GERAL.md`.

**Painel de execução:** `docs/painel-execucao.html` acompanha tudo o que a arquitetura planejou. Os dados ficam num bloco JSON no início do arquivo. A cada entrega, no mesmo commit: mudar o status do item (com evidência quando "feito"), atualizar `meta` e acrescentar uma linha no histórico.

**Design:** proposta 4 (`docs/design-frontend.html`), aguardando aprovação. Ela separa "vender desejo" de "processar a venda". A descoberta é nova e editorial, com cerca de 80% de foto e produto: início com campanha, coleção, página de produto com galeria e sacola "Monte seu Club". O fluxo de reserva da proposta 3 foi mantido. Baloo 2 aparece só em títulos de marca e há poucos stickers. A loja pública tem só o tema claro. Coleções reais: Pomodoro, Limone, Dolce Vita, La Vie Est Belle, Teddy e Dog Club. A cor de cada coleção é escolhida no painel entre 5 aprovadas: Tomate, Limão, Mediterrâneo, Lavanda e Menta. As fotos entram sozinhas no documento quando forem colocadas em `docs/design/fotos/` (lista de nomes na seção "Fotos").

**Oferta (D19):** "Monte seu Club". Cada peça custa R$ 49,99 e cada grupo de 3 sai por R$ 119,99; as que sobram pagam o preço normal (4 peças = R$ 169,98; 6 = R$ 239,98). No motor de preço, é compre e economize mais no modo preço por grupo. Já estão atualizados a especificação (regras 3 e 28), o desenho técnico (seção 5b) e o protótipo (motor, loja e telas 14 e 16).

**Catálogo (D20):** cada produto tem página própria e de 1 a 10 fotos (tipo e texto alternativo obrigatório), além de looks e blocos da página inicial configuráveis. Está na especificação (regra 30), no desenho técnico (tabelas e API) e no protótipo (tela 10).

**Fotos (25/09):** as 42 fotos de produto foram lidas pelo conector do Google Drive (a rede do ambiente bloqueia o Drive direto) e convertidas para WebP em `docs/design/fotos/produtos/` (4:5, cerca de 35 KB cada). Os recortes de estampa viraram capas de coleção, e a primeira dobra usa uma campanha provisória montada com as fotos de produto. A seção "Catálogo real" do design lista as peças com nome e coleção sugeridos: Limone, Dolce Vita, Teddy, Dog Club, Just a Girl, Um Dia de Cada Vez e Outras. A pasta do site de referência trouxe só apps de terceiros: pacotes, lista de desejos, aviso de volta ao estoque, avaliações, recomendações, e-mail, chat e contador.

**Referência (25/09):** o HTML da página inicial da Coucou Suzette foi lido; os estilos e as fotos não vieram. O que ele mostra:
- **Cores:** fundo creme #FFFBF0, texto bordô #420002, títulos e botões em #FF3D00, e faixas de cor inteiras (rosa, verde, amarelo, laranja) coladas umas nas outras.
- **Fontes e formas:** títulos em Hammer 900 e texto em Lora serifada; botões de 4 px, card de 8 px e fotos sem canto arredondado.
- **Menu:** Produtos, A marca e The Club (fidelidade); coleções com emoji no nome.

Já entrou na proposta 4: barra de oferta, abas de favoritos, emoji nas coleções, adicionar no card, faixas de cor, bloco "Quem faz o Club" e garantias. Ficam para a loja decidir: botões menos arredondados, texto em serifada, grupo VIP no WhatsApp e programa de fidelidade.

Pendências da loja: fotos com modelo, costas e looks; confirmar nomes e coleções das 42 peças; decidir os pontos da referência; dados das peças (composição, medidas, cuidados), logo em SVG, endereço do site (.pt ou .com.br) e liberar coucousuzette.com. A F2 só começa com D1 e D2 aprovados.

**F1 (Fundação): liberada pela loja em 25/09, junto com o logo oficial, e implementada em `sistema/`** (ver `sistema/README.md` e `sistema/docs/adr/0001-decisoes-da-fundacao.md`):
- **Estrutura:** monorepo pnpm com `apps/web` (loja), `apps/admin` (painel), `packages/domain`, `packages/ui`, `packages/servidor` e `supabase/`.
- **Stack:** Next.js 16 (middleware agora é `proxy.ts`), Tailwind 4 (tokens como `@theme`), TypeScript 6 e ESLint 9 (por compatibilidade das ferramentas).
- **Banco:** migrations 0001–0003, 0080, 0100 e 0200 (configurações, `app_now()`, limites, auditoria somente de inserção, gatilho guardião, RLS fechado), com 46 testes pgTAP.
- **Domínio e segurança:** `domain` com 39 testes, que roda no Node e no Deno; repasse `/api` com cookies `__Host-` e CSP com nonce, com 16 testes.
- **Telas e medições:** 18 testes ponta a ponta no celular (axe e comparação visual); Lighthouse no celular com desempenho 98 e acessibilidade 100.
- **Logo:** aplicado sem fundo, com favicon e ícones do app.

Pendências da F1:
- **F1.4 (conta da loja):** criar o projeto Supabase em sa-east-1 e o projeto Vercel na região gru1.
- **CI no GitHub:** a conta triade-prog está travada por cobrança ("account is locked due to a billing issue"); mesmo depois do pagamento, os jobs não iniciam. Depende do suporte do GitHub.
- **Referências visuais:** gerar no container do CI (workflow "Atualizar telas de referência").

**F2, parte sem telas (liberada em 26/09 enquanto o design é revisado):**
- **Banco:** 0010 (coleções, produtos, fotos de 1 a 10, looks, blocos da página inicial, movimentos de estoque, view de disponibilidade), 0015 (promoções nos 3 formatos, níveis, cupons e usos; um produto nunca em dois descontos ao mesmo tempo), 0090 (administradores e bloqueio do login por e-mail + IP) e 0180 (ajuste de estoque com lock e motivo). 102 testes pgTAP.
- **Motor de preço** em `packages/domain/src/preco.ts`: só a mais vantajosa, Monte seu Club a cada 3, níveis, cupom com os motivos de recusa e preço promocional da vitrine. Descontos do produto ativos valem juntos como preço promocional (D22).
- **Login do painel** na `api-admin`: senha de 12+, autenticador obrigatório (aal2), 5 erros bloqueiam a rede por 15 min, Turnstile a partir do 3º erro, cookie `__Host-painel`. O aviso de bloqueio por e-mail fica no log até escolhermos o provedor de e-mail.
- **Correção:** o script `pnpm build` da raiz não rodava (o shell expandia o filtro); o CI falharia nesse passo.

**Rotas do catálogo (26/09, antes das telas):** a `api-public` serve página inicial, coleções, produtos, página do produto, looks e a cotação da sacola (`POST /v1/cart/quote`), com o preço promocional e o Monte seu Club calculados pelo motor. A `api-admin` cadastra coleções, produtos, fotos (envio direto ao Storage por URL assinada, só WebP), looks, a ordem da página inicial e as promoções. Funções SQL em 0185 e 0190; 140 testes pgTAP, 38 Deno e 110 de regras.

**F3 e F4 no servidor (26/09, antes das telas):**
- **Código pelo WhatsApp (F3):** a loja cria a tentativa com a referência curta e o cookie `__Host-tentativa`; a cliente manda "Quero meu código (ref. K7Q2)"; o `webhook-whatsapp` confere o remetente (com e sem o nono dígito), descarta mensagens da loja, de grupos, antigas e repetidas, e responde com o código. HMAC com o pepper na Edge Function (o banco só vê o hash). 5 min, 2 tentativas, 2 reenvios e bloqueio de 30 min. Fila (`worker`) com prioridade, validade e modo lançamento. Z-API atrás de uma interface, com versão falsa para testes; remetente LID fica sem resposta até conferirmos com a conta (E3).
- **Reserva (F4):** `create_reservation` trava cliente, produtos (em ordem de id) e promoção/cupom; nada parcial; chave do link só em hash. Teste de concorrência no `test-db.sh` e no CI: 50 clientes pela última unidade → 1 reserva. Teste de integração passa pelo fluxo inteiro com o banco de verdade.
- Números: 117 testes de regras, 48 Deno, 199 pgTAP, concorrência e integração.

As telas (F2.5 a F2.10, F3.6, F3.8, F4.3, F4.5) esperam a aprovação do design (D1 e D2); quando vierem, só se ligam a essas rotas. 

**F5 no servidor (26/09):** a varredura roda a cada 10 s no banco (pg_cron): lembrete de 5 min (só se ainda falta mais de 1 min), expiração que devolve estoque, cupom e orçamento, e bloqueio do telefone na 3ª expiração em 30 dias (liberar ou manter no painel, com motivo; liberar zera o contador). A reserva vencida é liberada na hora em que outra cliente precisa da peça. O worker da fila só é chamado quando há mensagem. Tolerância e rede de segurança já estão na varredura e passam a valer com os pagamentos (F6). Teste de vazão: 50 reservas em 5 min, toda "reserva criada" sai em até 2 min. Correção de segurança: funções novas também ficam fechadas para anon.

**F6 no servidor (26/09):** pagamento pelo Mercado Pago atrás do `PaymentProvider` (e uma versão falsa para testes). PIX nasce com 30 min e é cancelado no fim da tolerância; cartão em `binary_mode` (aprova ou recusa na hora), só à vista, recebendo só o token. Idempotência em 5 camadas (Idempotency-Key, chave no provedor, inbox do webhook, `applied` e a constraint final). O webhook confere o x-signature e a janela de 5 min, grava na inbox e responde 200; o worker consulta o provedor e aplica. Referência, moeda ou conta diferentes: descartado. Valor diferente, reserva encerrada ou aprovado depois da tolerância: análise, onde a loja estorna ou converte em pedido novo. Estorno ou contestação depois de pago: disputa, que vai travar o Entregue na F8. Decisão D23: a mensagem "pagamento confirmado" leva o endereço do site, não o link com a chave; cartão só à vista. 273 testes de banco, 58 Deno, 118 de regras e dois testes de integração (fluxo da reserva e pagamento).

O próximo servidor é a F7 (cancelamento), que precisa de liberação. Com o Mercado Pago real (E1), confirmar o PIX de 30 min e o formato das datas (E4).

## Dados que ainda faltam (não bloqueiam a revisão)

- Credenciais de teste do Mercado Pago.
- Conta na Z-API com o número conectado.
- Dados da empresa para a política de privacidade (razão social, CNPJ, endereço, e-mail e nome do encarregado).
- Endereço e horário de retirada na loja.
- Conferir com as contas reais: remetente LID na Z-API (G4) e prazo mínimo de 30 min do PIX no Mercado Pago (G14).
