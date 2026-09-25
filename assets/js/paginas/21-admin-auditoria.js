// Auditoria: consulta somente leitura do registro permanente de eventos.
(function(){
  const agora=new Date('2026-09-25T10:00');
  const h=(dias,hh,mm)=>{const d=new Date(agora);d.setDate(d.getDate()-dias);d.setHours(hh,mm,0,0);return d;};
  const EVENTOS=[
    [h(0,9,58),'Admin','Acesso','Carol entrou no painel.','—'],
    [h(0,9,12),'Sistema','Reserva','Reserva criada: 3 peças, total R$ 119,99, expira às 09:27.','#1048 · (77) •••••-8809'],
    [h(0,9,12),'Sistema','WhatsApp','Mensagem "reserva criada" enviada.','#1048'],
    [h(0,9,11),'Cliente','WhatsApp','Pediu código de verificação (ref. K7Q2).','(77) •••••-8809'],
    [h(0,8,57),'Provedor','Pagamento','Mercado Pago aprovou o PIX TX-88420511 (R$ 119,99).','#1047'],
    [h(0,8,57),'Sistema','Reserva','Reservado → Pagamento confirmado. 6 peças passaram de reservadas para vendidas.','#1047'],
    [h(0,8,40),'Sistema','Reserva','Reservado → Expirado (prazo esgotado). 3 peças voltaram ao estoque.','#1046 · (77) •••••-4432'],
    [h(0,8,40),'Sistema','Bloqueio','Telefone bloqueado: 3 expirações em 12 dias.','(77) •••••-4501'],
    [h(1,17,5),'Admin','Estoque','Entrada de 6 un. em Dog Club 01. Motivo: "Chegada do fornecedor, NF 3321".','DOG-01'],
    [h(1,16,48),'Admin','Estoque','Ajuste −1 em Teddy Bleu. Motivo: "Peça com defeito de estampa".','TED-BLEU'],
    [h(1,15,2),'Admin','Promoção','Criou "Semana Dog Club" (desconto do produto, 15%).','Promoção pr2'],
    [h(2,18,2),'Admin','Reserva','Aprovou o cancelamento. Motivo: "Cliente vai trocar os itens".','#1039'],
    [h(2,18,2),'Provedor','Pagamento','PIX aprovado depois do encerramento: enviado para análise.','#1039'],
    [h(3,10,12),'Admin','Pagamento','Estornou o pagamento em análise. Motivo: "Cliente preferiu o reembolso".','#1031'],
    [h(3,9,30),'Admin','Bloqueio','Liberou o telefone. Contador de expirações zerado. Motivo: "Cliente explicou por telefone".','(77) •••••-2210'],
    [h(4,20,15),'Sistema','WhatsApp','Conexão com a Z-API caiu; 3 mensagens aguardaram na fila.','—'],
    [h(4,20,19),'Admin','WhatsApp','Reconectou o número pelo QR code. Fila enviada.','—'],
    [h(12,11,0),'Admin','Acesso','Senha alterada. Outros aparelhos desconectados.','—']
  ];
  const $=id=>document.getElementById(id);
  function render(){
    const q=$('q').value.trim().toLowerCase(), a=$('actor').value, ar=$('area').value, dias=+$('period').value;
    const limite=new Date(agora);limite.setDate(limite.getDate()-dias+1);limite.setHours(0,0,0,0);
    const lista=EVENTOS.filter(([d,au,as,txt,ref])=>d>=limite&&(!a||au===a)&&(!ar||as===ar)&&(!q||(txt+' '+ref).toLowerCase().includes(q)));
    $('rows').innerHTML=lista.map(([d,au,as,txt,ref])=>`<tr><td style="white-space:nowrap">${d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',','')}</td><td><span class="badge">${au}</span></td><td>${as}</td><td>${escaparHtml(txt)}</td><td style="white-space:nowrap">${escaparHtml(ref)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Nenhum evento com esses filtros.</td></tr>';
    $('count').textContent=`${lista.length} evento(s). Horários de Brasília.`;
  }
  function escaparHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  ['q','actor','area','period'].forEach(id=>$(id).addEventListener('input',render));
  render();
})();
