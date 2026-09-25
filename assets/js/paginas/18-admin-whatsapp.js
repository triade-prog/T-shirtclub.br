// WhatsApp: estado da conexão Z-API (com QR code para reconectar), fila de envio e liga/desliga das notificações.
(function(){
  const NUMERO='(77) 99815-5772';
  let conectado=true;
  const fila={pendentes:0,enviadasHoje:84,falhas:1};

  const NOTIFICACOES=[
    ['Código de verificação','Quando a cliente pede o código pelo WhatsApp',true],
    ['Reserva criada','Ao criar a reserva, com itens, total, horário de expiração e link',true],
    ['Lembrete de 5 minutos','Quando faltam 5 minutos para expirar',true],
    ['Pagamento confirmado','Quando o provedor confirma o pagamento',true],
    ['Reserva expirada','Quando o prazo termina sem pagamento',true],
    ['Cancelamento recebido','Quando a cliente pede cancelamento',false],
    ['Decisão do cancelamento','Quando o admin aprova ou recusa',false],
    ['Pagamento em análise','Quando o pagamento chega fora do prazo',false],
    ['Modalidade de entrega confirmada','Depois que a cliente confirma retirada, motoboy ou envio',false],
    ['Frete calculado','Com o valor e o prazo de 2 horas para pagar',false],
    ['Pronto para retirada','Quando o admin marca o pedido como pronto',false],
    ['Saiu para entrega / enviado','Quando o admin marca a saída',false],
    ['Pedido entregue','Quando o admin confirma a entrega',false],
    ['Bloqueio e desbloqueio do telefone','Quando o telefone é bloqueado, liberado ou mantido bloqueado',false]
  ];
  const ligadas=NOTIFICACOES.map(()=>true);

  // QR code ilustrativo: no sistema real, a imagem vem da Z-API e expira em poucos segundos.
  function qrFalso(){
    let cells='';
    for(let i=0;i<21*21;i++){const r=Math.floor(i/21),c=i%21;const canto=(r<7&&c<7)||(r<7&&c>13)||(r>13&&c<7);
      const on=canto?((r%6===0||c%6===0||(r>1&&r<5&&c>1&&c<5)||(c>13&&(c-14)%6===0)||(r>13&&(r-14)%6===0)||(c>15&&c<19&&r>1&&r<5)||(r>15&&r<19&&c>1&&c<5))):Math.random()<.45;
      cells+=`<span style="background:${on?'var(--ink)':'#fff'}"></span>`;}
    return `<div aria-label="QR code de exemplo" role="img" style="display:grid;grid-template-columns:repeat(21,1fr);width:189px;height:189px;border:8px solid #fff;outline:1px solid var(--line);margin:12px 0">${cells}</div>`;
  }

  function renderConexao(){
    const el=document.getElementById('connCard');
    el.innerHTML=conectado
      ?`<div class="row"><h2>Conexão</h2><span class="badge success">Conectado</span></div>
        <p class="muted">Número ${NUMERO} · Z-API · conectado desde hoje às 08:10. O sistema confere a conexão a cada minuto.</p>
        <button class="btn ghost" type="button" id="simDrop">Protótipo: simular queda da conexão</button>`
      :`<div class="row"><h2>Conexão</h2><span class="badge danger">Desconectado</span></div>
        <div class="notice danger">As mensagens estão paradas na fila e a validação por WhatsApp está indisponível no site. Reconecte o número.</div>
        ${qrFalso()}
        <ol class="muted" style="padding-left:18px;margin:0 0 12px"><li>No celular da loja, abra o WhatsApp Business.</li><li>Toque em Configurações › Dispositivos conectados › Conectar dispositivo.</li><li>Aponte a câmera para este código.</li></ol>
        <div class="toolbar"><button class="btn" type="button" id="simScan">Protótipo: já escaneei</button><button class="btn secondary" type="button" id="newQr">Gerar novo código</button></div>`;
    renderFila();
  }

  function renderFila(){
    document.getElementById('queueStats').innerHTML=[[fila.pendentes,'na fila'],[fila.enviadasHoje,'enviadas hoje'],[fila.falhas,'falhas hoje']]
      .map(([v,l])=>`<div class="stat"><div class="value">${v}</div><div class="label">${l}</div></div>`).join('');
  }

  function renderNotificacoes(){
    document.getElementById('notifRows').innerHTML=NOTIFICACOES.map(([nome,quando,essencial],i)=>`
      <tr><td><strong>${nome}</strong>${essencial?' <span class="badge citron">Essencial</span>':''}</td><td class="muted">${quando}</td>
      <td>${essencial?'<span class="muted">Sempre ligada</span>':`<label class="switch"><input type="checkbox" data-n="${i}" ${ligadas[i]?'checked':''}> ${ligadas[i]?'Ligada':'Desligada'}</label>`}</td></tr>`).join('');
  }

  document.getElementById('connCard').addEventListener('click',e=>{
    const id=e.target.id;
    if(id==='simDrop'){conectado=false;fila.pendentes=3;renderConexao();toast('Conexão perdida. Alerta enviado ao painel.');}
    if(id==='simScan'){conectado=true;fila.enviadasHoje+=fila.pendentes;fila.pendentes=0;renderConexao();toast('Número reconectado. 3 mensagens da fila enviadas.');}
    if(id==='newQr')renderConexao();
  });
  document.getElementById('notifRows').addEventListener('change',e=>{
    const i=e.target.dataset.n; if(i===undefined)return;
    ligadas[+i]=e.target.checked;renderNotificacoes();
    toast(`"${NOTIFICACOES[+i][0]}" ${e.target.checked?'ligada':'desligada'}. Registrado na auditoria.`);
  });
  // Modo lançamento: com 50 clientes ao mesmo tempo saem ~200 mensagens em 20 min; o ritmo normal não daria conta.
  document.getElementById('launchMode').addEventListener('change',e=>{
    const on=e.target.checked;
    document.getElementById('gapMin').value=on?2:4;document.getElementById('gapMax').value=on?4:9;document.getElementById('perHour').value=on?600:120;
    document.getElementById('launchHint').textContent=on?'Ligado: 2 a 4 s entre mensagens, até 600 por hora. Desligue depois do lançamento.':'Desligado: 4 a 9 s entre mensagens, até 120 por hora.';
    toast(on?'Modo lançamento ligado. Registrado na auditoria.':'Modo lançamento desligado.');
  });
  document.getElementById('saveRate').addEventListener('click',()=>{
    const a=+document.getElementById('gapMin').value, b=+document.getElementById('gapMax').value, h=+document.getElementById('perHour').value;
    if(!(a>=2&&b>a))return toast('O intervalo máximo precisa ser maior que o mínimo, e o mínimo de pelo menos 2 segundos.');
    if(!(h>=10))return toast('Informe pelo menos 10 mensagens por hora.');
    toast('Ritmo de envio salvo.');
  });
  document.getElementById('testForm').addEventListener('submit',e=>{
    e.preventDefault();
    const n=document.getElementById('testPhone').value.replace(/\D/g,'');
    if(n.length<10)return toast('Informe o número com DDD.');
    if(!conectado)return toast('Número desconectado. A mensagem de teste ficou na fila.');
    toast('Mensagem de teste enviada.');
  });

  renderConexao();renderNotificacoes();
})();
