# Runbook de operação · T-shirt Club.br

O que fazer quando algo sai do normal. Cada caso diz **como você percebe**, **o que o sistema já faz
sozinho** e **o que fazer**, na ordem. Para quem opera a loja; os passos técnicos estão marcados.

> Antes de abrir a loja, preencha a seção **Contatos** e faça uma vez cada ensaio marcado com 🔁.

## Contatos (preencher)

| Quem | Para quê | Contato |
|---|---|---|
| Responsável pela loja | Decide sobre reservas, estornos e comunicação com clientes | _a preencher_ |
| Dona do projeto no Supabase | Backup, restauração, chaves, autenticador perdido | _a preencher_ |
| Encarregado (LGPD) | Incidente de dados e pedidos das titulares | _a preencher_ |
| Desenvolvimento | Erro no sistema, job parado, estoque divergente | _a preencher_ |
| Suporte Z-API · Mercado Pago · Supabase · Vercel | Fora do ar do lado deles | páginas de status e suporte de cada um |

## Onde olhar primeiro

1. **Painel → Dashboard**: o bloco "o que pede ação" (cancelamentos, pagamentos em análise, disputas,
   telefones bloqueados, fretes, fila do WhatsApp) e os **alertas abertos**.
2. **Painel → Alertas** (`GET /v1/admin/alerts`): cada alerta diz o tipo e desde quando. Os
   automáticos se fecham sozinhos quando a causa some; os outros você resolve com uma observação.
3. **Monitor de fora** (configurado na publicação): chama `…/functions/v1/worker/saude` a cada
   5 min e avisa por e-mail quando responde 503. Ele pega o caso em que o próprio banco parou.
4. **Sentry** (se `SENTRY_DSN` estiver configurado): erros inesperados das funções e dos apps, sem
   dados pessoais.
5. **Painel → Auditoria**: tudo o que aconteceu, por autor, assunto e período.

