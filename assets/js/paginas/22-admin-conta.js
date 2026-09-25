// Minha conta: troca de senha com regras visíveis e aparelhos conectados.
(function(){
  const $=id=>document.getElementById(id);
  const REGRAS=[
    [s=>s.length>=12,'Pelo menos 12 caracteres (uma frase curta funciona bem)'],
    [s=>!/^(.)\1+$/.test(s)&&!/123456|senha|tshirt/i.test(s),'Nada óbvio como "123456" ou o nome da loja']
  ];
  let sessoes=[['Este aparelho','iPhone · Safari · Vitória da Conquista, BA','agora',true],['Notebook da loja','Windows · Chrome','ontem às 18:40',false],['Celular antigo','Android · Chrome','há 9 dias',false]];

  function regras(){
    const v=$('nw').value;
    $('rules').innerHTML=REGRAS.map(([f,t])=>`<li><span class="${f(v)?'ok':'no'}">${f(v)?'✓':'✕'}</span>${t}</li>`).join('');
  }
  function renderSessoes(){
    $('sessions').innerHTML=sessoes.map(([n,d,q,atual])=>`<div class="row"><div><strong>${n}</strong><div class="muted" style="font-size:13px">${d} · ${q}</div></div>${atual?'<span class="badge success">Este</span>':''}</div>`).join('');
    $('logoutAll').disabled=sessoes.length<=1;
  }
  $('nw').addEventListener('input',regras);
  $('pwForm').addEventListener('submit',e=>{
    e.preventDefault();
    const cur=$('cur').value, nw=$('nw').value, cf=$('cf').value;
    if(!cur)return toast('Informe a senha atual.');
    if(!REGRAS.every(([f])=>f(nw)))return toast('A nova senha não atende às regras.');
    if(nw===cur)return toast('A nova senha precisa ser diferente da atual.');
    if(nw!==cf)return toast('As duas novas senhas não conferem.');
    sessoes=sessoes.filter(s=>s[3]);renderSessoes();
    ['cur','nw','cf'].forEach(id=>{$(id).value='';});regras();
    toast('Senha alterada. Outros aparelhos desconectados e registro na auditoria.');
  });
  $('logoutAll').addEventListener('click',()=>{sessoes=sessoes.filter(s=>s[3]);renderSessoes();toast('Os outros aparelhos saíram da conta.');});
  // Autenticadores (D12): ao menos um sempre cadastrado.
  let fatores=[['Celular da loja','cadastrado em 25/09/2026'],['Celular reserva','cadastrado em 25/09/2026']];
  function renderFatores(){
    $('factors').innerHTML=fatores.map(([n,d],i)=>`<div class="row"><div><strong>${n}</strong><div class="muted" style="font-size:13px">${d}</div></div><button class="btn ghost" type="button" data-rm="${i}" ${fatores.length<=1?'disabled':''}>Remover</button></div>`).join('');
  }
  $('factors').addEventListener('click',e=>{
    const i=e.target.dataset.rm; if(i===undefined)return;
    const nome=fatores[+i][0];fatores.splice(+i,1);renderFatores();
    toast(`"${nome}" removido. Registro na auditoria.${fatores.length===1?' Cadastre outro para ter um reserva.':''}`);
  });
  $('addFactor').addEventListener('click',()=>{
    fatores.push([`Novo autenticador ${fatores.length+1}`,'cadastrado agora']);renderFatores();
    toast('No sistema real aparece um QR code para ler no aplicativo autenticador, e um código confirma o cadastro.');
  });
  regras();renderSessoes();renderFatores();
})();
