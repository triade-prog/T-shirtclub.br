# Política de privacidade da T-shirt Club: texto para revisão jurídica

Preparado em 30/09/2026 para a análise jurídica (item P15 do painel de execução).

- **Site:** https://tshirtclub.vercel.app. Ainda não há domínio próprio.
- **Página da política:** https://tshirtclub.vercel.app/privacidade
- **Texto no ar desde:** 27/09/2026. Em 02/10/2026 a loja trocou a ferramenta do WhatsApp: a Wafly entrou no lugar da Z-API, e a política publicada passou a citar a Wafly (item 4 e ponto 6 abaixo). No mesmo dia, o site passou a contar as visitas sem cookie, e a política ganhou os trechos sobre isso (itens 2, 3, 5 e 7 e ponto 12 abaixo). Em 03/10/2026 entraram as mensagens de acompanhamento pelo WhatsApp (item 3 e ponto 13 abaixo).

O documento tem quatro partes:

1. Como o site funciona, para dar contexto.
2. O texto da política exatamente como está publicado.
3. Os textos de consentimento que aparecem fora da política.
4. Os pontos em que precisamos de uma posição do jurídico.

Correções podem ser feitas direto no texto da parte 2 ou em comentários à parte. Depois, a loja atualiza o site.

---

## 1. Como o site funciona

- **O que é:** uma loja virtual de camisetas em Caetité (BA). A cliente escolhe as peças e faz uma **reserva** de 15 minutos. Nesse prazo, paga por PIX ou cartão.
- **Identificação da cliente:** é feita pelo **número de WhatsApp**, sem conta nem senha. Para confirmar que o número é dela, a cliente pede um código de 6 dígitos pelo WhatsApp da loja.
- **O que o site pede:**
  - nome e WhatsApp;
  - endereço, só para entrega por motoboy ou envio.
- **O que o site não pede:** CPF, e-mail ou data de nascimento.
- **Pagamento:** pelo Mercado Pago. Os dados do cartão são digitados no componente do Mercado Pago e não passam pelo servidor da loja.
- **Mensagens automáticas pelo WhatsApp:** código, reserva criada, lembrete, pagamento, entrega, resposta sobre trocas, resposta automática e, desde 03/10/2026, acompanhamento: a reserva que expirou com as peças que ainda estão à venda, o aviso de que a equipe já responde e, 2 dias depois da entrega, a pergunta se a cliente gostou, com o convite para a Lista VIP. O envio usa a Wafly, uma ferramenta que conecta o WhatsApp da loja ao sistema (até 02/10/2026, a Z-API).
- **Lista VIP:** é opcional. A cliente dá dois aceites separados: um para receber ofertas pelo WhatsApp e outro para a política de privacidade.
- **Bloqueio automático:** um telefone com 3 reservas expiradas sem pagamento em 30 dias fica com as reservas pausadas. A equipe pode revisar e liberar pelo painel.
- **Onde os dados ficam:**
  - banco de dados no Supabase, em São Paulo (sa-east-1);
  - site na Vercel.
- **Contagem de visitas:** o site conta as páginas vistas, de onde a visita chegou e se o aparelho é celular, tablet ou computador, sem cookie e sem guardar nada no aparelho. Para contar cada pessoa uma vez por dia, o servidor cria um código irreversível (hash) do IP, do navegador e do dia, com uma chave secreta do servidor. O código muda todo dia e é apagado em até 2 dias. Ficam só os totais por dia, que a equipe vê no painel.
- **Google Ads:** está pronto no sistema, mas **não está ligado**. Sem a conta configurada, o site não mostra o aviso de cookies de anúncio nem os trechos da política sobre isso. Os trechos que entram quando a conta for ligada estão no fim da parte 2.

### Prazos de guarda que o sistema aplica sozinho

Uma rotina diária apaga ou reduz estes dados:

