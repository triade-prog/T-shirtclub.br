// Compre e economize mais: preço por grupo ("3 por R$ 119,99", a cada 3) ou níveis "compre N peças, ganhe X%"; orçamento opcional e escopo.
(function(){
  const MAX_NIVEIS=3, MAX_PECAS=9;
  FormPromocao.nome('nome','nomeCount','Compre mais, economize mais');
  FormPromocao.periodo('inicio','fim');
  const escopo=FormPromocao.alternar('escopo');
  const modo=FormPromocao.alternar('modo');
  let niveis=[{qtd:'',pct:''}], selecionados=[];

  function renderNiveis(){
    document.getElementById('tiers').innerHTML=niveis.map((n,i)=>`
      <div class="tier">
        <span class="nivel">Nível ${i+1}</span>
        <div class="field"><label for="q${i}">Compre (peças)</label><input id="q${i}" type="number" min="2" max="${MAX_PECAS}" data-i="${i}" data-k="qtd" value="${n.qtd}" placeholder="Insira a quantidade"></div>
        <div class="field"><label for="p${i}">Ganhe (%)</label><input id="p${i}" type="number" min="1" max="90" data-i="${i}" data-k="pct" value="${n.pct}" placeholder="Insira o desconto"></div>
        ${i>0?`<button type="button" class="btn ghost" data-remove="${i}" aria-label="Remover nível ${i+1}">✕</button>`:'<span></span>'}
      </div>`).join('');
    document.getElementById('addTier').hidden=niveis.length>=MAX_NIVEIS;
    simular();
  }

  function grupo(){return {qtd:+document.getElementById('grupoQtd').value,preco:FormPromocao.centavos(document.getElementById('grupoPreco').value)};}

  function simular(){
    const preco=4999;
    if(modo()==='PRECO_POR_GRUPO'){
      const g=grupo();
      if(!(g.qtd>=2&&g.qtd<=MAX_PECAS&&g.preco>0)){document.getElementById('simulation').textContent='Preencha a quantidade e o preço do grupo para ver um exemplo.';return;}
      const total=n=>Math.floor(n/g.qtd)*Math.min(g.preco,g.qtd*preco)+(n%g.qtd)*preco;
      document.getElementById('simulation').innerHTML='Exemplo com peças de '+reais(preco)+': '+[1,2,3,4,6,9].filter(n=>n<=MAX_PECAS).map(n=>`${n} = <strong>${reais(total(n))}</strong>`).join(' · ');
      return;
    }
    const validos=niveis.filter(n=>+n.qtd>=2&&+n.pct>=1);
    document.getElementById('simulation').innerHTML=validos.length
      ?'Exemplo com peças de '+reais(preco)+': '+validos.map(n=>{const q=+n.qtd,de=q*preco,por=Math.round(de*(100-n.pct)/100);return `${q} peças de <strong>${reais(de)}</strong> por <strong>${reais(por)}</strong>`;}).join(' · ')
      :'Preencha os níveis para ver um exemplo.';
  }

  function validarNiveis(){
    for(let i=0;i<niveis.length;i++){
      const q=+niveis[i].qtd, p=+niveis[i].pct;
      if(!Number.isInteger(q)||q<2||q>MAX_PECAS)return `Nível ${i+1}: a quantidade deve ser de 2 a ${MAX_PECAS} peças.`;
      if(!Number.isInteger(p)||p<1||p>90)return `Nível ${i+1}: o desconto deve ser de 1% a 90%.`;
      if(i>0&&(q<=+niveis[i-1].qtd||p<=+niveis[i-1].pct))return `Nível ${i+1}: quantidade e desconto precisam ser maiores que os do nível ${i}.`;
    }
    return null;
  }

  document.getElementById('tiers').addEventListener('input',e=>{
    const {i,k}=e.target.dataset; if(i===undefined)return;
    niveis[+i][k]=e.target.value;simular();
  });
  document.getElementById('tiers').addEventListener('click',e=>{
    const r=e.target.dataset&&e.target.dataset.remove; if(r===undefined)return;
    niveis.splice(+r,1);renderNiveis();
  });
  document.getElementById('addTier').addEventListener('click',()=>{niveis.push({qtd:'',pct:''});renderNiveis();});
  ['grupoQtd','grupoPreco'].forEach(id=>document.getElementById(id).addEventListener('input',simular));
  document.querySelectorAll('input[name="modo"]').forEach(r=>r.addEventListener('change',simular));
  document.getElementById('hasBudget').addEventListener('change',e=>{document.getElementById('budgetBox').hidden=!e.target.checked;});
  document.getElementById('pickBtn').addEventListener('click',()=>SeletorProdutos.abrir({selecionados,aoConfirmar:ids=>{
    selecionados=ids;document.getElementById('pickSummary').textContent=SeletorProdutos.resumo(ids)+' ›';}}));

  document.getElementById('form').addEventListener('submit',e=>{
    e.preventDefault();
    if(!document.getElementById('nome').value.trim())return toast('Informe o nome da promoção.');
    const erroPeriodo=FormPromocao.validarPeriodo('inicio','fim');if(erroPeriodo)return toast(erroPeriodo);
    if(modo()==='PRECO_POR_GRUPO'){
      const g=grupo();
      if(!Number.isInteger(g.qtd)||g.qtd<2||g.qtd>MAX_PECAS)return toast(`O grupo deve ter de 2 a ${MAX_PECAS} peças.`);
      if(!(g.preco>0))return toast('Informe o preço do grupo.');
    }else{const erroNiveis=validarNiveis();if(erroNiveis)return toast(erroNiveis);}
    if(document.getElementById('hasBudget').checked&&!(FormPromocao.centavos(document.getElementById('budget').value)>0))return toast('Informe o valor do orçamento.');
    if(escopo()==='ESPECIFICOS'&&!selecionados.length)return toast('Selecione os produtos da promoção.');
    FormPromocao.publicado('Promoção publicada e registrada na auditoria.');
  });

  renderNiveis();
})();
