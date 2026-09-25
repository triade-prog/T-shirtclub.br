// Pagamentos em análise: aprovados fora do prazo. Resolução por estorno ou conversão em novo pedido.
(function(){
  const MOTIVOS={
    APROVADO_APOS_TOLERANCIA:'Aprovado após a tolerância',
    RESERVA_ENCERRADA:'Reserva já encerrada'
  };
  const casos=[
    {id:'c1',reserva:'#1044',cliente:'Carla D.',telefone:'(77) •••••-3310',motivo:'APROVADO_APOS_TOLERANCIA',valor:11976,transacao:'TX-88412077',situacao:'ABERTA',
      itens:[{produto:'p1',qtd:1},{produto:'p4',qtd:1},{produto:'p5',qtd:1}],
      linha:[['22:00:00','Reserva criada','Expira às 22:15:00.'],['22:14:40','Tentativa de pagamento registrada','Antes do prazo: tolerância até 22:20:00.'],
             ['22:20:00','Reserva expirada','Provedor consultado: ainda pendente. Estoque liberado.'],['22:21:12','Provedor aprovou o pagamento','Fora da tolerância: enviado para análise.']]},
    {id:'c2',reserva:'#1039',cliente:'Júlia F.',telefone:'(77) •••••-7021',motivo:'RESERVA_ENCERRADA',valor:9980,transacao:'TX-88409312',situacao:'ABERTA',
      itens:[{produto:'p6',qtd:2}],
      linha:[['17:50:00','Reserva criada','Expira às 18:05:00.'],['17:58:30','Cancelamento solicitado','Pela cliente.'],['17:59:10','Tentativa de pagamento registrada','Cobrança gerada.'],
             ['18:02:00','Cancelamento aprovado','Reserva encerrada; cobrança cancelada no provedor.'],['18:02:40','Provedor aprovou o pagamento','Chegou depois do encerramento: análise.']]},
    {id:'c3',reserva:'#1031',cliente:'Rita L.',telefone:'(77) •••••-5520',motivo:'APROVADO_APOS_TOLERANCIA',valor:4999,transacao:'TX-88390011',situacao:'RESOLVIDA',
      itens:[{produto:'p3',qtd:1}],resolucao:'Estornado em 24/09 às 10:12 por Carol (admin): "Cliente preferiu o reembolso."',
      linha:[['09:40:00','Reserva criada',''],['09:55:00','Reserva expirada','Sem tentativa pendente.'],['09:58:20','Provedor aprovou o pagamento','Análise aberta.']]}
  ];
  let selected=casos[0];

  function checagemEstoque(c){
    return c.itens.map(i=>{
      const p=produtoPorId(i.produto);
      return {nome:p.nome,qtd:i.qtd,ok:disponivel(p)>=i.qtd,disp:disponivel(p)};
    });
  }

  function renderList(){
    const f=document.getElementById('filterCase').value;
    document.getElementById('caseRows').innerHTML=casos.filter(c=>!f||c.situacao===f).map(c=>`
      <tr data-case="${c.id}" style="cursor:pointer;${c===selected?'background:var(--soft)':''}">
        <td><strong>${c.reserva}</strong></td><td>${escaparHtml(c.cliente)}</td>
        <td><span class="badge warning">${MOTIVOS[c.motivo]}</span></td>
        <td class="num">${reais(c.valor)}</td>
        <td>${c.situacao==='ABERTA'?'<span class="badge pink">Aberto</span>':'<span class="badge success">Resolvido</span>'}</td>
      </tr>`).join('')||'<tr><td colspan="5" class="muted">Nenhum caso.</td></tr>';
  }

  function renderDetail(){
    const c=selected, el=document.getElementById('detail');
    if(!c){el.innerHTML='<p class="muted">Selecione um caso.</p>';return;}
    const estoque=checagemEstoque(c), tudoOk=estoque.every(x=>x.ok);
    const linha=c.linha.map(([h,t,d],i)=>`<div class="timeline-item"><div><div class="timeline-dot"></div>${i<c.linha.length-1?'<div class="timeline-line"></div>':''}</div><div class="timeline-copy"><strong>${h} • ${t}</strong>${d?`<div class="muted">${d}</div>`:''}</div></div>`).join('');
    const acoes=c.situacao==='RESOLVIDA'
      ?`<div class="notice">${escaparHtml(c.resolucao)}</div>`
      :`<div class="field"><label for="reviewReason">Motivo da decisão</label><textarea id="reviewReason" placeholder="Obrigatório. Ex.: conversei com a cliente pelo WhatsApp"></textarea></div>
        <div class="toolbar" style="margin-top:12px">
          <button class="btn danger" type="button" id="refundBtn">Estornar pagamento</button>
          <button class="btn" type="button" id="convertBtn" ${tudoOk?'':'disabled'}>Converter em novo pedido</button>
        </div>
        <p class="hint">${tudoOk?'Converter cria uma nova reserva, com novo número, direto em Pagamento confirmado. A reserva '+c.reserva+' continua Expirada.':'Conversão indisponível: falta estoque para pelo menos um item. Só é possível estornar.'}</p>
        <p class="hint"><span class="badge">Pendente de aprovação: D6</span> Se a decisão for "só estornar", o botão de conversão sai.</p>`;
    el.innerHTML=`
      <div class="row"><h2>${c.reserva} · ${escaparHtml(c.cliente)}</h2><span class="badge danger">EXPIRADO</span></div>
      <p class="muted">${c.telefone} · Transação ${c.transacao} · ${reais(c.valor)}</p>
      <div class="notice warn">${MOTIVOS[c.motivo]}. O pagamento está aprovado no provedor, mas não confirma a reserva.</div>
      <h3 style="margin-top:16px">Linha do tempo</h3><div class="timeline">${linha}</div>
      <h3>Estoque atual para conversão</h3>
      <ul class="checklist">${estoque.map(x=>`<li><span class="${x.ok?'ok':'no'}">${x.ok?'✓':'✕'}</span>${escaparHtml(x.nome)} ×${x.qtd} <span class="muted">(${x.disp} disponível)</span></li>`).join('')}</ul>
      <div class="sep"></div>${acoes}`;
    if(c.situacao==='ABERTA'){
      document.getElementById('refundBtn').addEventListener('click',()=>resolve('ESTORNAR'));
      document.getElementById('convertBtn').addEventListener('click',()=>resolve('CONVERTER'));
    }
  }

  function resolve(tipo){
    const motivo=document.getElementById('reviewReason').value.trim();
    if(!motivo)return toast('Informe o motivo para registrar a decisão.');
    const c=selected;
    c.situacao='RESOLVIDA';
    if(tipo==='CONVERTER'){
      c.itens.forEach(i=>{produtoPorId(i.produto).vendido+=i.qtd;});
      c.resolucao=`Convertido no pedido #1049 (Pagamento confirmado) por você: "${motivo}"`;
      toast('Pedido #1049 criado em Pagamento confirmado. Cliente notificada no WhatsApp.');
    }else{
      c.resolucao=`Estorno solicitado ao provedor por você: "${motivo}"`;
      toast('Estorno solicitado ao provedor. Cliente notificada no WhatsApp.');
    }
    renderList();renderDetail();
  }

  document.getElementById('caseRows').addEventListener('click',e=>{
    const tr=e.target.closest('tr[data-case]'); if(!tr)return;
    selected=casos.find(c=>c.id===tr.dataset.case);renderList();renderDetail();
  });
  document.getElementById('filterCase').addEventListener('input',()=>{
    const f=document.getElementById('filterCase').value;
    if(selected&&f&&selected.situacao!==f)selected=casos.find(c=>c.situacao===f)||null;
    renderList();renderDetail();
  });

  renderList();renderDetail();
})();
