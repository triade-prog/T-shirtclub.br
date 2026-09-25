// Utilitários dos formulários de promoção (15, 16 e 17): nome padrão, período, valores e stepper.
const FormPromocao=(function(){
  const DIAS_PADRAO=60;

  function doisDigitos(n){return String(n).padStart(2,'0');}
  function paraInput(d){return `${d.getFullYear()}-${doisDigitos(d.getMonth()+1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;}
  function carimbo(d){return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth()+1)}/${d.getFullYear()} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;}

  // Nome sugerido no padrão das telas de referência, com contador de 50 caracteres.
  function nome(inputId,counterId,prefixo){
    const input=document.getElementById(inputId), counter=document.getElementById(counterId);
    input.maxLength=50;
    if(!input.value)input.value=`${prefixo} ${carimbo(new Date())}`;
    const upd=()=>{counter.textContent=`${input.value.length}/50`;};
    input.addEventListener('input',upd);upd();
  }

  // Início = agora; fim = +60 dias, como nas telas de referência.
  function periodo(inicioId,fimId){
    const ini=document.getElementById(inicioId), fim=document.getElementById(fimId);
    const agora=new Date();
    if(!ini.value)ini.value=paraInput(agora);
    if(!fim.value)fim.value=paraInput(new Date(agora.getTime()+DIAS_PADRAO*86400000));
  }

  function validarPeriodo(inicioId,fimId){
    const ini=new Date(document.getElementById(inicioId).value), fim=new Date(document.getElementById(fimId).value);
    if(isNaN(ini)||isNaN(fim))return 'Informe data e hora de início e de término.';
    if(fim<=ini)return 'O término precisa ser depois do início.';
    return null;
  }

  function centavos(texto){
    const n=parseFloat(String(texto).replace(/\s/g,'').replace(/\./g,'').replace(',','.'));
    return isNaN(n)?NaN:Math.round(n*100);
  }

  function stepper(el,{min=1,max=999,onChange}={}){
    const input=el.querySelector('input');
    const set=v=>{input.value=Math.min(max,Math.max(min,v||min));onChange&&onChange(+input.value);};
    el.querySelector('[data-step="-"]').addEventListener('click',()=>set(+input.value-1));
    el.querySelector('[data-step="+"]').addEventListener('click',()=>set(+input.value+1));
    input.addEventListener('change',()=>set(parseInt(input.value,10)));
    return {valor:()=>+input.value};
  }

  // Liga um grupo de rádios a blocos que aparecem conforme a opção marcada (data-mostra-para).
  function alternar(nomeGrupo,onChange){
    const radios=[...document.querySelectorAll(`input[name="${nomeGrupo}"]`)];
    // onChange só dispara em mudanças do usuário; a página faz o próprio render inicial.
    const aplicar=avisar=>{
      const v=(radios.find(r=>r.checked)||{}).value;
      document.querySelectorAll(`[data-grupo="${nomeGrupo}"]`).forEach(b=>{b.hidden=b.dataset.mostraPara!==v;});
      if(avisar&&onChange)onChange(v);
    };
    radios.forEach(r=>r.addEventListener('change',()=>aplicar(true)));aplicar(false);
    return ()=>(radios.find(r=>r.checked)||{}).value;
  }

  function publicado(msg){
    toast(msg);
    setTimeout(()=>location.href='14-admin-promocoes.html',900);
  }

  return {nome,periodo,validarPeriodo,centavos,stepper,alternar,publicado};
})();
