// Reserva ativa: cronômetro do servidor (simulado), pagamento por PIX ou cartão com a forma travada
// na primeira cobrança, tolerância de 5 min para cobrança pendente e expiração.
(function(){
  const PRAZO=900, TOLERANCIA=300;
  const total=MotorPreco.calcular(Carrinho.itens(Carrinho.ler()),Carrinho.ler().cupom).total;
  let restante=PRAZO, tolerancia=null, cobranca=null, formaTravada=null, encerrada=false, lembrete=false;

  const $=id=>document.getElementById(id);
  const mmss=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  $('pixAmount').textContent=reais(total);
  $('cardAmount').textContent=reais(total);
  const fim=new Date(Date.now()+PRAZO*1000);
  $('expiresAt').textContent=`expira às ${fim.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;

  function status(tipo,html){const b=$('payStatus');b.hidden=!html;b.className='status-box '+(tipo||'');b.innerHTML=html||'';}
  function forma(){return document.querySelector('input[name=method]:checked').value;}

  function mostrarForma(){
    const f=forma(), podeNova=!encerrada&&tolerancia===null&&(!cobranca||cobranca.status==='RECUSADO');
    $('pixStart').hidden=f!=='PIX'||!podeNova;
    $('pixBox').hidden=f!=='PIX'||!cobranca||cobranca.status!=='PENDENTE';
    $('cardBox').hidden=f!=='CARTAO'||!podeNova;
    document.querySelectorAll('input[name=method]').forEach(r=>{r.disabled=!!formaTravada&&r.value!==formaTravada;});
  }

  function travar(f){
    if(!formaTravada){formaTravada=f;}
    mostrarForma();
  }

  function qrFalso(){
    let h='';for(let i=0;i<625;i++){const r=Math.floor(i/25),c=i%25;const canto=(r<7&&c<7)||(r<7&&c>17)||(r>17&&c<7);
      const on=canto?(r%6===0||c%6===0||[r,c].every(v=>v%25>1&&v%25<5)||(c>17&&(c===18||c===24))||(r>17&&(r===18||r===24))||(c>19&&c<23&&r>1&&r<5)||(r>19&&r<23&&c>1&&c<5)):Math.random()<.5;
      h+=`<span style="background:${on?'#161616':'#fff'}"></span>`;}
    return `<div class="qr" role="img" aria-label="QR code de exemplo">${h}</div>`;
  }

  $('genPix').addEventListener('click',()=>{
    if(encerrada)return;
    cobranca={forma:'PIX',status:'PENDENTE',criadaEm:restante};
    $('pixCode').textContent='00020126580014BR.GOV.BCB.PIX0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986540'+(total/100).toFixed(2)+'5802BR5913T-SHIRT CLUB6009SAO PAULO62070503***6304ABCD';
    $('qrBox').innerHTML=qrFalso();
    travar('PIX');
    status('wait','<span class="spinner" aria-hidden="true"></span><strong>Aguardando o pagamento.</strong> Esta tela atualiza sozinha quando o banco confirmar.');
  });

  $('copyPix').addEventListener('click',()=>{
    const txt=$('pixCode').textContent;
    const ok=()=>toast('Código PIX copiado. Agora cole no app do seu banco.');
    if(navigator.clipboard)navigator.clipboard.writeText(txt).then(ok,ok);else ok();
  });

  function luhn(n){let s=0,alt=false;for(let i=n.length-1;i>=0;i--){let d=+n[i];if(alt){d*=2;if(d>9)d-=9;}s+=d;alt=!alt;}return s%10===0;}
  $('cNumber').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,16).replace(/(\d{4})(?=\d)/g,'$1 ');});
  $('cExp').addEventListener('input',e=>{const d=e.target.value.replace(/\D/g,'').slice(0,4);e.target.value=d.length>2?d.slice(0,2)+'/'+d.slice(2):d;});
  $('cardBox').addEventListener('submit',e=>{
    e.preventDefault();
    if(encerrada)return;
    const n=$('cNumber').value.replace(/\D/g,''), exp=$('cExp').value, cvv=$('cCvv').value.replace(/\D/g,'');
    if(n.length<13||!luhn(n))return toast('Confira o número do cartão.');
    if(!$('cName').value.trim())return toast('Informe o nome impresso no cartão.');
    const [mm,aa]=exp.split('/').map(Number);
    if(!(mm>=1&&mm<=12&&aa>=26))return toast('Confira a validade do cartão (MM/AA).');
    if(cvv.length<3)return toast('Confira o CVV.');
    cobranca={forma:'CARTAO',status:'PENDENTE',criadaEm:restante};
    travar('CARTAO');
    status('wait','<span class="spinner" aria-hidden="true"></span><strong>Processando o cartão…</strong>');
  });

  function aprovar(){
    if(!cobranca||cobranca.status!=='PENDENTE')return toast('Não há cobrança aguardando. Gere o PIX ou envie o cartão primeiro.');
    cobranca.status='APROVADO';encerrada=true;
    try{localStorage.setItem('prototipo-reserva-status',JSON.stringify({estado:'PAGO',forma:cobranca.forma,total,pagoEm:new Date().toISOString(),modalidade:(Carrinho.ler().dados||{}).entrega||'Retirada'}));}catch(e){}
    status('ok','<strong>Pagamento confirmado!</strong> Abrindo o seu pedido…');
    $('stateBadge').textContent='PAGAMENTO CONFIRMADO';
    setTimeout(()=>location.href='19-pedido.html',900);
  }
  function recusar(){
    if(!cobranca||cobranca.status!=='PENDENTE')return toast('Não há cobrança aguardando.');
    cobranca.status='RECUSADO';
    const f=cobranca.forma==='PIX'?'Gere um novo código PIX':'Tente de novo com outro cartão';
    status('bad',`<strong>Pagamento não aprovado.</strong> ${tolerancia===null?f+'. Esta reserva aceita só '+(cobranca.forma==='PIX'?'PIX':'cartão')+'.':'O prazo acabou, então não é possível tentar de novo.'}`);
    if(tolerancia!==null)expirar('Pagamento não aprovado dentro da tolerância.');
    mostrarForma();
  }

  function expirar(motivo){
    encerrada=true;
    $('timerLabel').textContent='Reserva encerrada';$('reserveTimer').textContent='00:00';
    $('stateBadge').className='badge danger';$('stateBadge').textContent='EXPIRADO';
    $('paymentNotice').className='notice danger';
    $('paymentNotice').innerHTML=`<strong>Reserva expirada.</strong> ${motivo} As peças voltaram ao estoque. <a href="01-loja.html"><strong>Fazer nova reserva</strong></a>`;
    try{localStorage.setItem('prototipo-reserva-status',JSON.stringify({estado:'EXPIRADO',total}));}catch(e){}
    mostrarForma();
  }

  function tick(){
    if(encerrada)return;
    if(tolerancia!==null){
      tolerancia--;$('reserveTimer').textContent=mmss(Math.max(0,tolerancia));
      $('reserveProgress').style.width=`${tolerancia/TOLERANCIA*100}%`;
      if(tolerancia<=0)expirar('O pagamento não foi confirmado a tempo. Se o banco ainda aprovar, a loja analisa e entra em contato.');
      return;
    }
    restante--;
    $('reserveTimer').textContent=mmss(Math.max(0,restante));
    $('reserveProgress').style.width=`${restante/PRAZO*100}%`;
    if(restante<=300&&!lembrete){lembrete=true;toast('Lembrete enviado no WhatsApp: faltam 5 minutos.');}
    if(restante<=0){
      if(cobranca&&cobranca.status==='PENDENTE'){
        tolerancia=TOLERANCIA;
        $('timerLabel').textContent='Pagamento em processamento';
        $('paymentNotice').className='notice warn';
        $('paymentNotice').innerHTML='<strong>O prazo terminou, mas recebemos sua tentativa de pagamento.</strong> Aguardamos a confirmação do banco por até 5 minutos. Não é possível iniciar um novo pagamento.';
        mostrarForma();
      }else expirar('O prazo de 15 minutos terminou sem pagamento.');
    }
  }
  setInterval(tick,1000);

  document.querySelectorAll('input[name=method]').forEach(r=>r.addEventListener('change',mostrarForma));
  $('simApprove').addEventListener('click',aprovar);
  $('simRefuse').addEventListener('click',recusar);
  $('simJump').addEventListener('click',()=>{if(tolerancia!==null)tolerancia=Math.min(tolerancia,3);else restante=Math.min(restante,3);toast('Pulando para o fim do prazo…');});

  const modal=$('cancelModal');
  $('cancelBtn').addEventListener('click',()=>{if(encerrada)return toast('A reserva já foi encerrada.');modal.classList.add('open');});
  $('closeCancel').addEventListener('click',()=>modal.classList.remove('open'));
  $('confirmCancel').addEventListener('click',()=>{modal.classList.remove('open');$('cancelBtn').disabled=true;$('cancelBtn').textContent='Cancelamento solicitado';toast('Solicitação enviada. O cronômetro continua correndo.');});

  try{localStorage.removeItem('prototipo-reserva-status');}catch(e){}
  mostrarForma();
})();
