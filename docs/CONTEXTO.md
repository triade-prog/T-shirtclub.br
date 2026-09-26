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

**F7 no servidor (26/09):** a cliente pede o cancelamento na reserva (só enquanto está reservada, um pedido por vez) e a loja aprova ou recusa no painel, sempre com motivo. O prazo continua correndo. Aprovado: a reserva é encerrada com motivo "cancelamento aprovado", as peças voltam, não conta para o bloqueio e um PIX em aberto é cancelado no Mercado Pago. Recusado: a reserva segue valendo até o horário original. Se ela expira ou é paga antes da decisão, o pedido fica prejudicado. A cliente recebe no WhatsApp "pedido recebido", "aprovado" ou "recusado". 293 testes de banco, 59 Deno, 120 de regras e três testes de integração (fluxo da reserva, pagamento e cancelamento).

**F8 no servidor (26/09):** depois do pagamento, o pedido ganha a entrega na modalidade escolhida na reserva e um código de retirada aleatório (6 letras e números, nunca o número do pedido). A cliente confirma ou troca a modalidade no site (retirada, motoboy ou envio, com endereço) até pagar o frete ou confirmar a retirada; pelo link encaminhado, precisa do código do WhatsApp antes. A loja informa o frete no painel (valor, prazo e observação) e a cliente tem 2 h para pagar, pela mesma forma dos produtos. Frete não pago em 2 h: o pedido continua pago e fica em "prazo vencido" no painel, para a loja recalcular ou combinar. Depois: em preparação, pronto para retirada / saiu para entrega / enviado (com rastreio) e Entregue, que é recusado enquanto houver estorno ou contestação aberta. A cliente recebe no WhatsApp o valor do frete, a confirmação do frete pago, o aviso de pronto (com o código e o endereço da loja), saiu, enviado e entregue. 339 testes de banco, 60 Deno, 122 de regras e quatro testes de integração (reserva, pagamento, cancelamento e entrega).

Falta da loja para a F8: o endereço e o horário de retirada (E7), que entram na mensagem de pronto para retirada.

**F9 no servidor (26/09):** a cliente acha as reservas dela de três jeitos. Pelo site: informa o WhatsApp, manda a mensagem pronta ("Quero consultar minhas reservas") e digita o código; aí vê a lista das reservas daquele número, e só dele. Pelo link da mensagem: abre só aquela reserva, com o telefone mascarado; dá para acompanhar, pagar e pedir cancelamento, mas para confirmar ou mudar a entrega o site pede um código pelo WhatsApp antes ("Quero confirmar a entrega do pedido"). Passados 30 dias do fim, o link mostra só número e estado. Pelo WhatsApp: "Minha reserva" (ou "status") recebe na hora a lista das reservas abertas, com prazo ou andamento, aceitando o número com ou sem o nono dígito. 369 testes de banco, 62 Deno, 124 de regras e cinco testes de integração (reserva, pagamento, cancelamento, entrega e consulta).

**F10 no servidor (26/09):** o painel ganhou tudo o que falta para operar um lançamento. O dashboard mostra as reservas ativas, pagas, expiradas e entregues do dia e o que pede ação (cancelamentos, pagamentos em análise, disputas, telefones bloqueados, fretes para calcular, perto de vencer ou vencidos, e a fila do WhatsApp). A busca acha a reserva pelo número, por parte do telefone ou pelo nome, e o detalhe mostra a linha do tempo, os pagamentos, a entrega com endereço, os cancelamentos, o histórico da cliente e a auditoria. A auditoria tem filtros por autor, assunto e período. Na tela do WhatsApp: conexão com o QR code para reconectar, números da fila, ritmo normal e de lançamento, liga e desliga de cada notificação (as essenciais não desligam) e mensagem de teste. Em Minha conta: trocar a senha (confere a atual, desconecta os outros aparelhos e avisa por e-mail), ver os aparelhos conectados e gerenciar os autenticadores (para remover um, é preciso o código de outro). 409 testes de banco, 67 Deno, 125 de regras e cinco testes de integração.

Para publicar (F10): ligar no Supabase Auth a proteção contra senhas vazadas e o aviso de troca de senha por e-mail, junto com o SMTP do projeto.

