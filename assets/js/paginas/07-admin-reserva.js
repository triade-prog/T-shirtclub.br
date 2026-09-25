// Detalhe da reserva. "Marcar como entregue" só é liberado quando:
// estado = Pagamento confirmado, substatus pronto/saiu/enviado e frete quitado (quando houver).
(function(){
  const SUBSTATUS_PRONTOS=['PRONTO_PARA_RETIRADA','SAIU_PARA_ENTREGA','ENVIADO'];
  const base=[['22:48','Reserva criada','WhatsApp validado, estoque conferido e 3 peças bloqueadas.'],
              ['22:48','WhatsApp notificado','Número #1048, produtos, total, horário de expiração e link enviados.']];
  const cenarios={
    RESERVADO:{estado:'RESERVADO',badge:'success',extra:['Cancelamento solicitado','warning'],substatus:null,
      reserva:'Expira às 23:03<br>3 itens',pag:['Aguardando','R$ 119,76<br>Nenhuma confirmação ainda'],
      linha:[['22:53','Cancelamento solicitado','Aguardando decisão administrativa.']]},
    PAGO_PREPARACAO:{estado:'PAGAMENTO CONFIRMADO',badge:'',extra:['Em preparação',''],substatus:'EM_PREPARACAO',
      reserva:'Cronômetro encerrado<br>3 itens',pag:['Confirmado às 22:58','R$ 119,76<br>Transação TX-88420511'],
      linha:[['22:58','Pagamento confirmado','Unidades passaram de reservadas para vendidas.'],['23:05','Retirada confirmada pela cliente','Sem frete.']]},
    PAGO_PRONTO:{estado:'PAGAMENTO CONFIRMADO',badge:'',extra:['Pronto para retirada','citron'],substatus:'PRONTO_PARA_RETIRADA',
      reserva:'Cronômetro encerrado<br>3 itens',pag:['Confirmado às 22:58','R$ 119,76<br>Transação TX-88420511'],
      linha:[['22:58','Pagamento confirmado','Unidades passaram de reservadas para vendidas.'],['23:05','Retirada confirmada pela cliente','Sem frete.'],['09:10','Pronto para retirada','Cliente avisada no WhatsApp.']]},
    ENTREGUE:{estado:'ENTREGUE',badge:'',extra:null,substatus:null,final:['Pedido entregue','Retirado em 25/09 às 10:32. Confirmado por Carol (admin). Estado final.'],
      reserva:'Encerrada<br>3 itens',pag:['Confirmado às 22:58','R$ 119,76<br>Transação TX-88420511'],
      linha:[['22:58','Pagamento confirmado',''],['09:10','Pronto para retirada',''],['10:32','Entregue','Confirmado por Carol (admin).']]},
    EXPIRADO:{estado:'EXPIRADO',badge:'danger',extra:null,substatus:null,final:['Reserva expirada','Prazo esgotado às 23:03 sem pagamento. Estoque liberado. Estado final: não pode ser reativada.'],
      reserva:'Expirou às 23:03<br>3 itens',pag:['Não pago','R$ 119,76'],
      linha:[['22:53','Cancelamento solicitado',''],['23:03','Reserva expirada','Solicitação de cancelamento encerrada como prejudicada. Estoque liberado.']]}
  };
  let atual;

  function condicoes(c){
    const pago=c.estado==='PAGAMENTO CONFIRMADO';
    return [
      [pago,'Pagamento confirmado'],
      [pago&&SUBSTATUS_PRONTOS.includes(c.substatus),'Pronto para retirada, saiu para entrega ou enviado'],
      [pago,'Frete quitado ou não exigido (retirada)']
    ];
  }

  function render(){
    const c=atual;
    document.getElementById('badges').innerHTML=`<span class="badge ${c.badge}">${c.estado}</span>`+(c.extra?`<span class="badge ${c.extra[1]}">${c.extra[0]}</span>`:'');
    document.getElementById('reserveInfo').innerHTML=c.reserva;
    document.getElementById('payTitle').textContent=c.pag[0];
    document.getElementById('payInfo').innerHTML=c.pag[1];
    document.getElementById('cancelSection').hidden=c.estado!=='RESERVADO';
    document.getElementById('fulfillSection').hidden=c.estado!=='PAGAMENTO CONFIRMADO';
    document.getElementById('closedSection').hidden=!c.final;
    if(c.final){document.getElementById('closedTitle').textContent=c.final[0];document.getElementById('closedText').textContent=c.final[1];}
    if(c.substatus)document.getElementById('substatus').value=c.substatus;

    const conds=condicoes(c), liberado=conds.every(x=>x[0]);
    const btn=document.getElementById('markDelivered');
    btn.disabled=!liberado;
    btn.hidden=c.estado==='ENTREGUE';
    document.getElementById('deliverGuard').innerHTML=c.estado==='ENTREGUE'||c.estado==='EXPIRADO'?'':
      `<ul class="checklist">${conds.map(([ok,t])=>`<li><span class="${ok?'ok':'no'}">${ok?'✓':'✕'}</span>${t}</li>`).join('')}</ul>`;

    const itens=base.concat(c.linha);
    document.getElementById('timeline').innerHTML=itens.map(([h,t,d],i)=>`<div class="timeline-item"><div><div class="timeline-dot"></div>${i<itens.length-1?'<div class="timeline-line"></div>':''}</div><div class="timeline-copy"><strong>${h} • ${t}</strong>${d?`<div class="muted">${d}</div>`:''}</div></div>`).join('');
  }

  function carregar(nome){atual=JSON.parse(JSON.stringify(cenarios[nome]));render();}

  document.getElementById('scenario').addEventListener('input',e=>carregar(e.target.value));

  document.getElementById('substatus').addEventListener('input',e=>{
    atual.substatus=e.target.value;
    atual.extra=e.target.value==='PRONTO_PARA_RETIRADA'?['Pronto para retirada','citron']:['Em preparação',''];
    render();toast('Substatus atualizado. Cliente avisada no WhatsApp.');
  });

  function decide(type){
    const reason=document.getElementById('reason').value.trim();
    if(!reason)return toast('Informe o motivo/observação para registrar a decisão.');
    if(type==='approve'){
      atual=Object.assign(JSON.parse(JSON.stringify(cenarios.EXPIRADO)),{
        final:['Cancelamento aprovado','Reserva encerrada com motivo "cancelamento aprovado". Estoque liberado. Não entra no contador de bloqueio.'],
        reserva:'Encerrada às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'<br>3 itens',
        linha:[['22:53','Cancelamento solicitado',''],['agora','Cancelamento aprovado',reason]]});
      render();toast('Cancelamento aprovado e estoque liberado.');
    }else{
      atual.extra=null;atual.linha.push(['agora','Cancelamento recusado',reason]);
      render();toast('Cancelamento recusado. A reserva segue válida no prazo original.');
    }
  }
  document.getElementById('approveCancel').addEventListener('click',()=>decide('approve'));
  document.getElementById('denyCancel').addEventListener('click',()=>decide('deny'));

  const modal=document.getElementById('deliverModal');
  document.getElementById('markDelivered').addEventListener('click',()=>{
    if(document.getElementById('markDelivered').disabled)return;
    modal.classList.add('open');
  });
  document.getElementById('closeDeliver').addEventListener('click',()=>modal.classList.remove('open'));
  document.getElementById('confirmDeliver').addEventListener('click',()=>{
    const nota=document.getElementById('deliverNote').value.trim();
    atual=Object.assign(JSON.parse(JSON.stringify(cenarios.ENTREGUE)),{
      final:['Pedido entregue','Confirmado agora por você.'+(nota?' Observação: '+nota:'')+' Estado final.']});
    modal.classList.remove('open');render();
    toast('Pedido marcado como Entregue e registrado na auditoria.');
  });

  carregar('RESERVADO');
})();