| Alerta | Quer dizer | Caso |
|---|---|---|
| `FILA_PARADA` | Mensagem do WhatsApp esperando há mais de 10 min | [WhatsApp caiu](#whatsapp-caiu) |
| `PAGAMENTOS_PARADOS` | Aviso do Mercado Pago sem processar há mais de 10 min | [Mercado Pago fora](#mercado-pago-fora-do-ar) |
| `JOB_ATRASADO` | Um job do banco não roda há mais tempo que o normal | [Job atrasado](#job-atrasado-ou-falhando) |
| `CRON_FALHOU` | Um job do banco deu erro nos últimos 30 min | [Job atrasado](#job-atrasado-ou-falhando) |
| `ESTOQUE_DIVERGENTE` | O saldo de um produto não bate com as reservas | [Estoque divergente](#estoque-divergente) |

---

## WhatsApp caiu

**Como você percebe:** a tela do WhatsApp no painel mostra "Desconectado"; alerta `FILA_PARADA`;
clientes dizem que não recebem o código; o site mostra "Validação pelo WhatsApp indisponível agora".

**O sistema já faz:** não cria reserva sem telefone validado; guarda as mensagens na fila (nada se
perde); as reservas que já existem continuam correndo e expiram no horário; mensagens que perderam o
sentido (lembrete de reserva já paga, por exemplo) são descartadas na volta.

**O que fazer:**
1. Painel → WhatsApp: com o número desconectado, a tela mostra o **QR code**.
2. No celular da loja: WhatsApp Business → Configurações → Dispositivos conectados → Conectar
   dispositivo → aponte para o QR. O código expira em segundos; peça outro se precisar.
3. Confira "Conectado" e mande uma **mensagem de teste** para um número da equipe.
4. A fila esvazia sozinha no ritmo configurado. O alerta se fecha quando a fila andar.
5. Se o número foi **bloqueado pelo WhatsApp**: avise as clientes pelo Instagram e chame o
   desenvolvimento. O plano B é a API oficial (Cloud API): a troca é de implementação, não de fluxo,
   mas pede conta Meta verificada.

## Mercado Pago fora do ar

**Como você percebe:** clientes não conseguem gerar PIX ou pagar com cartão ("Sem conexão com a loja
agora"); alerta `PAGAMENTOS_PARADOS`; status do Mercado Pago mostra incidente.

**O sistema já faz:** a cobrança que falhou pode ser tentada de novo pela cliente; PIX iniciado dentro
dos 15 min ganha a tolerância de 5 min; a reconciliação consulta os pagamentos pendentes a cada minuto
e aplica o que o Mercado Pago confirmar quando voltar; pagamento aprovado depois do prazo vai para
**análise**, nunca confirma sozinho.

**O que fazer:**
1. Se for durante um lançamento, avise nas redes que o pagamento está instável e que ninguém perde a
   vez por isso enquanto a reserva estiver no prazo.
2. Não mexa no banco. Quando o Mercado Pago voltar, acompanhe **Pagamentos em análise** no painel.
3. Se a queda for longa (mais de 1 h), considere adiar o lançamento.

## Pagamento em análise

**Por quê:** pagamento aprovado depois do prazo, com valor diferente do da cobrança, ou de reserva que
já tinha encerrado (ou de frete de uma cotação que mudou).

**O que fazer (painel → Pagamentos em análise):**
1. Fale com a cliente pelo WhatsApp (ela recebe o aviso "a loja vai conferir").
2. **Converter em pedido**: se as peças ainda estão disponíveis, nasce uma reserva nova já paga. Não
   vale para frete.
3. **Estornar**: o dinheiro volta pelo Mercado Pago; a análise fecha com a sua observação.

## Contestação ou estorno depois de pago

**Como você percebe:** item em **Disputas** no painel; o pedido não pode ser marcado como Entregue.

**O sistema já faz:** abre a disputa e **bloqueia o Entregue** até alguém resolver (G2). O estado do
pedido não muda.

**O que fazer:**
1. No painel do Mercado Pago, veja o motivo e o prazo para responder.
2. Separe as provas: conversa no WhatsApp, reserva (número, horário, itens), retirada ou envio.
3. Responda no Mercado Pago dentro do prazo.
4. Decidido, resolva a disputa no painel com uma observação. Só então o Entregue libera (se fizer
   sentido entregar).

## Perda do autenticador

**Perdeu um aparelho (tem o outro):** entre com o que sobrou → Minha conta → remova o autenticador
perdido digitando o código do que continua → cadastre um novo. Mantenha sempre dois.

**Perdeu os dois (técnico, só a dona do projeto no Supabase):**
1. Confirme a identidade de quem pede (por telefone ou pessoalmente, nunca só por mensagem).
2. No SQL Editor do Supabase:
   ```sql
   delete from auth.mfa_factors where user_id = '<id do usuário>';
   select log_audit('SISTEMA', null, 'admin.autenticador.redefinido', 'admin_user', '<id do usuário>');
   ```
3. No próximo login, o painel pede para cadastrar o autenticador. Cadastre os dois aparelhos.
4. Se houver qualquer suspeita de invasão, troque também a senha e siga [Incidente de dados](#incidente-de-dados-pessoais).

## Job atrasado ou falhando

**Como você percebe:** alerta `JOB_ATRASADO` ou `CRON_FALHOU`; o monitor de fora avisa que
`/worker/saude` respondeu 503.

| Job | O que faz | Atraso aceito |
|---|---|---|
| `varredura` | Expira reservas, lembrete de 5 min, tolerância, chama o worker | 2 min |
| `frete` | Marca o frete não pago em 2 h | 5 min |
| `invariantes` | Confere o estoque (03:10) | 26 h |
| `purga` | Prazos de guarda dos dados (03:25) | 26 h |

**O que fazer (técnico):**
1. Supabase → Database → Cron Jobs: veja se os jobs estão ativos e o erro da última execução
   (`cron.job_run_details`).
2. Supabase → Edge Functions → worker → Logs: erro do worker (sem dados pessoais).
3. Varredura parada é o mais urgente: sem ela, reservas vencidas só se liberam quando outra cliente
   precisa da peça. Corrija e confira que o alerta se fecha em até 5 min.

## Estoque divergente

**Como você percebe:** alerta `ESTOQUE_DIVERGENTE` com o código do produto e os números (reservado e
vendido no produto × o que as reservas dizem).

**O que fazer:**
1. **Não** corrija os números à mão: o sistema recusa mudança de estado fora das funções, e o ajuste
   de estoque do painel só mexe no total.
2. Chame o desenvolvimento com o alerta. A divergência é sinal de erro de programa ou de alguém que
   mexeu direto no banco (a auditoria mostra).
3. Enquanto isso, se o produto tem mais "reservado" do que devia, ele aparece com menos disponível
   (perde venda, não vende a mais). O contrário é o grave: pause o produto.

## Lançamento

**Na véspera**
- [ ] Produtos, fotos e estoque conferidos; promoções com início e fim certos.
- [ ] Painel → WhatsApp: conectado, **mensagem de teste** recebida.
- [ ] `…/worker/saude` respondendo 200; nenhum alerta aberto.
- [ ] Credenciais de produção do Mercado Pago; um PIX real de valor baixo feito e estornado.

**Uma hora antes**
- [ ] Ligue o **modo lançamento** (2 a 4 s entre mensagens, até 600 por hora).
- [ ] Deixe o painel aberto no dashboard.

**Durante**
- [ ] Acompanhe cancelamentos, pagamentos em análise e a fila do WhatsApp.
- [ ] Responda na conversa quem escrever; "Minha reserva" responde sozinho.

**Depois**
- [ ] Desligue o modo lançamento.
- [ ] Resolva análises e cancelamentos pendentes; confira os alertas.

## Backup e restauração 🔁

O Supabase Pro faz backup diário (e PITR, se contratado). **Ensaie a restauração a cada 3 meses**
e antes de abrir a loja. O teste automático (`pnpm test:db`) já restaura uma cópia num banco vazio
e confere dados, invariantes e acesso; o ensaio abaixo é o mesmo, com o backup de verdade.

1. Supabase → Database → Backups: escolha o ponto e restaure **num projeto novo** (nunca por cima do
   de produção, a não ser na emergência real).
2. No projeto restaurado, pelo SQL Editor:
   ```sql
   select check_stock_invariants();   -- divergencias: 0
   select check_job_health();         -- depois de ligar os jobs
   select admin_dashboard();
   ```
3. Para usar o restaurado de verdade: configure os segredos das funções (ver README), o
   `worker_url` e o segredo do worker no Vault, aponte os webhooks da Z-API e do Mercado Pago para o
   projeto novo e troque as variáveis da Vercel.
4. Registre a data do ensaio e o tempo que levou.

## Incidente de dados pessoais

Vazamento, acesso indevido ou perda de dados de clientes.

1. **Conter** (na hora): troque as chaves suspeitas (service role do Supabase, `REPASSE_SEGREDO`,
   token do Mercado Pago, tokens da Z-API, senhas das contas); encerre as sessões do painel (Minha
   conta → sair dos outros aparelhos); se preciso, tire a loja do ar.
2. **Avaliar**: quais dados, de quantas pessoas, desde quando. Use a auditoria (não tem dado pessoal,
   mas mostra quem fez o quê e quando).
3. **Registrar**: o que aconteceu, o que foi feito, quem decidiu, horários.
4. **Comunicar**: se puder causar risco ou dano relevante às titulares, comunique a **ANPD e as
   clientes afetadas em até 3 dias úteis** (Resolução CD/ANPD nº 15/2024). O encarregado conduz.

## Pedido da titular (acesso, correção ou exclusão)

1. Confirme que quem pede é a dona do telefone (peça para mandar mensagem pelo próprio WhatsApp).
2. **Acesso**: a consulta do painel (busca pelo telefone) mostra as reservas; exporte o que for dela.
3. **Exclusão**: dados de reservas e pagamentos ficam pelo prazo fiscal (5 anos, a confirmar com a
   contabilidade); o resto já sai sozinho pelos prazos de guarda. Pedido fora disso: chame o
   desenvolvimento (a anonimização pelo painel ainda não existe).
4. Responda à titular e registre o atendimento.
