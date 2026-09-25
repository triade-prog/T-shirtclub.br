// Catálogo: lista, filtros e cadastro/edição de produto com tamanhos.
(function(){
  const TAMANHOS=['PP','P','M','G','GG','XG'];
  const rows=document.getElementById('productRows');
  const modal=document.getElementById('productModal');
  const form=document.getElementById('productForm');
  let editing=null;

  function fillCollections(){
    const filter=document.getElementById('filterCollection');
    const select=document.getElementById('pColecao');
    filter.innerHTML='<option value="">Todas as coleções</option>'+COLECOES.map(c=>`<option>${escaparHtml(c)}</option>`).join('');
    select.innerHTML=COLECOES.map(c=>`<option>${escaparHtml(c)}</option>`).join('');
    document.getElementById('collectionList').innerHTML=COLECOES.map(c=>{
      const n=PRODUTOS.filter(p=>p.colecao===c).length;
      return `<span class="badge">${escaparHtml(c)} · ${n} produto(s)</span>`;
    }).join('');
  }

  function render(){
    const q=document.getElementById('search').value.trim().toLowerCase();
    const col=document.getElementById('filterCollection').value;
    const act=document.getElementById('filterActive').value;
    const list=PRODUTOS.filter(p=>
      (!q||p.nome.toLowerCase().includes(q)||p.modelo.toLowerCase().includes(q))&&
      (!col||p.colecao===col)&&
      (act===''||String(+p.ativo)===act));
    rows.innerHTML=list.map(p=>{
      const vs=variacoesDo(p.id);
      const disp=vs.reduce((a,v)=>a+disponivel(v),0);
      const sit=situacaoEstoque(disp);
      return `<tr>
        <td><div class="thumb" aria-hidden="true"></div></td>
        <td><strong>${escaparHtml(p.nome)}</strong><div class="muted">${escaparHtml(p.modelo)}</div></td>
        <td>${escaparHtml(p.colecao)}</td>
        <td class="num">${reais(p.precoCentavos)}</td>
        <td>${p.promo?'<span class="badge citron">Elegível</span>':'<span class="badge">Fora</span>'}</td>
        <td>${vs.map(v=>escaparHtml(v.tamanho)).join(' · ')||'<span class="muted">nenhum</span>'}</td>
        <td class="num"><span class="badge ${sit.classe}">${disp} · ${sit.texto}</span></td>
        <td>${p.ativo?'<span class="badge success">Ativo</span>':'<span class="badge">Inativo</span>'}</td>
        <td><button class="btn secondary" type="button" data-edit="${p.id}">Editar</button></td>
      </tr>`;
    }).join('')||'<tr><td colspan="9" class="muted">Nenhum produto com esses filtros.</td></tr>';
  }

  function open(product){
    editing=product||null;
    document.getElementById('productModalTitle').textContent=product?`Editar ${product.nome}`:'Novo produto';
    document.getElementById('pNome').value=product?product.nome:'';
    document.getElementById('pModelo').value=product?product.modelo:'';
    document.getElementById('pModelo').disabled=!!product;
    document.getElementById('pColecao').value=product?product.colecao:COLECOES[0];
    document.getElementById('pPreco').value=product?(product.precoCentavos/100).toFixed(2).replace('.',','):'';
    document.getElementById('pPromo').checked=product?product.promo:true;
    document.getElementById('pAtivo').checked=product?product.ativo:true;
    document.getElementById('deactivateWarn').hidden=true;
    const existing=product?variacoesDo(product.id).map(v=>v.tamanho):[];
    document.getElementById('sizeChecks').innerHTML=TAMANHOS.map(t=>{
      const has=existing.includes(t);
      // Tamanho com histórico não pode ser removido: o SKU fica, apenas sem novas entradas.
      return `<label class="switch"><input type="checkbox" value="${t}" ${has?'checked disabled':''}> ${t}${has?' <span class="muted">(existente)</span>':''}</label>`;
    }).join('');
    modal.classList.add('open');
    document.getElementById('pNome').focus();
  }

  form.addEventListener('submit',e=>{
    e.preventDefault();
    const nome=document.getElementById('pNome').value.trim();
    const modelo=document.getElementById('pModelo').value.trim().toUpperCase();
    const preco=Math.round(parseFloat(document.getElementById('pPreco').value.replace(/\./g,'').replace(',','.'))*100);
    const tamanhos=[...document.querySelectorAll('#sizeChecks input:checked')].map(i=>i.value);
    if(!nome)return toast('Informe o nome do produto.');
    if(!/^[A-Z0-9-]{3,20}$/.test(modelo))return toast('Código do modelo: 3 a 20 caracteres, letras, números e hífen.');
    if(!editing&&PRODUTOS.some(p=>p.modelo===modelo))return toast('Já existe um produto com esse código de modelo.');
    if(!(preco>0))return toast('Informe um preço maior que zero.');
    if(!tamanhos.length)return toast('Marque pelo menos um tamanho.');
    const dados={nome,colecao:document.getElementById('pColecao').value,precoCentavos:preco,
      promo:document.getElementById('pPromo').checked,ativo:document.getElementById('pAtivo').checked};
    let prod=editing;
    if(prod){Object.assign(prod,dados);}
    else{prod={id:'p'+(PRODUTOS.length+1),modelo,...dados};PRODUTOS.push(prod);}
    tamanhos.forEach(t=>{
      if(!variacoesDo(prod.id).some(v=>v.tamanho===t))
        VARIACOES.push({id:'v'+(VARIACOES.length+1),produto:prod.id,tamanho:t,total:0,reservado:0,vendido:0});
    });
    modal.classList.remove('open');
    fillCollections();render();
    toast(editing?'Produto atualizado e registrado na auditoria.':'Produto criado. Lance a entrada de estoque na tela Estoque.');
  });

  document.getElementById('pAtivo').addEventListener('change',e=>{
    document.getElementById('deactivateWarn').hidden=e.target.checked||!editing;
  });
  rows.addEventListener('click',e=>{
    const id=e.target.dataset&&e.target.dataset.edit;
    if(id)open(PRODUTOS.find(p=>p.id===id));
  });
  document.getElementById('newProduct').addEventListener('click',()=>open(null));
  document.getElementById('closeProduct').addEventListener('click',()=>modal.classList.remove('open'));
  document.getElementById('collectionForm').addEventListener('submit',e=>{
    e.preventDefault();
    const input=document.getElementById('newCollectionName');
    const nome=input.value.trim();
    if(!nome)return toast('Informe o nome da coleção.');
    if(COLECOES.some(c=>c.toLowerCase()===nome.toLowerCase()))return toast('Essa coleção já existe.');
    COLECOES.push(nome);input.value='';fillCollections();render();
    toast(`Coleção "${nome}" criada.`);
  });
  ['search','filterCollection','filterActive'].forEach(id=>document.getElementById(id).addEventListener('input',render));

  fillCollections();render();
})();
