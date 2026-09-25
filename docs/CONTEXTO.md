# Contexto do projeto — Sistema de Reserva T-shirt Club

Resumo para quem continuar o trabalho (pessoa ou nova sessão do Claude). Atualizado em 25/09/2026, depois da revisão geral.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Especificação funcional (atualizada com as decisões) | `especificacao_funcional_sistema_reserva.html` |
| Desenho técnico, versão 8 | `docs/arquitetura-reservas.html` |
| Relatório da revisão geral (achados G1 a G24) | `docs/REVISAO-GERAL.md` |
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
- **Link da reserva:** chave aleatória no fragmento (`tshirtclub.pt/r#chave`), só o hash no banco, mostra só aquela reserva, com telefone e endereço mascarados (proposta da revisão, G6).
- **Admin:** 1 administrador, e-mail e senha (sem segundo fator; a revisão recomenda ligar o TOTP), bloqueio de 15 min após 5 senhas erradas, contado por e-mail + rede.
- **Sessão:** o navegador só chama o próprio domínio (`/api`, repasse no Next.js), para o cookie funcionar no iPhone (G1).
- **Publicação:** Supabase Pro (`sa-east-1`) e Vercel Pro (`gru1`); checklist na seção 17 do desenho técnico.
- **LGPD:** aviso no formulário e política em texto-modelo (`20-privacidade.html`), dados da empresa entre colchetes.

## Situação

A revisão geral pedida pela loja (segurança, web e celular, testes e publicação, acessibilidade e textos) foi feita em 25/09/2026. O relatório está em `docs/REVISAO-GERAL.md`, e as correções foram aplicadas no desenho técnico (v8), na especificação e no protótipo. Os plugins Security Guidance, Modern Web Guidance, Engineering e Design não estavam ativos na sessão; a revisão cobriu as mesmas frentes manualmente.

**Próximo passo:** a F1 (Fundação) só começa com a liberação explícita da loja. Decisões em aberto: segundo fator no painel (G7), escopo do link da reserva (G6), modo lançamento do WhatsApp (G5) e prazo de guarda do endereço.

## Dados que ainda faltam (não bloqueiam a revisão)

- Credenciais de teste do Mercado Pago.
- Conta na Z-API com o número conectado.
- Dados da empresa para a política de privacidade (razão social, CNPJ, endereço, e-mail e nome do encarregado, prazo de guarda do endereço).
- Endereço e horário de retirada na loja.
- Conferir com as contas reais: remetente LID na Z-API (G4) e prazo mínimo de 30 min do PIX no Mercado Pago (G14).
