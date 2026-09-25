// Criar desconto do produto: porcentagem ou preço fixo por produto, num período.
(function(){
  FormPromocao.nome('nome','nomeCount','Desconto');
  FormPromocao.periodo('inicio','fim');
  let selecionados=[];
  const valores={};
  const modo=FormPromocao.alternar('modo',()=>renderValores());

  // Produtos já em outro desconto do produto com período sobreposto ficam bloqueados.
  function bloqueados(){
    const ini=new Date(document.getElementById('inicio').value), fim=new Date(document.getElementById('fim').value);
    const mapa={};
    PROMOCOES.filter(pr=>pr.tipo==='DESCONTO_PRODUTO'&&situacaoPromocao(pr).texto!=='Encerrada').forEach(pr=>{
      if(new Date(pr.inicio)<fim&&new Date(pr.fim)>ini)pr.produtos.forEach(id=>{mapa[id]=`Já está em "${pr.nome}" nesse período`;});
    });
    return mapa;
  }

  function precoFinal(p){
    const v=valores[p.id];
    if(v==null||v==='')return null;
    if(modo()==='PERCENTUAL'){const pct=parseInt(v,10);return pct>=1&&pct<=90?Math.round(p.precoCentavos*(100-pct)/100):null;}
    const c=FormPromocao.centavos(v);return c>0&&c<p.precoCentavos?c:null;
  }

  function textoFinal(p,f){return `De ${reais(p.precoCentavos)}`+(f!=null?` por <strong>${reais(f)}</strong>`:'');}

  function renderValores(){
    const row=document.getElementById('valuesRow');
    row.hidden=!selecionados.length;
    document.getElementById('pickSummary').textContent=SeletorProdutos.resumo(selecionados)+' ›';
    const pct=modo()==='PERCENTUAL';
    document.getElementById('valuesLabel').textContent=pct?'Desconto de cada produto (%)':'Preço promocional de cada produto (R$)';
    document.getElementById('values').innerHTML=selecionados.map(id=>{
      const p=produtoPorId(id), f=precoFinal(p);
      return `<div class="prod-value"><div><strong>${escaparHtml(p.nome)}</strong><div class="muted" id="final_${id}">${textoFinal(p,f)}</div></div>
        <input type="text" inputmode="decimal" data-prod="${id}" value="${escaparHtml(valores[id]||'')}" placeholder="${pct?'Ex.: 15':'Ex.: 39,90'}" aria-label="${pct?'Desconto em %':'Preço promocional'} de ${escaparHtml(p.nome)}"></div>`;
    }).join('');
  }

  // Atualiza só a prévia da linha editada, sem redesenhar os campos.
  document.getElementById('values').addEventListener('input',e=>{
    const id=e.target.dataset.prod; if(!id)return;
    valores[id]=e.target.value.trim();
    const p=produtoPorId(id);
    document.getElementById('final_'+id).innerHTML=textoFinal(p,precoFinal(p));
  });
  document.querySelectorAll('input[name=modo]').forEach(r=>r.addEventListener('change',()=>{Object.keys(valores).forEach(k=>delete valores[k]);renderValores();}));
  document.getElementById('pickBtn').addEventListener('click',()=>SeletorProdutos.abrir({
    selecionados,bloqueados:bloqueados(),aoConfirmar:ids=>{selecionados=ids;renderValores();}}));

  document.getElementById('form').addEventListener('submit',e=>{
    e.preventDefault();
    document.querySelectorAll('#values input').forEach(i=>{valores[i.dataset.prod]=i.value.trim();});
    const nome=document.getElementById('nome').value.trim();
    if(!nome)return toast('Informe o nome da promoção.');
    const erroPeriodo=FormPromocao.validarPeriodo('inicio','fim');if(erroPeriodo)return toast(erroPeriodo);
    if(!selecionados.length)return toast('Selecione pelo menos um produto.');
    const bl=bloqueados();const conflito=selecionados.find(id=>bl[id]);
    if(conflito)return toast(`${produtoPorId(conflito).nome}: ${bl[conflito]}.`);
    const invalido=selecionados.find(id=>precoFinal(produtoPorId(id))==null);
    if(invalido)return toast(modo()==='PERCENTUAL'
      ?`${produtoPorId(invalido).nome}: informe um desconto entre 1% e 90%.`
      :`${produtoPorId(invalido).nome}: o preço promocional precisa ser maior que zero e menor que o preço fixo.`);
    FormPromocao.publicado('Desconto do produto publicado e registrado na auditoria.');
  });

  renderValores();
})();
