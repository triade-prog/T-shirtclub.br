# Contexto do projeto — Sistema de Reserva T-shirt Club

Resumo para quem continuar o trabalho (pessoa ou nova sessão do Claude). Atualizado em 25/09/2026.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Especificação funcional (atualizada com as decisões) | `especificacao_funcional_sistema_reserva.html` |
| Desenho técnico, versão 7 | `docs/arquitetura-reservas.html` |
| Protótipo navegável (24 páginas) | raiz do repositório, começar por `00-mapa.html` |
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
- **Link da reserva:** chave aleatória, mostra só aquela reserva.
- **Admin:** 1 administrador, e-mail e senha (sem segundo fator), bloqueio após 5 senhas erradas.
- **LGPD:** aviso no formulário e política em texto-modelo (`20-privacidade.html`), dados da empresa entre colchetes.

## Próximo passo pedido pela loja

Antes de começar o desenvolvimento (fase F1), **revisar toda a estrutura** — desenho técnico, especificação e protótipo — usando os plugins:
Security Guidance, Modern Web Guidance, Engineering e Design.
Entregar um relatório com o que for encontrado e corrigir o necessário. Só depois disso a loja libera a F1.

## Dados que ainda faltam (não bloqueiam a revisão)

- Credenciais de teste do Mercado Pago.
- Conta na Z-API com o número conectado.
- Dados da empresa para a política de privacidade (razão social, CNPJ, endereço, e-mail e nome do encarregado, prazo de guarda do endereço).
- Endereço e horário de retirada na loja.
