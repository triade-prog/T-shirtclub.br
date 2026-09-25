// Login administrativo: e-mail, senha e código do autenticador (decisão D12).
// Protótipo: qualquer senha é aceita, exceto "errada", que simula falha para mostrar o limite;
// qualquer código de 6 dígitos passa no segundo passo.
// No sistema real, o limite de 5 erros vale para o par e-mail + rede (IP), com captcha a partir do 3º erro.
(function(){
  const MAX_ATTEMPTS=5;
  let failures=0;
  const hint=document.getElementById('attemptsHint');

  document.getElementById('stepPassword').addEventListener('submit',e=>{
    e.preventDefault();
    const email=document.getElementById('email').value.trim();
    const password=document.getElementById('password').value;
    if(!email||!password)return toast('Informe e-mail e senha.');
    if(failures>=MAX_ATTEMPTS)return toast('Acesso por esta rede bloqueado por 15 minutos.');
    if(password==='errada'){
      failures++;
      const left=MAX_ATTEMPTS-failures;
      hint.textContent=left>0?`E-mail ou senha incorretos. ${left} tentativa(s) antes do bloqueio desta rede por 15 minutos.${failures>=3?' Confirme que você não é um robô.':''}`:'Acesso por esta rede bloqueado por 15 minutos. Você recebe um aviso por e-mail, e a tentativa fica na auditoria.';
      return toast('E-mail ou senha incorretos.');
    }
    document.getElementById('stepPassword').hidden=true;
    document.getElementById('stepMfa').hidden=false;
    document.getElementById('mfaCode').focus();
  });

  const mfa=document.getElementById('mfaCode'), mfaErro=document.getElementById('mfaError');
  mfa.addEventListener('input',()=>{mfa.value=mfa.value.replace(/\D/g,'').slice(0,6);mfaErro.textContent='';});
  document.getElementById('stepMfa').addEventListener('submit',e=>{
    e.preventDefault();
    if(mfa.value.length!==6){mfaErro.textContent='Digite os 6 dígitos do autenticador.';mfa.focus();return;}
    toast('Login registrado na auditoria. Abrindo o painel.');
    setTimeout(()=>location.href='06-admin-painel.html',700);
  });
  document.getElementById('backBtn').addEventListener('click',()=>{
    document.getElementById('stepMfa').hidden=true;document.getElementById('stepPassword').hidden=false;
  });

  document.getElementById('forgotBtn').addEventListener('click',()=>{
    toast('Se o e-mail estiver cadastrado, enviaremos um link de redefinição.');
  });
})();