| Dado | O que acontece |
|---|---|
| Códigos de verificação, sessões e tentativas de reserva não concluídas | apagados em 30 dias |
| IP, guardado apenas como código irreversível (hash) | apagado em 30 dias |
| Texto das mensagens recebidas no WhatsApp pelo sistema | apagado em 90 dias |
| Código diário da contagem de visitas (hash de IP, navegador e dia) | apagado em até 2 dias (só os totais por dia ficam) |
| Endereço de entrega | reduzido a cidade e UF 90 dias depois da entrega |
| Reservas, pedidos e pagamentos | **não são apagados nem anonimizados automaticamente** (ver o ponto 1 da parte 4) |

---

## 2. Texto publicado (como aparece no site)

> **Política de privacidade.**
> Última atualização: 02/10/2026
>
> **1. Quem cuida dos seus dados**
>
> A T-shirt Club (Carolina Soares Santana, CNPJ 60.814.144/0001-03, 2ª Travessa Palestina, Centro, Caetité (BA), CEP 46400-153) é a controladora dos dados pessoais tratados neste site, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
>
> **2. Quais dados coletamos**
>
> - Nome e número de WhatsApp, informados por você ao fazer uma reserva ou consultar seus pedidos.
> - Endereço de entrega, só quando você escolhe motoboy ou envio para outra cidade.
> - Dados do pagamento: forma, valor, data e identificador da transação. Os dados do cartão são digitados direto no ambiente do Mercado Pago; a loja não vê nem guarda o número do cartão.
> - Mensagens que você envia ao WhatsApp da loja (para pedir o código, consultar sua reserva ou receber as respostas automáticas) e o horário em que a equipe respondeu, sem o texto da resposta.
> - Se você entrar na Lista VIP: o WhatsApp, o nome (se quiser informar) e a data em que aceitou receber as novidades.
> - Dados técnicos de segurança: o endereço IP, guardado de forma protegida (não legível), para limitar abusos como pedidos repetidos de código, e a verificação anti-robô da Cloudflare (Turnstile).
> - Contagem de visitas, sem cookie: a página vista, o site ou o link de onde você chegou (como Instagram ou Google) e se o aparelho é celular, tablet ou computador. Para contar cada pessoa uma vez por dia, o sistema cria um código embaralhado a partir do endereço IP e do navegador, que muda todo dia e não permite saber quem é você. Guardamos só os totais por dia.
>
> Não pedimos CPF, e-mail ou data de nascimento para reservar.
>
> **3. Para que usamos e com qual base legal**
>
> - Criar e cumprir sua reserva e seu pedido (confirmar o WhatsApp, guardar as peças, receber o pagamento, entregar): execução de contrato (art. 7º, V, da LGPD).
> - Enviar avisos pelo WhatsApp sobre a sua reserva (código, prazo, pagamento, entrega): execução de contrato.
> - Acompanhar pelo WhatsApp quem reservou, comprou ou pediu atendimento (as peças de uma reserva que expirou e ainda estão à venda, o retorno da equipe e, dias depois da entrega, se você gostou da compra): legítimo interesse (art. 7º, IX), e você pode pedir para não receber pelo WhatsApp da loja.
> - Prevenir fraude e abuso, como o bloqueio de telefones com expirações repetidas: legítimo interesse (art. 7º, IX).
> - Guardar os registros de vendas exigidos pela legislação fiscal e de consumo: cumprimento de obrigação legal (art. 7º, II).
> - Saber quantas pessoas visitam o site e quais páginas interessam mais, para melhorar a loja: legítimo interesse (art. 7º, IX), só com totais, sem identificar ninguém.
> - Mandar novidades, drops e ofertas pelo WhatsApp, só para quem entrou na Lista VIP: consentimento (art. 7º, I), que você retira quando quiser pedindo pelo WhatsApp da loja.
>
> Não enviamos propaganda sem o seu pedido e não vendemos seus dados.
>
> **4. Com quem compartilhamos**
>
> - Mercado Pago: processamento do pagamento.
> - Wafly: conexão do WhatsApp da loja ao sistema, para receber e enviar as mensagens. As mensagens passam também pelo próprio WhatsApp (Meta).
> - Cloudflare (Turnstile): verificação anti-robô nos formulários.
> - Hospedagem e banco de dados (Supabase e Vercel): armazenamento seguro do sistema, em servidores de São Paulo sempre que o fornecedor oferece.
> - Motoboy ou transportadora: nome, telefone e endereço, só quando há entrega.
>
> Alguns desses fornecedores podem guardar dados fora do Brasil, com as garantias previstas na LGPD.
>
> **5. Por quanto tempo guardamos**
>
> - Códigos de verificação, sessões, tentativas de reserva não concluídas e dados técnicos de segurança: apagados em até 30 dias.
> - Mensagens que você enviou ao WhatsApp da loja pelo sistema: o texto é apagado em até 90 dias.
> - Código diário da contagem de visitas: apagado em até 2 dias. Os totais por dia ficam, porque não identificam ninguém.
> - Endereço de entrega: 90 dias depois da entrega; depois fica só a cidade.
> - Lista VIP: até você pedir para sair; ao sair, o contato é apagado.
> - Reservas, pedidos e pagamentos: pelo prazo exigido pela legislação fiscal e de consumo (5 anos). Depois, são anonimizados.
>
> **6. Seus direitos**
>
> Você pode pedir, a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão do que não for obrigatório guardar, portabilidade, informação sobre com quem compartilhamos e revisão de decisões como o bloqueio do telefone (art. 18 da LGPD).
>
> Para isso, fale com a loja pelo WhatsApp (77) 99815-5772 ou pelo e-mail contato@grouptriade.com.br. Encarregado pelo tratamento de dados: Carolina Soares Santana.
>
> **7. O que fica no seu aparelho**
>
> O site usa cookies necessários para funcionar: um guarda as peças da sua sacola, e os outros mantêm a sua reserva e a sua consulta abertas depois da confirmação pelo WhatsApp. As peças que você marca como favoritas ficam só no seu navegador. Se você instalar o site na tela inicial, o aparelho guarda também a parte visual do site para abrir mais rápido. A contagem de visitas não usa cookie nem guarda nada no seu aparelho. Não usamos cookies de propaganda nem rastreamento de terceiros.
>
> **8. Segurança**
>
> O acesso aos dados é restrito à equipe da loja, as conexões são criptografadas e códigos e senhas são guardados de forma protegida. Mesmo assim, nenhum sistema é totalmente imune; se houver um incidente relevante, avisaremos você e a Autoridade Nacional de Proteção de Dados (ANPD).
>
> **9. Mudanças nesta política**
>
> Quando esta política mudar, a data no topo será atualizada. Mudanças importantes serão avisadas no site.

