# Contexto do projeto — Sistema de Reserva T-shirt Club

Resumo para quem continuar o trabalho (pessoa ou nova sessão do Claude). Atualizado em 25/09/2026, depois da revisão geral.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Especificação funcional (atualizada com as decisões) | `especificacao_funcional_sistema_reserva.html` |
| Desenho técnico, versão 12 | `docs/arquitetura-reservas.html` |
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
- **Frontend e design (D16):** frente de design D1 a D6 antes e junto da F1; o Claude cria e a loja aprova. Marca oficial T-shirt Club.br (D17): paleta da prancha 2, Baloo 2 + Poppins; rosa e verde como tempero e cores de coleção (D18); referências em `docs/design/marca/`. `packages/ui` com os tokens, critério de pronto de cada tela na seção 18 do desenho técnico.
- **LGPD:** aviso no formulário e política em texto-modelo (`20-privacidade.html`), dados da empresa entre colchetes.

## Situação

A revisão geral pedida pela loja (segurança, web e celular, testes e publicação, acessibilidade e textos) foi feita em 25/09/2026. O relatório está em `docs/REVISAO-GERAL.md`, e as correções foram aplicadas no desenho técnico (v8), na especificação e no protótipo. Os plugins Security Guidance, Modern Web Guidance, Engineering e Design não estavam ativos na sessão; a revisão cobriu as mesmas frentes manualmente.

As decisões da loja sobre a revisão (D12 a D15) foram registradas no desenho técnico (v9), na especificação e no protótipo. A situação de cada achado está no fim de `docs/REVISAO-GERAL.md`.

**Painel de execução:** `docs/painel-execucao.html` acompanha tudo o que a arquitetura planejou. Os dados ficam num bloco JSON no início do arquivo. A cada entrega, no mesmo commit: mudar o status do item (com evidência quando "feito"), atualizar `meta` e acrescentar uma linha no histórico.

**Design:** proposta 3, "clube de stickers" (`docs/design-frontend.html`), validada e aguardando aprovação. A proposta 2 foi recusada por pesar demais (rosa escuro e ameixa em áreas grandes). Regra (D18): página branca e leve; rosa #E8478A e verde #6B8B1F só como tempero (botão com texto escuro, stickers, destaques, momentos de impacto); cada coleção tem cor própria (Teddy: Tomate #EE4A2A, Dog Club: Mediterrâneo #2F6FD0, Trendy: Limão #F2DD3D), sempre com nome e estampa junto. A prancha 2 é a oficial. Pendências da loja: logo em SVG, endereço do site (a marca usa ".br"; o domínio registrado é tshirtclub.pt) e liberar coucousuzette.com na rede para conferir a referência. A F2 só começa com D1 e D2 aprovados.

**Próximo passo:** a F1 (Fundação) **não foi liberada** (resposta "ainda não" em 25/09). Ela só começa com uma nova liberação explícita da loja.

## Dados que ainda faltam (não bloqueiam a revisão)

- Credenciais de teste do Mercado Pago.
- Conta na Z-API com o número conectado.
- Dados da empresa para a política de privacidade (razão social, CNPJ, endereço, e-mail e nome do encarregado).
- Endereço e horário de retirada na loja.
- Conferir com as contas reais: remetente LID na Z-API (G4) e prazo mínimo de 30 min do PIX no Mercado Pago (G14).
