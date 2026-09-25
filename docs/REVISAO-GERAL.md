# Revisão geral antes da F1: Sistema de Reserva T-shirt Club

Data: 25/09/2026 · Escopo: desenho técnico (`docs/arquitetura-reservas.html`), especificação funcional (`especificacao_funcional_sistema_reserva.html`) e as 23 telas do protótipo (00 a 22).

## Como a revisão foi feita

- **Plugins:** Security Guidance, Modern Web Guidance, Engineering e Design estão no catálogo da conta, mas **nenhum estava ativo nesta sessão**. Para que eles entrem numa próxima revisão, ative-os no claude.ai (Configurações › Plugins). Esta revisão cobriu manualmente as mesmas quatro frentes: segurança, boas práticas web e desempenho, engenharia (testes e publicação) e design (acessibilidade e textos).
- **Verificação automática das telas:** as 23 telas foram abertas num celular simulado (390 px), com checagem de acessibilidade (axe, WCAG 2.2 AA), rolagem lateral, tamanho dos alvos de toque e erros de JavaScript, antes e depois das correções.
- **Resultado depois das correções:** nenhuma violação do axe em nenhuma tela. Nenhuma tela rola para o lado. Não houve erro de JavaScript. Os 5 diagramas do desenho técnico foram conferidos e compilam.

Os achados usam os códigos G1 a G24, os mesmos da seção 1b do desenho técnico, que agora está na **versão 8**.

---

## Crítico

### G1. O cookie de sessão da cliente não funcionaria no iPhone
A loja fica em `tshirtclub.pt` e a API no domínio do Supabase. O cookie gravado pela API seria de terceiros, e o Safari bloqueia esse tipo de cookie. A reserva ativa, o pagamento e o link da reserva quebrariam no celular, que é onde está a maior parte das clientes.
**Correção:** o navegador só fala com o próprio domínio (`tshirtclub.pt/api/...`), e um repasse no Next.js chama o Supabase por trás. O cookie passa a ser do próprio site. Corrigido no desenho técnico (seções 2, 11 e 13).

## Alto

### G2. Estorno ou contestação depois do pagamento confirmado
Se a cliente contesta a compra no banco depois de paga, nada avisava a loja, e a peça poderia ser entregue sem pagamento.
**Correção:** o painel recebe um alerta, e "Marcar como entregue" fica travado até a loja resolver. O estado oficial não muda (pós-venda). Corrigido no desenho (seções 3, 4, 8 e 10) e na especificação (regra 16).

### G3. Webhook do Mercado Pago sem especificação de assinatura
**Correção:** validação da assinatura `x-signature`, recusa de avisos com mais de 5 min, conferência da referência, do valor, da moeda e da conta, e valor divergente sempre para análise. A resposta ao Mercado Pago (200 ou 500) ficou sem ambiguidade. Corrigido no desenho (seção 8).

### G4. Webhook da Z-API sem autenticação e com remetentes errados
A Z-API não assina os avisos. Pelo mesmo número chegam também mensagens da própria equipe, de grupos e de status. Com a mudança recente do WhatsApp para identificadores "LID", o número da cliente pode nem vir no aviso.
**Correção:** endereço secreto do webhook, filtros de remetente e limite de mensagens por remetente. Sem número no aviso, nenhum código é enviado. **Precisa ser verificado com a conta real da Z-API na F3.** Corrigido no desenho (seção 7).

### G5. A fila do WhatsApp não dá conta de um lançamento
50 clientes geram perto de 200 mensagens em 20 min. No ritmo atual (4 a 9 s, 120 por hora), a fila levaria mais de uma hora, e o lembrete de 5 min chegaria depois de a reserva expirar.
**Correção:** mensagens importantes saem primeiro, e lembretes sem sentido são descartados. Também foi criado um **"modo lançamento"** no painel (2 a 4 s, até 600 por hora). Corrigido no desenho (seções 7 e 12) e na tela 18.

### G6. Link da reserva (chave aleatória)
A chave ficaria em texto no banco, nos logs de acesso e na pré-visualização do WhatsApp, e o link abria a tela de endereço sem limite.
**Correção:** a chave vai depois do `#` no link (`tshirtclub.pt/r#chave`), e o banco guarda só uma impressão digital dela (hash). Assim a chave não chega a logs nem ao robô de pré-visualização. O link permite acompanhar, pagar, pedir cancelamento e confirmar a entrega. Telefone e endereço aparecem mascarados, e depois de 30 dias do fim a tela mostra só número e estado. Corrigido no desenho (seções 4, 7 e 11) e na especificação (regra 22).

### G7. Login do painel
Com um único administrador, qualquer pessoa na internet poderia errar a senha 5 vezes e travar a loja por 15 min no meio de um lançamento. Sem segundo fator, uma senha vazada dá acesso a estornos e a todos os dados das clientes.
**Correção:** o bloqueio vale para "e-mail + rede", com captcha a partir do 3º erro e aviso por e-mail. A tela 09 foi alinhada à decisão (sem segundo fator), e a especificação foi atualizada (regra 24). **Recomendação:** ligar o autenticador no celular (TOTP), que é gratuito. Ver as perguntas no fim.

### G8. Colar o código não funcionava
A tela 03 pedia o código em 6 caixinhas de 1 dígito cada. Quem tocava em "Copiar código" no WhatsApp e colava ficava só com o primeiro número.
**Correção:** um campo só, que aceita colar (inclusive com espaço ou traço) e mostra o erro logo abaixo. Corrigido nas telas 03 e 05.

