// Login administrativo: e-mail e senha (decisão da loja: sem segundo fator).
// Protótipo: qualquer senha é aceita, exceto "errada", que simula falha para mostrar o limite.
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
    toast('Login registrado na auditoria. Abrindo o painel.');
    setTimeout(()=>location.href='06-admin-painel.html',700);
  });

  document.getElementById('forgotBtn').addEventListener('click',()=>{
    toast('Se o e-mail estiver cadastrado, enviaremos um link de redefinição.');
  });
})();
