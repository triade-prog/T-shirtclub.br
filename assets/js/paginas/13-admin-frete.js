// Frete: fila de pedidos pagos com motoboy/envio. Cálculo manual, prazo de 2 h para pagar.
(function(){
  const PRAZO_MS=2*60*60*1000;
  const agora=Date.now();
  const min=m=>m*60*1000;
  const pedidos=[
    {id:'#1047',cliente:'Luana A.',modo:'MOTOBOY',destino:'Candeias, Vitória da Conquista',endereco:'Rua das Acácias, 120 · Candeias · Vitória da Conquista/BA',situacao:'AGUARDANDO_CALCULO',frete:null,pagarAte:null},
    {id:'#1043',cliente:'Mariana T.',modo:'ENVIO',destino:'Salvador/BA',endereco:'Av. Sete de Setembro, 1500, ap. 302 · Salvador/BA · CEP 40080-001',situacao:'AGUARDANDO_PAGAMENTO',frete:2890,pagarAte:agora+min(85)},
    {id:'#1041',cliente:'Bruna S.',modo:'MOTOBOY',destino:'Recreio, Vitória da Conquista',endereco:'Rua Maranhão, 45 · Recreio · Vitória da Conquista/BA',situacao:'AGUARDANDO_PAGAMENTO',frete:1200,pagarAte:agora+min(9)},
    {id:'#1036',cliente:'Tainá R.',modo:'ENVIO',destino:'Feira de Santana/BA',endereco:'Rua Castro Alves, 800 · Centro · Feira de Santana/BA · CEP 44001-000',situacao:'VENCIDO',frete:2450,pagarAte:agora-min(40)},
    {id:'#1035',cliente:'Kelly M.',modo:'MOTOBOY',destino:'Brasil, Vitória da Conquista',endereco:'Rua Bahia, 300 · Brasil · Vitória da Conquista/BA',situacao:'PAGO',frete:1000,pagarAte:agora-min(60)}
  ];
  const ROTULOS={AGUARDANDO_CALCULO:['Aguardando cálculo','warning'],AGUARDANDO_PAGAMENTO:['Aguardando pagamento','pink'],VENCIDO:['Prazo vencido','danger'],PAGO:['Frete pago → em preparação','success']};
  const MODOS={MOTOBOY:'Motoboy',ENVIO:'Envio para outra cidade'};
  let current=null;

  const hora=ts=>new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  function restante(ts){
    const ms=ts-Date.now(); if(ms<=0)return null;
    const h=Math.floor(ms/3600000), m=Math.floor(ms%3600000/60000), s=Math.floor(ms%60000/1000);
    return `${h}h${String(m).padStart(2,'0')}m${String(s).padStart(2,'0')}s`;
  }

  function render(){
    // Vence automaticamente quem passou do prazo (no sistema real, job a cada minuto).
    pedidos.forEach(p=>{if(p.situacao==='AGUARDANDO_PAGAMENTO'&&p.pagarAte<=Date.now())p.situacao='VENCIDO';});
    const f=document.getElementById('filterStatus').value;
    document.getElementById('freightRows').innerHTML=pedidos.filter(p=>!f||p.situacao===f).map(p=>{
      const [txt,cls]=ROTULOS[p.situacao];
      let prazo='—';
      if(p.situacao==='AGUARDANDO_PAGAMENTO')prazo=`<span class="countdown" data-until="${p.pagarAte}">${restante(p.pagarAte)}</span><div class="muted">até ${hora(p.pagarAte)}</div>`;
      if(p.situacao==='VENCIDO')prazo=`<span class="muted">venceu às ${hora(p.pagarAte)}</span>`;
      let acao='';
      if(p.situacao==='AGUARDANDO_CALCULO')acao=`<button class="btn" type="button" data-quote="${p.id}">Calcular</button>`;
      if(p.situacao==='VENCIDO')acao=`<button class="btn secondary" type="button" data-quote="${p.id}">Recalcular</button>`;
      if(p.situacao==='AGUARDANDO_PAGAMENTO')acao=`<button class="btn ghost" type="button" data-quote="${p.id}">Corrigir valor</button>`;
      return `<tr><td><strong>${p.id}</strong></td><td>${escaparHtml(p.cliente)}</td><td>${MODOS[p.modo]}</td><td>${escaparHtml(p.destino)}</td>
        <td class="num">${p.frete==null?'—':reais(p.frete)}</td><td><span class="badge ${cls}">${txt}</span></td><td>${prazo}</td><td>${acao}</td></tr>`;
    }).join('')||'<tr><td colspan="8" class="muted">Nenhum pedido nesta situação.</td></tr>';
    const conta=s=>pedidos.filter(p=>p.situacao===s).length;
    document.getElementById('stats').innerHTML=[
      [conta('AGUARDANDO_CALCULO'),'aguardando cálculo'],[conta('AGUARDANDO_PAGAMENTO'),'aguardando pagamento'],
      [conta('VENCIDO'),'prazo vencido'],[conta('PAGO'),'frete pago hoje']
    ].map(([v,l])=>`<div class="stat"><div class="value">${v}</div><div class="label">${l}</div></div>`).join('');
  }

  function preview(){
    const limite=Date.now()+PRAZO_MS;
    document.getElementById('quotePreview').innerHTML=`Ao enviar, a cliente recebe no WhatsApp o valor e o link de pagamento, e tem até <strong>${hora(limite)}</strong> (2 horas) para pagar.${current&&current.frete!=null?' A cotação anterior é substituída e registrada na auditoria.':''}`;
  }

  document.getElementById('freightRows').addEventListener('click',e=>{
    const id=e.target.dataset&&e.target.dataset.quote; if(!id)return;
    current=pedidos.find(p=>p.id===id);
    document.getElementById('quoteTitle').textContent=`${current.frete==null?'Informar':'Recalcular'} frete · ${current.id}`;
    document.getElementById('quoteOrder').innerHTML=`${escaparHtml(current.cliente)}<br>${MODOS[current.modo]}<br>Produtos já pagos`;
    document.getElementById('quoteAddress').textContent=current.endereco;
    document.getElementById('qValor').value=current.frete==null?'':(current.frete/100).toFixed(2).replace('.',',');
    document.getElementById('qPrazoField').hidden=current.modo!=='ENVIO';
    document.getElementById('qPrazo').value='';
    document.getElementById('qObs').value='';
    preview();
    document.getElementById('quoteModal').classList.add('open');
  });

  document.getElementById('quoteForm').addEventListener('submit',e=>{
    e.preventDefault();
    const valor=Math.round(parseFloat(document.getElementById('qValor').value.replace(/\./g,'').replace(',','.'))*100);
    if(!(valor>0))return toast('Informe um valor de frete maior que zero.');
    if(current.modo==='ENVIO'&&!(parseInt(document.getElementById('qPrazo').value,10)>0))return toast('Informe o prazo estimado de entrega.');
    current.frete=valor;current.situacao='AGUARDANDO_PAGAMENTO';current.pagarAte=Date.now()+PRAZO_MS;
    document.getElementById('quoteModal').classList.remove('open');
    render();
    toast(`Frete de ${reais(valor)} enviado no WhatsApp. Prazo até ${hora(current.pagarAte)}.`);
  });
  document.getElementById('closeQuote').addEventListener('click',()=>document.getElementById('quoteModal').classList.remove('open'));
  document.getElementById('filterStatus').addEventListener('input',render);

  // Atualiza só os contadores; a tabela inteira é redesenhada apenas quando algum prazo vence.
  function tick(){
    if(pedidos.some(p=>p.situacao==='AGUARDANDO_PAGAMENTO'&&p.pagarAte<=Date.now()))return render();
    document.querySelectorAll('.countdown[data-until]').forEach(el=>{el.textContent=restante(+el.dataset.until)||'vencido';});
  }

  render();
  setInterval(tick,1000);
})();