**F11 (26/09):** o sistema foi posto à prova e ganhou o que falta para operar. Teste de carga com 100 clientes ao mesmo tempo, 40 delas disputando as 10 últimas peças: exatamente 10 reservadas, nada vendido a mais e nenhum erro. Todo dia de madrugada o sistema confere o estoque contra as reservas (divergência vira alerta no painel) e apaga o que passou do prazo de guarda (códigos, sessões e IPs em 30 dias; mensagens recebidas em 90; endereço 90 dias depois da entrega vira só a cidade). Alertas no painel para job atrasado, fila do WhatsApp parada e avisos do Mercado Pago sem processar; um endereço de saúde para um monitor de fora avisar por e-mail; erros inesperados registrados sem dados pessoais (e no Sentry, se configurado). O teste do banco agora restaura uma cópia num banco vazio e confere tudo. O runbook (sistema/docs/runbook.md) diz o que fazer em cada problema. Na loja: funciona sem conexão (mostra uma página avisando), guarda só a parte fixa do app e as imagens, e ensina a instalar no iPhone. 442 testes de banco, 70 Deno, 129 de regras, seis testes de integração (com a carga) e 24 de telas.

Falta para a F11 fechar de vez: rodar o roteiro k6 e ensaiar a restauração com o backup real, quando existir o projeto no Supabase (F1.4). A decidir com a loja: anonimização depois de 5 anos e exclusão a pedido da titular pelo painel (o prazo fiscal precisa ser confirmado com a contabilidade).

**Revisão do servidor (26/09):** revisão de segurança e de código antes das telas. Nenhum problema alto ou médio de segurança. Dois defeitos que só apareceriam pelo site foram corrigidos: o repasse `/api` não deixava passar o cookie da consulta nem o `Idempotency-Key` (consulta com código, entrega pelo link e pagamentos falhariam). Os nomes dos cookies e as opções de cada repasse ficam num lugar só, e o teste de integração da consulta passa pelo repasse de verdade. "Minha reserva" agora responde no número guardado na reserva, nunca no remetente. Desenho técnico v25.

**Design aprovado (26/09, D24):** a loja mandou a V4 tipografia (início, coleção, produto e sacola, em `docs/design/v4/`) como o design de todo o sistema, com o logo oficial e o monograma TC. D1 e D2 estão feitos: `packages/ui` tem a paleta nova com contrastes medidos, Fraunces + Poppins + Baloo 2, o estilo adesivo e os componentes Selo, Sobretítulo e ProgressoClub; cabeçalho, rodapé, painel e ícones já seguem a V4. As telas podem começar.

**Telas da F2, em fatias (26/09):** fatia 1 pronta, o início editorial com os blocos do painel e o cartão de produto, gerado no servidor (`apps/web/src/lib/catalogo.ts` lê a api-public com o segredo de repasse). Fatia 2 pronta: `/colecao/[slug]` (filtro Todas, Disponíveis e Últimas peças por link) e `/produto/[slug]` (galeria de arrastar com miniaturas, preço com a oferta do Club, detalhes e looks); o botão "Adicionar ao Club" envia `GET /sacola?adicionar=<slug>`, que a fatia 3 vai tratar. Conferida com a V4 (26/09): o que faltava foi incluído (voltar, favoritar no navegador, adicionar rápido no cartão, faixa "The edit" e nota editorial); busca e favoritos no cabeçalho esperam páginas próprias. Fatia 3 pronta: `/sacola` gerada no servidor, com a sacola num cookie só da loja (`__Host-sacola`, em `lib/sacola.ts`; o desenho previa localStorage, trocado para funcionar sem JavaScript e sem piscar), "Adicionar" por `GET /sacola?adicionar=` tratado no `proxy.ts`, "Remover" por ação do servidor, preço e desconto pela cotação `POST /v1/cart/quote` e o número de peças no cabeçalho. "Reservar minhas peças" leva a `/reserva`. Próxima: reserva (seus dados e código do WhatsApp).

Com a F11, todas as fases de servidor do plano estão feitas. O que falta para abrir a loja: as telas (design aprovado em 26/09, D24), o CI rodando (F1.2), as contas (Supabase, Vercel, Z-API, Mercado Pago), os dados da loja (produtos, domínio, endereço de retirada) e o checklist de publicação. Com o Mercado Pago real (E1), confirmar o PIX de 30 min e o formato das datas (E4).

## Dados que ainda faltam (não bloqueiam a revisão)

- Credenciais de teste do Mercado Pago.
- Conta na Z-API com o número conectado.
- Dados da empresa para a política de privacidade (razão social, CNPJ, endereço, e-mail e nome do encarregado).
- Endereço e horário de retirada na loja.
- Conferir com as contas reais: remetente LID na Z-API (G4) e prazo mínimo de 30 min do PIX no Mercado Pago (G14).