### Trechos que entram quando o Google Ads for ligado

- **No item 3, novo tópico:** "Saber quais anúncios do Google trouxeram visitas e compras, só se você aceitar os cookies de anúncio: consentimento (art. 7º, I), que você pode retirar quando quiser (item 7)."
- **No item 4, novo tópico:** "Google (Google Ads), só com o seu aceite: os cookies de anúncio e, quando o pagamento é aprovado, o número da reserva e o valor da compra, sem nome nem telefone."
- **No item 7, a última frase é substituída por:** "Cookies de anúncio do Google só entram se você aceitar no aviso do site; sem o aceite, nada é enviado ao Google. Para mudar a escolha, use o botão abaixo; os cookies já gravados também podem ser apagados nas configurações do navegador." Logo abaixo aparece um botão para mudar a escolha.

---

## 3. Textos de consentimento fora da política

**Lista VIP.** O cadastro aparece num pop-up e no rodapé. Tem duas caixas de marcar, que começam desmarcadas e são as duas obrigatórias para entrar:

1. "Quero receber novidades, drops e ofertas da T-shirt Club pelo WhatsApp."
2. "Li e concordo com a Política de privacidade." O texto tem um link para a política.

Embaixo do botão aparece: "Você sai da lista quando quiser, pelo WhatsApp da loja."

O banco guarda o texto exato que a cliente aceitou e a data e hora do aceite.

**Aviso de cookies de anúncio.** Só existe com o Google Ads ligado. A cliente escolhe aceitar ou recusar, e a tag do Google só carrega depois do "Aceitar".

---

## 4. Pontos para o jurídico confirmar

