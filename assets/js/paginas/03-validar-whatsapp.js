// Validação invertida: a cliente pede o código pelo próprio WhatsApp e digita aqui.
// Regras: código de 6 dígitos, 5 min, 2 tentativas por código, 2 novos códigos; depois, bloqueio de 30 min.
(function(){
  const NUMERO_LOJA='5577998155772';
  const REF='K7Q2'; // referência da tentativa, gerada pelo servidor
  const TEXTO=`Quero meu código da reserva (ref. ${REF})`;
  const LINK=`https://wa.me/${NUMERO_LOJA}?text=${encodeURIComponent(TEXTO)}`;
  let seconds=300, attempts=2, resends=2, timerId=null;

  document.getElementById('askText').textContent=TEXTO;
  document.getElementById('chatAsk').textContent=TEXTO;
  ['askBtn','resendBtn'].forEach(id=>{document.getElementById(id).href=LINK;});

  function iniciarCodigo(){
    document.getElementById('stepAsk').hidden=true;
    document.getElementById('stepCode').hidden=false;
    seconds=300;attempts=2;
    document.getElementById('attempts').textContent='2 tentativas disponíveis';
    clearInterval(timerId);
    timerId=setInterval(()=>{
      seconds=Math.max(0,seconds-1);
      document.getElementById('codeTimer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      if(seconds===0){clearInterval(timerId);toast('Código expirado. Peça um novo código.');}
    },1000);
    document.getElementById('c0').focus();
  }

  // No sistema real, a tela avança sozinha quando o webhook recebe a mensagem.
  document.getElementById('askBtn').addEventListener('click',()=>{
    document.getElementById('waitLine').hidden=false;
    document.getElementById('simulateBtn').hidden=false;
  });
  document.getElementById('simulateBtn').addEventListener('click',()=>{toast('Mensagem recebida. Código enviado no WhatsApp.');iniciarCodigo();});

  const inputs=[...document.querySelectorAll('.code-grid input')];
  inputs.forEach((inp,i)=>inp.addEventListener('input',()=>{inp.value=inp.value.replace(/\D/g,'').slice(0,1);if(inp.value&&inputs[i+1])inputs[i+1].focus();}));

  document.getElementById('validateBtn').addEventListener('click',()=>{
    const code=inputs.map(x=>x.value).join('');
    if(seconds===0)return toast('Código expirado. Peça um novo código.');
    if(attempts===0)return toast('Este código foi bloqueado. Peça um novo código.');
    if(code.length<6)return toast('Digite os 6 dígitos.');
    if(code!=='482193'){
      attempts--;
      document.getElementById('attempts').textContent=attempts?`${attempts} tentativa disponível`:'Código bloqueado';
      return toast(attempts?'Código incorreto.':'Código incorreto. Peça um novo código.');
    }
    toast('WhatsApp validado. Estoque conferido.');
    setTimeout(()=>location.href='04-reserva-ativa.html',700);
  });

  document.getElementById('resendBtn').addEventListener('click',e=>{
    if(resends<=0){e.preventDefault();return toast('Limite de novos códigos atingido. Tente de novo em 30 minutos.');}
    resends--;
    document.getElementById('resends').textContent=`${resends} novo(s) código(s) disponível(is)`;
    inputs.forEach(i=>{i.value='';});
    toast('Envie a mensagem no WhatsApp para receber o novo código.');
    setTimeout(iniciarCodigo,600);
  });
})();