### G9. LGPD
Faltavam prazos de guarda (só o código tinha), o histórico de auditoria guardaria nome e telefone para sempre, e não havia procedimento para pedido de exclusão nem definição de onde os dados ficam.
**Correção:** tabela de prazos e limpeza automática diária. A auditoria passa a guardar sem dados pessoais, e pedido de exclusão vira anonimização. Dados em São Paulo e plano para incidente (comunicação à ANPD em 3 dias úteis). A política (tela 20) agora cita a Z-API, a Cloudflare, o cookie de sessão, as mensagens recebidas e os prazos. Corrigido no desenho (seção 13), na especificação (regra 26) e na tela 20.

### G10. Planos gratuitos não servem para a loja
O plano gratuito do Supabase pausa o projeto depois de 7 dias sem uso e não tem backup diário. O plano Hobby da Vercel não permite uso comercial.
**Correção:** Supabase Pro e Vercel Pro na publicação (conferir os valores antes de contratar). Registrado no checklist de publicação.

## Médio

| # | Achado | Correção |
|---|---|---|
| G11 | Limite por IP barraria clientes da mesma operadora (as operadoras compartilham IP) ou do Wi-Fi da loja num lançamento | Limites principais por telefone e por tentativa; por IP, só um teto alto |
| G12 | Outra pessoa poderia confirmar a tentativa de reserva de alguém pelo número dela | A tentativa fica presa ao navegador que a criou (cookie próprio); nova rota de acompanhamento |
| G13 | Rotas da API ainda falavam em "enviar o código pelo site" | Refeitas para a verificação invertida |
| G14 | O PIX do Mercado Pago não aceita vencer em menos de 30 min | A cobrança nasce com 30 min e é sempre cancelada pelo sistema no fim do prazo (confirmar no ambiente de teste) |
| G15 | Código de retirada era o número da reserva (R-1048), fácil de adivinhar | Código aleatório de 6 caracteres; corrigido na especificação (regra 17) e nas telas 07 e 19 |
| G16 | Faltavam cabeçalhos de segurança e política de conteúdo (CSP) | Definidos; cartão pelos campos seguros do Mercado Pago (em iframe) |
| G17 | Desempenho no celular | Scripts do Mercado Pago e do captcha só quando necessários, consultas repetidas pausam com a aba oculta, cache sem dados da cliente |
| G18 | Testes: sem relógio controlável e com cenários faltando | Relógio `app_now()` e 13 cenários novos (assinatura, contestação, acesso a dados de outra cliente, fila no pico, código colado etc.) |
| G19 | Acessibilidade das telas: rosa de texto com contraste de 2,99:1 em todas as telas (mínimo 4,5:1), foco quase invisível, botões +/− pequenos (36 px), erros só num aviso de 2 s, filtro sem rótulo, tabelas fora do alcance do teclado | Tudo corrigido no protótipo; requisitos de acessibilidade para a produção no desenho (seção 2b) |

## Baixo

| # | Achado | Correção |
|---|---|---|
| G20 | Onde guardar os contadores de limite | Tabela no Postgres |
| G21 | O worker era chamado a cada 10 s mesmo sem trabalho | Só é chamado quando há o que fazer |
| G22 | Código compartilhado entre o site (Node) e a API (Deno) | Forma de importação definida para a F1 |
| G23 | Textos divergentes | Corrigidos: login com segundo fator no protótipo, aviso de "regra pendente" do frete já decidida, "SKU", reserva #0992, "24 páginas" (são 23), `meta-cloud.ts` e "seletor de tamanho" no desenho |
| G24 | Regras de senha por tipo de caractere | Mínimo de 12 caracteres e checagem de senhas vazadas (tela 22) |

---

## O que mudou em cada arquivo

- **Desenho técnico (v8):** nova seção 1b com os achados, correções nas seções 2, 2b, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15 e 16, e a nova **seção 17, checklist de publicação** (contas, pagamento, WhatsApp, segurança, LGPD, qualidade no celular e operação).
- **Especificação:** regras 16, 17, 22, 24 e 26 atualizadas.
- **Protótipo:** estilos compartilhados (contraste, foco, alvos de toque), aviso de 5 s, tabelas acessíveis pelo teclado, e as telas 00, 01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 13, 14, 16 (estilo), 18, 19, 20 e 22. README atualizado.

## Precisa de decisão da loja

1. **Segundo fator no login do painel (G7):** recomendo ligar o autenticador (TOTP). Hoje a decisão é "sem segundo fator", e o protótipo segue a decisão.
2. **O que o link da reserva permite (G6):** proposta aplicada: acompanhar, pagar, pedir cancelamento e confirmar a entrega, com telefone e endereço mascarados. Se preferir, a confirmação de entrega também pode exigir o código do WhatsApp.
3. **Modo lançamento do WhatsApp (G5):** envia mais rápido, o que aumenta o risco de bloqueio do número, risco que a loja já aceitou (W2). Confirmar que pode existir.
4. **Prazo de guarda do endereço:** sugestão de 90 dias após a entrega.

## Verificar com as contas reais (não bloqueia a F1)

- Z-API: como chega o remetente com identificador LID (G4).
- Mercado Pago: prazo mínimo de 30 min do PIX e cancelamento de cobrança pendente (G14).
- Preço dos planos Supabase Pro e Vercel Pro (G10).
