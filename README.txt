# Sistema de Reserva — Protótipo HTML

Abra `00-mapa.html` para navegar por toda a estrutura.

Páginas:
- 00-mapa.html — mapa do fluxo e regras principais
- 01-loja.html — catálogo / seleção
- 02-reserva.html — dados e criação de reserva
- 03-validar-whatsapp.html — validação do telefone
- 04-reserva-ativa.html — reserva, cronômetro e pagamento
- 05-acompanhar.html — consulta e acompanhamento
- 06-admin-painel.html — painel administrativo
- 07-admin-reserva.html — detalhe / auditoria / cancelamento
- 08-admin-bloqueados.html — bloqueios e liberação
- 09-admin-login.html — login administrativo (senha + verificação em duas etapas)
- 10-admin-catalogo.html — produtos, coleções e preço fixo (tamanho único)
- 11-admin-estoque.html — saldo por produto, ajustes com motivo e movimentações
- 12-admin-pagamentos-analise.html — pagamentos aprovados fora do prazo
- 13-admin-frete.html — cálculo de frete e prazo de 2 horas
- 14-admin-promocoes.html — lista de promoções e regra de combinação
- 15-admin-desconto-produto.html — desconto do produto (porcentagem ou preço fixo)
- 16-admin-compre-mais.html — compre e economize mais (níveis por quantidade)
- 17-admin-cupom.html — cupom com código, gasto mínimo e limite por cliente
- 18-admin-whatsapp.html — conexão Z-API (QR code), fila de envio e liga/desliga das notificações

Organização:
- assets/css/prototipo.css — estilos compartilhados de todas as páginas
- assets/css/admin.css — complementos das telas administrativas
- assets/css/promocoes.css — formulários de promoção
- assets/js/prototipo.js — utilitários compartilhados (toast)
- assets/js/dados-exemplo.js — dados de exemplo do catálogo, estoque e promoções
- assets/js/motor-preco.js — cálculo de preço: vale só a promoção mais vantajosa
- assets/js/carrinho.js — seleção da cliente entre as páginas 01 a 05 (guardada no navegador)
- assets/js/componentes/ — seletor de produtos e utilitários dos formulários de promoção
- assets/js/paginas/ — script de cada tela nova, um arquivo por página

Regras incorporadas:
- até 9 peças por reserva
- até 2 unidades do mesmo produto (todas as peças são de tamanho único)
- preço fixo por produto; promoções: desconto do produto, compre e economize mais, cupom
- vale só a promoção mais vantajosa, sem somar; cupom perdido para desconto maior não é gasto
- uma reserva ativa por telefone
- validação invertida: a cliente pede o código pelo próprio WhatsApp e digita no site
- código WhatsApp válido por 5 minutos
- 2 tentativas por código e 2 novos códigos
- bloqueio temporário de 30 minutos após excesso de reenvios
- reserva por 15 minutos
- tolerância de 5 minutos apenas quando existe tentativa real de pagamento antes da expiração
- 3 expirações em 30 dias bloqueiam o telefone (cancelamento aprovado não conta)
- desbloqueio administrativo zera contador operacional, mantendo histórico
- cancelamento é solicitação aprovada/recusada pelo painel e não pausa o relógio
- pagamento por PIX ou cartão; a forma da primeira cobrança fica fixa na reserva
- frete calculado pelo admin após pagamento dos produtos, com segundo pagamento e prazo de 2 horas
- consulta no site exige nova validação do WhatsApp
- WhatsApp notifica todo o fluxo: 5 notificações essenciais sempre ligadas, as demais com liga/desliga
- apenas administrador marca pedido como Entregue
- auditoria das ações relevantes

Observação:
Este é um protótipo estrutural front-end. Pagamento, WhatsApp, estoque, autenticação, persistência e expiração real precisam de backend/serviços integrados em produção.
