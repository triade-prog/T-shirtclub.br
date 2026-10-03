# Revisão dos textos da T-shirt Club

Gerado do código em 30/09/2026 para a revisão da loja (item D4 do painel de execução). São todos os textos que a cliente e a equipe leem em situações de erro, aviso ou mensagem automática.

**Como revisar:** escreva a mudança logo abaixo do texto, ou marque ✔ quando estiver bom. Não precisa mexer no código: eu aplico o que vocês marcarem.

- Nos exemplos, nomes, números e horários são de mentira (Ana Paula, reserva #1048, 14:32). No sistema entram os dados reais.
- Nas mensagens do WhatsApp, `*texto*` sai em **negrito** no celular.
- Os textos de erro aparecem na tela, perto de onde a cliente estava.

## 1. Erros e avisos

### Na loja (a cliente vê)

| Quando aparece | Texto na tela | Revisão |
| --- | --- | --- |
| O número de WhatsApp digitado não é um celular válido. | Confira o número: use DDD + celular com 9 dígitos. | ☐ |
| O número não tem WhatsApp. | Este número não tem WhatsApp. Use um número com WhatsApp para receber o código. | ☐ |
| Passou do limite de peças por reserva. | Cabem até 9 peças por reserva. | ☐ |
| Mais peças do mesmo modelo do que o permitido. | Até 2 peças do mesmo modelo por reserva. | ☐ |
| Uma peça acabou enquanto a cliente reservava. | Limoncello acabou agora. Tire da sacola para continuar; o resto segue separado para você. | ☐ |
| Não há peças suficientes daquele tamanho. | Limoncello e Pomodoro acabaram agora. Tire da sacola para continuar; o resto segue separado para você. | ☐ |
| O preço mudou entre a sacola e a reserva. | O preço mudou desde que você escolheu: agora o total é R$ 124,99. | ☐ |
| Aviso, não erro: a cliente já tem um desconto maior que o do cupom. | Você já tem um desconto maior. O cupom fica guardado para outra compra. | ☐ |
| O cupom não vale. O texto muda pelo motivo; veja a seção de cupom. | Este cupom esgotou. | ☐ |
| A cliente já tem uma reserva aberta. | Você já tem a reserva #1048 aberta até 14:32. Conclua ou espere ela terminar para fazer outra. | ☐ |
| Código do WhatsApp errado. | Código errado. Restam 2 tentativas com este código. | ☐ |
| O código do WhatsApp venceu. | Este código venceu. Peça outro pelo WhatsApp. | ☐ |
| Muitas tentativas de código. | Muitas tentativas. Você pode pedir um código de novo às 14:47. | ☐ |
| O telefone está com as reservas pausadas (3 expiradas em 30 dias). | Este número está com as reservas pausadas. Fale com a gente pelo WhatsApp (77) 99815-5772. | ☐ |
| Tentou confirmar a reserva sem digitar o código. (Novo, 30/09) | Falta confirmar o seu WhatsApp. Digite o código que chegou na conversa com a loja. | ☐ |
| A confirmação do aparelho venceu (no painel, volta para a tela de entrar). (Novo, 30/09) | Por segurança, a confirmação deste aparelho venceu. Confirme de novo com um código pelo WhatsApp. | ☐ |
| Tentou mexer na entrega sem confirmar o WhatsApp. | Para mexer na entrega, confirme que é você com um código pelo WhatsApp. | ☐ |
| Reserva não encontrada (link errado ou de outro telefone). | Não achamos esta reserva. Confira o link ou consulte pelo seu WhatsApp. | ☐ |
| A reserva expirou ou foi encerrada e a cliente tentou pagar, cancelar ou escolher a entrega. (Novo, 30/09) | Esta reserva não está mais aberta: o prazo terminou ou ela já foi encerrada. Atualize a página para ver como ela está. | ☐ |
| Pediu o cancelamento de novo. (Novo, 30/09) | Você já pediu o cancelamento desta reserva. A loja responde pelo WhatsApp; enquanto isso, a reserva segue no prazo. | ☐ |
| Tentou começar um pagamento depois do prazo. | O prazo desta reserva acabou; não dá para começar um pagamento novo. | ☐ |
| Começou pelo PIX e tentou trocar para cartão (ou o contrário). | Esta reserva já começou por uma forma de pagamento; continue por ela. | ☐ |
| Já tem um pagamento esperando resposta do banco. | Já tem um pagamento em andamento. Espere a resposta do banco antes de tentar outro. | ☐ |
| Tentou escolher a entrega antes de pagar. | A entrega é combinada depois do pagamento confirmado. | ☐ |
| Tentou mudar a entrega depois de pagar o frete. | O frete já foi pago, então a entrega não muda mais por aqui. Fale com a gente pelo WhatsApp. | ☐ |
| A etapa da entrega mudou enquanto a página estava aberta. | Esta etapa da entrega não está disponível agora. Atualize a página para ver o andamento. | ☐ |
| O prazo de 2 horas para pagar o frete venceu. | O prazo para pagar o frete venceu. A gente fala com você pelo WhatsApp. | ☐ |
| O WhatsApp da loja está desconectado do sistema. | A confirmação pelo WhatsApp está fora do ar agora. Tente de novo em alguns minutos. | ☐ |

### Na loja e no painel

| Quando aparece | Texto na tela | Revisão |
| --- | --- | --- |
| Muitas tentativas seguidas. | Muitas tentativas seguidas. Espere um minutinho e tente de novo. | ☐ |
| Falta a verificação anti-robô. | Confirme que você não é um robô para continuar. | ☐ |
| A verificação anti-robô falhou. | Confirme que você não é um robô para continuar. | ☐ |
| Sem conexão com o servidor ou com um fornecedor (Mercado Pago, Wafly). | Sem conexão com a loja agora. Sua reserva continua valendo; tente de novo em instantes. | ☐ |
| Algum campo chegou em formato inválido (a tela quase sempre avisa antes). Fica com o texto geral. | Algo não saiu como esperado. Tente de novo em instantes. | ☐ |
| Acesso negado por um problema técnico. Fica com o texto geral. | Algo não saiu como esperado. Tente de novo em instantes. | ☐ |
| Erro inesperado do sistema. É o texto geral. | Algo não saiu como esperado. Tente de novo em instantes. | ☐ |

### No painel (só a equipe vê)

| Quando aparece | Texto na tela | Revisão |
| --- | --- | --- |
| E-mail ou senha errados no login. | E-mail ou senha não conferem. | ☐ |
| Falta o código do aplicativo autenticador. | Falta o código do aplicativo autenticador para entrar no painel. | ☐ |
| Código do autenticador errado. | Código do autenticador errado ou vencido. Use o código que está aparecendo agora no aplicativo. | ☐ |
| 5 senhas erradas da mesma rede. | Muitas senhas erradas desta rede. Tente de novo às 15:10. | ☐ |
| Senha nova fraca ou vazada. | Esta senha é fraca ou já apareceu em vazamentos. Use uma frase longa, que você não usa em outro lugar. | ☐ |
| Ajuste de estoque abaixo do que já está reservado ou vendido. | O estoque não pode ficar abaixo de 3, que são as peças já reservadas ou vendidas. | ☐ |
| Endereço (slug) ou código de peça repetido. | Já existe um cadastro com este endereço ou código. Escolha outro. | ☐ |
| Publicar peça sem foto. | Para publicar, o produto precisa de pelo menos 1 foto. Um produto publicado não fica sem foto. | ☐ |
| Mais de 10 fotos na peça. | Cada produto tem no máximo 10 fotos. Apague uma para enviar outra. | ☐ |
| A peça já está em outro desconto no mesmo período. | Um destes produtos já está em outro desconto no mesmo período. Mude as datas ou tire o produto. | ☐ |
| Mexer numa promoção que já terminou. | Esta promoção já terminou. Para repetir, crie uma nova. | ☐ |
| Marcar como entregue antes de estar pronto, ter saído ou ter sido enviado. | Para marcar como entregue, o pedido precisa estar pronto para retirada, ter saído para entrega ou ter sido enviado. | ☐ |
| Marcar como entregue com estorno ou contestação aberta. | Há um estorno ou contestação aberto neste pagamento. Resolva a disputa antes de marcar como entregue. | ☐ |
| Ação repetida (ex.: estorno já feito). Fica com o texto geral. | Algo não saiu como esperado. Tente de novo em instantes. | ☐ |

### Cupom que não vale

| Motivo | Texto na tela | Revisão |
| --- | --- | --- |
| O código não existe. | Não achamos este cupom. Confira o código. | ☐ |
| O cupom ainda não começou. | Este cupom começa a valer em 10/10 às 09:00. | ☐ |
| O cupom terminou. | Este cupom não está mais valendo. | ☐ |
| Passou a validade em dias contada do primeiro uso. | Este cupom não está mais valendo. | ☐ |
| Acabou a quantidade do cupom. | Este cupom esgotou. | ☐ |
| A compra não chegou ao valor mínimo. | Este cupom vale para compras a partir de R$ 90,00. | ☐ |
| O cupom é de outras peças. | Este cupom não vale para as peças da sacola. | ☐ |
| A cliente já usou o máximo de vezes. | Você já usou este cupom o máximo de vezes. | ☐ |

### Cartão recusado

| Motivo do banco | Texto na tela | Revisão |
| --- | --- | --- |
| Sem limite | O cartão não tem limite para este valor. Tente outro cartão. | ☐ |
| CVV errado | O código de segurança (CVV) não confere. Confira e tente de novo. | ☐ |
| Validade errada | A validade do cartão não confere. Confira e tente de novo. | ☐ |
| Número ou outro dado errado | Algum dado do cartão não confere. Confira e tente de novo. | ☐ |
| Banco pede autorização | O banco pediu para autorizar este pagamento. Fale com o seu banco e tente de novo. | ☐ |
| Cartão bloqueado | Este cartão está bloqueado para compras. Fale com o seu banco ou use outro cartão. | ☐ |
| Pagamento repetido | Parece um pagamento repetido. Se já pagou, espere esta tela atualizar. | ☐ |
| Recusado pela análise de segurança | O pagamento não foi aprovado pela análise de segurança. Tente outro cartão. | ☐ |
| Tentativas demais | Muitas tentativas com este cartão. Use outro cartão. | ☐ |
| Qualquer outro motivo | O pagamento não foi aprovado. Tente outro cartão ou fale com o seu banco. | ☐ |

### Sem internet

| Quando aparece | Texto na tela | Revisão |
| --- | --- | --- |
| O celular da cliente fica sem conexão | Sem conexão. Sua reserva continua valendo; a tela atualiza quando a internet voltar. | ☐ |

## 2. Mensagens do WhatsApp

Uma versão oficial por mensagem (decisão da loja de 27/09). As que o painel permite desligar estão marcadas; as essenciais saem sempre.

### Código de verificação

*essencial, sempre ligada*

```text
Seu código da T-shirt Club é *482193*.

Ele vale por 5 minutos. Não compartilhe este código com ninguém.
```

Revisão: ☐

### Pedido de código de outro número

*resposta da conversa*

```text
Esse não é o número informado na reserva.

Envie a mensagem pelo WhatsApp que você cadastrou no site para continuar.
```

Revisão: ☐

### WhatsApp não mostrou o número (LID)

*resposta da conversa*

```text
Não conseguimos confirmar seu número por aqui.

Envie a mensagem pelo mesmo WhatsApp informado no site para continuar.
```

Revisão: ☐

### Pedido de código com referência errada

*resposta da conversa*

```text
Não encontramos esse pedido de código.

Volte ao site e toque em *Receber código no WhatsApp* novamente.
```

Revisão: ☐

### Muitas tentativas de código

*resposta da conversa*

```text
Foram feitas muitas tentativas com este número.

Você poderá solicitar um novo código às *14:47*.
```

Revisão: ☐

### Reserva criada: 1 peça

*essencial, sempre ligada*

```text
Oi, Ana! 💖 Sua T-shirt está reservada.

Ela fica guardada até *14:47*.

Reserva #1048 · R$ 49,99

Finalize o pagamento:
https://tshirtclub.vercel.app/r#…
```

Revisão: ☐

### Reserva criada: 2 peças, falta 1 para o Club

*essencial, sempre ligada*

```text
Oi, Ana! 💖 Suas 2 T-shirts estão reservadas.

Elas ficam guardadas até *14:47*.

Reserva #1048 · R$ 99,98

Com mais 1 peça você completa o Club: 3 por R$ 119,99.

Finalize por aqui:
https://tshirtclub.vercel.app/r#…
```

Revisão: ☐

### Reserva criada: 3 peças (Club)

*essencial, sempre ligada*

```text
Oi, Ana! 💖 Seu Club está reservado.

As 3 peças ficam guardadas até *14:47*.

Reserva #1048 · R$ 119,99

Finalize o pagamento:
https://tshirtclub.vercel.app/r#…
```

Revisão: ☐

### Lembrete de 5 minutos

*essencial, sempre ligada*

```text
Ana, faltam só *5 minutos* para a reserva #1048 expirar.

Suas peças ficam separadas até *14:47*.

Se você já pagou, pode ignorar esta mensagem. 💖
```

Revisão: ☐

### Reserva expirada

*essencial, sempre ligada*

```text
O prazo da reserva #1048 terminou às *14:47* e nenhuma cobrança foi feita.

As peças voltaram a ficar disponíveis no Club.

Se ainda quiser, você pode reservar novamente:
tshirtclub.vercel.app
```

Revisão: ☐

### Pagamento confirmado

*essencial, sempre ligada*

```text
Pagamento confirmado! ✦

Ana, suas peças agora são suas. 💖

Pedido #1048
R$ 119,99 · PIX

Falta só escolher como você quer receber:
tshirtclub.vercel.app
```

Revisão: ☐

### Pagamento em análise: depois do prazo

*a loja liga e desliga no painel ("Pagamento em análise")*

```text
Recebemos um pagamento relacionado à reserva #1048 depois do prazo.

Nossa equipe vai conferir o pagamento e falar com você por aqui.

Não é necessário pagar novamente.
```

Revisão: ☐

### Pagamento em análise: valor diferente

*a loja liga e desliga no painel ("Pagamento em análise")*

```text
Recebemos um pagamento da reserva #1048 com valor diferente do total.

Nossa equipe vai conferir o pagamento e falar com você por aqui.

Não é necessário pagar novamente.
```

Revisão: ☐

### Pagamento em análise: frete

*a loja liga e desliga no painel ("Pagamento em análise")*

```text
Recebemos o pagamento do frete do pedido #1048, mas a condição de entrega já havia mudado.

Nossa equipe vai conferir e falar com você por aqui.

Não faça outro pagamento até receber nosso retorno.
```

Revisão: ☐

### Telefone bloqueado

*a loja liga e desliga no painel ("Bloqueio e desbloqueio do telefone")*

```text
As reservas deste número estão temporariamente pausadas porque 3 reservas expiraram sem pagamento nos últimos 30 dias.

Se precisar de ajuda ou quiser solicitar uma análise, pode falar com a gente por aqui.
```

Revisão: ☐

### Telefone liberado

*a loja liga e desliga no painel ("Bloqueio e desbloqueio do telefone")*

```text
Tudo certo! 💖

As reservas deste número foram liberadas e você já pode reservar suas T-shirts novamente.

tshirtclub.vercel.app
```

Revisão: ☐

### Bloqueio mantido

*a loja liga e desliga no painel ("Bloqueio e desbloqueio do telefone")*

```text
Concluímos a análise e as reservas deste número continuam pausadas por enquanto.

Se precisar de mais informações, pode responder esta mensagem.
```

Revisão: ☐

### Cancelamento recebido

*a loja liga e desliga no painel ("Cancelamento recebido")*

```text
Recebemos seu pedido de cancelamento da reserva #1048.

Nossa equipe vai analisar e responder por aqui.

Enquanto o cancelamento não for aprovado, a reserva continua válida até *14:47*.
```

Revisão: ☐

### Cancelamento aprovado

*a loja liga e desliga no painel ("Decisão do cancelamento")*

```text
Cancelamento aprovado.

A reserva #1048 foi encerrada e nenhuma cobrança foi feita.
```

Revisão: ☐

### Cancelamento recusado

*a loja liga e desliga no painel ("Decisão do cancelamento")*

```text
O pedido de cancelamento da reserva #1048 não foi aprovado.

A reserva continua válida até *14:47*.

Se precisar entender o motivo, pode responder esta mensagem.
```

Revisão: ☐

### Entrega escolhida: retirada

*a loja liga e desliga no painel ("Modalidade de entrega confirmada")*

```text
Combinado! 💖

O pedido #1048 será retirado na loja.

Avisamos por aqui assim que ele estiver pronto.
```

Revisão: ☐

### Entrega escolhida: motoboy ou envio

*a loja liga e desliga no painel ("Modalidade de entrega confirmada")*

```text
Endereço recebido! 💖

Agora vamos calcular o frete do pedido #1048.

Assim que o valor estiver pronto, enviamos por aqui.
```

Revisão: ☐

### Frete calculado

*a loja liga e desliga no painel ("Frete calculado")*

```text
O frete do pedido #1048 ficou em *R$ 15,00*.

Para manter esta opção de entrega, pague até *16:32*:

tshirtclub.vercel.app

Depois da confirmação, começamos a preparar o envio. ✦
```

Revisão: ☐

### Frete pago

*a loja liga e desliga no painel ("Frete pago")*

```text
Frete confirmado! ✦

O pedido #1048 já entrou em preparação.

Avisamos por aqui quando ele seguir para entrega. 💖
```

Revisão: ☐

### Pronto para retirada

*a loja liga e desliga no painel ("Pronto para retirada")*

```text
Seu pedido está pronto! 💖

*Pedido:* #1048
*Código de retirada:* *K7Q2*

*Endereço:*
R. Sátiro Santos, 38 - Caetité, BA, 46400-000

*Horário:*
Aberto 24 horas, com retirada agendada: responda esta mensagem para combinar o horário.

Na retirada, informe seu nome, este WhatsApp e o código acima.
```

Revisão: ☐

### Saiu para entrega

*a loja liga e desliga no painel ("Saiu para entrega / enviado")*

```text
Seu pedido #1048 saiu para entrega! ✦

Se puder, deixe alguém disponível para receber.

Avisamos por aqui assim que a entrega for concluída.
```

Revisão: ☐

### Pedido enviado (com rastreio)

*a loja liga e desliga no painel ("Saiu para entrega / enviado")*

```text
Seu pedido #1048 foi enviado! 💖

*Código de rastreio:*
*QB123456789BR*

Você já pode acompanhar a entrega pelo rastreamento da transportadora.
```

Revisão: ☐

### Pedido entregue

*a loja liga e desliga no painel ("Pedido entregue")*

```text
Pedido #1048 entregue. 💖

Obrigada por fazer parte do Club, Ana!

Troca em até 7 dias, com a peça sem uso e com a etiqueta. Se precisar, é só responder esta mensagem.
```

Revisão: ☐

### Resposta a "Minha reserva": com reservas

*resposta da conversa*

```text
Achei! Estas são suas reservas recentes:

• #1048 · reservada até *14:47* · 3 peças · R$ 119,99
• #1031 · paga · pronta para retirada
• #1012 · encerrada sem pagamento

Para ver todos os detalhes:
tshirtclub.vercel.app
```

Revisão: ☐

### Resposta a "Minha reserva": sem reservas

*resposta da conversa*

```text
Procurei aqui e não achei reservas recentes neste número. 🤔

Para escolher suas peças ou fazer uma nova reserva:
tshirtclub.vercel.app
```

Revisão: ☐

### Resposta a "ofertas"

*resposta da conversa*

```text
Separei as ofertas de hoje para você ✦

• *Club*: 3 peças por R$ 119,99
• Cupom *VIP5*: 5% de desconto

Vale sempre a oferta mais vantajosa para você: os descontos não se somam.

Para ver as peças e reservar:
tshirtclub.vercel.app
```

Revisão: ☐

### Resposta a "ofertas": sem ofertas

*resposta da conversa*

```text
Hoje não tem oferta ativa, mas as peças estão te esperando. 💖

Para ver as peças e reservar:
tshirtclub.vercel.app
```

Revisão: ☐

### Resposta sobre trocas

*a loja liga e desliga no painel ("Resposta sobre trocas")*

```text
Sobre trocas, eu te explico! 💖

Você tem até *7 dias* depois de receber ou retirar o pedido, com a peça sem uso e com a etiqueta.

Comprou pelo site e desistiu? Nos mesmos 7 dias você devolve e recebe o valor de volta.

Para pedir, responda aqui com o número da reserva e o que quer trocar. A equipe te responde assim que puder.

A política completa:
tshirtclub.vercel.app/trocas
```

Revisão: ☐

### Resposta automática (mensagem comum), com o menu

*a loja liga e desliga no painel ("Resposta automática")*

```text
Oi! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖

Para ver as peças e reservar:
tshirtclub.vercel.app

Como posso te ajudar? É só responder com o número:
*1* · Ver as peças e reservar
*2* · Tamanhos e medidas
*3* · Entrega e frete
*4* · Pagamento
*5* · Horário e endereço
*6* · Minha reserva
*7* · Ofertas e cupons
*8* · Trocas e devoluções
*9* · Falar com a equipe
```

Revisão: ☐

### Resposta automática (mensagem comum), com as respostas rápidas desligadas

*a loja liga e desliga no painel ("Resposta automática")*

```text
Oi! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖

Para ver as peças, reservar ou acompanhar seus pedidos:
tshirtclub.vercel.app

Precisa de ajuda com outra coisa? Pode escrever por aqui, que a equipe te responde assim que puder.
```

Revisão: ☐

### Resposta rápida (o texto vem do painel, com a volta para o menu)

*a loja liga e desliga no painel ("Respostas rápidas e menu")*

```text
É tudo pelo site, com o Mercado Pago:
• *PIX*, confirmado na hora
• *Cartão de crédito*

Depois de reservar, o link para pagar chega aqui no WhatsApp ✦

Quer ver as outras opções? É só mandar *menu* ✦
```

Revisão: ☐

### Mensagem de teste do painel

*resposta da conversa*

```text
✦ Teste T-shirt Club

O envio de mensagens pelo sistema está funcionando corretamente.

Esta é apenas uma mensagem de teste.
```

Revisão: ☐
