// Login administrativo: senha + segundo fator. Protótipo: qualquer senha com 8+ caracteres
// é aceita, exceto "errada", que simula falha para mostrar o limite de tentativas.
(function(){
  const MAX_ATTEMPTS=5;
  let failures=0;
  const stepPassword=document.getElementById('stepPassword');
  const stepMfa=document.getElementById('stepMfa');
  const hint=document.getElementById('attemptsHint');

  stepPassword.addEventListener('submit',e=>{
    e.preventDefault();
    const email=document.getElementById('email').value.trim();
    const password=document.getElementById('password').value;
    if(!email||!password)return toast('Informe e-mail e senha.');
    if(failures>=MAX_ATTEMPTS)return toast('Acesso bloqueado por 15 minutos.');
    if(password.length<8||password==='errada'){
      failures++;
      const left=MAX_ATTEMPTS-failures;
      hint.textContent=left>0?`E-mail ou senha incorretos. ${left} tentativa(s) antes do bloqueio de 15 minutos.`:'Acesso bloqueado por 15 minutos. Tentativa registrada na auditoria.';
      return toast('E-mail ou senha incorretos.');
    }
    stepPassword.hidden=true;stepMfa.hidden=false;
    document.getElementById('mfaCode').focus();
  });

  stepMfa.addEventListener('submit',e=>{
    e.preventDefault();
    const code=document.getElementById('mfaCode').value.replace(/\D/g,'');
    if(code.length!==6)return toast('Digite os 6 dígitos do autenticador.');
    toast('Login registrado na auditoria. Abrindo o painel.');
    setTimeout(()=>location.href='06-admin-painel.html',700);
  });

  document.getElementById('backBtn').addEventListener('click',()=>{stepMfa.hidden=true;stepPassword.hidden=false;});
  document.getElementById('forgotBtn').addEventListener('click',()=>{
    toast('Se o e-mail estiver cadastrado, enviaremos um link de redefinição.');
  });
})();
