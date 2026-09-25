// Validação invertida: a cliente pede o código pelo próprio WhatsApp e digita aqui.
// Regras: código de 6 dígitos, 5 min, 2 tentativas por código, 2 novos códigos; depois, bloqueio de 30 min.
(function(){
  const NUMERO_LOJA='5577998155772';
  const REF='K7Q2'; // referência da tentativa, gerada pelo servidor
  const TEXTO=`Quero meu código da reserva (ref. ${REF})`;
  const LINK=`https://wa.me/${NUMERO_LOJA}?text=${encodeURIComponent(TEXTO)}`;
  let seconds=300, attempts=2, resends=2, timerId=null;

  const tel=((Carrinho.ler().dados||{}).telefone||'').replace(/\D/g,'');
  if(tel.length>=10)document.getElementById('maskedPhone').textContent=`(${tel.slice(0,2)}) •••••-${tel.slice(-4)}`;
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
      if(seconds===0){clearInterval(timerId);erroCampo.textContent='Este código venceu. Peça um novo código.';}
    },1000);
    document.getElementById('code').focus();
  }

  // No sistema real, a tela avança sozinha quando o webhook recebe a mensagem.
  document.getElementById('askBtn').addEventListener('click',()=>{
    document.getElementById('waitLine').hidden=false;
    document.getElementById('simulateBtn').hidden=false;
  });
  document.getElementById('simulateBtn').addEventListener('click',()=>{toast('Mensagem recebida. Código enviado no WhatsApp.');iniciarCodigo();});

  // Um campo só: aceita digitar ou colar "482193", "482 193" ou "482-193".
  const campo=document.getElementById('code'), erroCampo=document.getElementById('codeError');
  campo.addEventListener('input',()=>{campo.value=campo.value.replace(/\D/g,'').slice(0,6);erroCampo.textContent='';});
  function erro(msg){erroCampo.textContent=msg;campo.setAttribute('aria-invalid','true');campo.focus();}

  document.getElementById('validateBtn').addEventListener('click',()=>{
    const code=campo.value.replace(/\D/g,'');
    if(seconds===0)return erro('Este código venceu. Peça um novo código.');
    if(attempts===0)return erro('Este código foi bloqueado depois de 2 erros. Peça um novo código.');
    if(code.length<6)return erro('Digite os 6 dígitos do código.');
    if(code!=='482193'){
      attempts--;
      document.getElementById('attempts').textContent=attempts?`${attempts} tentativa disponível`:'Código bloqueado';
      return erro(attempts?'Código incorreto. Resta 1 tentativa com este código.':'Código incorreto. Peça um novo código.');
    }
    campo.removeAttribute('aria-invalid');erroCampo.textContent='';
    toast('WhatsApp validado. Estoque conferido.');
    setTimeout(()=>location.href='04-reserva-ativa.html',700);
  });

  document.getElementById('resendBtn').addEventListener('click',e=>{
    if(resends<=0){e.preventDefault();return toast('Limite de novos códigos atingido. Tente de novo em 30 minutos.');}
    resends--;
    document.getElementById('resends').textContent=`${resends} novo(s) código(s) disponível(is)`;
    campo.value='';erroCampo.textContent='';
    toast('Envie a mensagem no WhatsApp para receber o novo código.');
    setTimeout(iniciarCodigo,600);
  });
})();
