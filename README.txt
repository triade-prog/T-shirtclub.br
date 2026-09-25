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
- 10-admin-catalogo.html — produtos, coleções e tamanhos
- 11-admin-estoque.html — saldo por SKU, ajustes com motivo e movimentações
- 12-admin-pagamentos-analise.html — pagamentos aprovados fora do prazo
- 13-admin-frete.html — cálculo de frete e prazo de 2 horas

Organização:
- assets/css/prototipo.css — estilos compartilhados de todas as páginas
- assets/css/admin.css — complementos das telas administrativas
- assets/js/prototipo.js — utilitários compartilhados (toast)
- assets/js/dados-exemplo.js — dados de exemplo do catálogo e estoque
- assets/js/paginas/ — script de cada tela nova, um arquivo por página

Regras incorporadas:
- até 9 peças por reserva
- até 2 unidades do mesmo modelo/estampa
- promoção aplicada por grupos completos de 3
- uma reserva ativa por telefone
- código WhatsApp válido por 5 minutos
- 2 tentativas por código e 2 reenvios
- bloqueio temporário de 30 minutos após excesso de reenvios
- reserva por 15 minutos
- tolerância de 5 minutos apenas quando existe tentativa real de pagamento antes da expiração
- 3 expirações em 30 dias bloqueiam o telefone
- desbloqueio administrativo zera contador operacional, mantendo histórico
- cancelamento é solicitação aprovada/recusada pelo painel e não pausa o relógio
- frete calculado após pagamento dos produtos, com segundo pagamento e prazo de 2 horas
- consulta no site exige nova validação do WhatsApp
- WhatsApp notifica todo o fluxo
- apenas administrador marca pedido como Entregue
- auditoria das ações relevantes

Observação:
Este é um protótipo estrutural front-end. Pagamento, WhatsApp, estoque, autenticação, persistência e expiração real precisam de backend/serviços integrados em produção.