1. **Prazo de guarda das vendas.**
   - A política diz "5 anos".
   - A contabilidade da loja informou **1 ano** (30/09/2026).
   - O sistema hoje guarda reservas, pedidos e pagamentos por tempo indeterminado. Ele não apaga nem anonimiza nada depois de um prazo.

   Pedimos a confirmação de:
   - (a) qual prazo a loja precisa cumprir, considerando os documentos fiscais e o prazo para a cliente reclamar de um produto (CDC);
   - (b) se a frase "Depois, são anonimizados" pode ficar enquanto a anonimização for feita manualmente, ou se deve sair até existir uma rotina automática.

2. **Encarregado.** A dona da loja é também a encarregada, com contato pelo e-mail contato@grouptriade.com.br. Esse arranjo é suficiente para uma empresa deste porte? Vale citar a dispensa prevista para agentes de pequeno porte (Resolução CD/ANPD nº 2/2022), mantendo o canal de atendimento?

3. **Identificação do controlador.** A razão social é o nome da titular: Carolina Soares Santana, CNPJ 60.814.144/0001-03. O endereço da empresa é diferente do endereço de retirada:
   - empresa: 2ª Travessa Palestina, Centro, Caetité (BA);
   - retirada: R. Sátiro Santos, 38, Caetité (BA).

   A política deve mostrar os dois?

4. **Bases legais.** Estão corretas?
   - Execução de contrato para as mensagens da reserva.
   - Legítimo interesse para o bloqueio de telefones.
   - Obrigação legal para os registros de venda.
   - Consentimento para a Lista VIP e para os anúncios.

5. **Decisão automatizada.** O bloqueio depois de 3 expirações é automático. A política oferece a revisão, mas não cita o art. 20 da LGPD. Precisa citar?

6. **Wafly e WhatsApp.** A Wafly, como a Z-API antes dela, não é a API oficial da Meta. Isso deve estar escrito na política? Existe algum risco a apontar? A troca de fornecedor exige algum aviso às clientes além da nova data no topo da política?

7. **Transferência internacional.** A frase "Alguns desses fornecedores podem guardar dados fora do Brasil, com as garantias previstas na LGPD" é suficiente? Ou é preciso listar os países ou os mecanismos de transferência (art. 33)?

8. **Cookies.** Os cookies necessários não pedem aceite. Os de anúncio só entram com aceite. A redação do item 7 atende?

9. **Consentimento da Lista VIP.** Os dois aceites separados estão de acordo com os arts. 7º, I, e 8º?

10. **Idade.** O site não verifica a idade da cliente. É preciso incluir alguma cláusula sobre menores de 18 anos (art. 14)?

11. **Termos de uso.** O site não tem página de termos de uso. As regras da loja ficam em páginas separadas:
    - prazo da reserva de 15 minutos;
    - limite de peças;
    - bloqueio;
    - trocas em até 7 dias e direito de arrependimento (art. 49 do CDC), na página https://tshirtclub.vercel.app/trocas.

    Recomendam criar uma página de termos?

12. **Contagem de visitas.** A contagem não usa cookie nem guarda nada no aparelho, por isso o site não pede aceite. A base usada é o legítimo interesse. O código diário (hash do IP, do navegador e do dia, com chave secreta) é apagado em até 2 dias, e ficam só totais. Essa base e essa redação atendem? É preciso o teste de balanceamento (LIA) por escrito?

13. **Acompanhamento pelo WhatsApp.** Desde 03/10/2026, a assistente virtual manda, só a quem já reservou, comprou ou pediu atendimento, no máximo uma de cada por pedido: as peças de uma reserva expirada que ainda estão à venda, com o link de cada uma; o aviso de que a equipe já responde, quando ninguém respondeu em 20 minutos; e, 2 dias depois da entrega, a pergunta se a cliente gostou, com o convite para a Lista VIP. A política diz "Não enviamos propaganda sem o seu pedido". Essas mensagens cabem no legítimo interesse? O convite para a Lista VIP na mensagem de pós-entrega conflita com essa frase? Precisa de um jeito automático de parar de receber (como responder "sair")?

---

**Contato da loja:** WhatsApp (77) 99815-5772 · contato@grouptriade.com.br
