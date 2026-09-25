// Catálogo: lista, filtros e cadastro/edição de produto (tamanho único, preço fixo).
(function(){
  const rows=document.getElementById('productRows');
  const modal=document.getElementById('productModal');
  const form=document.getElementById('productForm');
  let editing=null;

  function fillCollections(){
    const opts=COLECOES.map(c=>`<option>${escaparHtml(c)}</option>`).join('');
    document.getElementById('filterCollection').innerHTML='<option value="">Todas as coleções</option>'+opts;
    document.getElementById('pColecao').innerHTML=opts;
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
      (!q||p.nome.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q))&&
      (!col||p.colecao===col)&&(act===''||String(+p.ativo)===act));
    rows.innerHTML=list.map(p=>{
      const disp=disponivel(p), sit=situacaoEstoque(disp);
      const promos=promocoesAtivasDo(p.id);
      return `<tr>
        <td><div class="thumb" aria-hidden="true"></div></td>
        <td><strong>${escaparHtml(p.nome)}</strong><div class="muted">${escaparHtml(p.codigo)}</div></td>
        <td>${escaparHtml(p.colecao)}</td>
        <td class="num">${reais(p.precoCentavos)}</td>
        <td>${promos.length?promos.map(pr=>`<span class="badge citron">${escaparHtml(pr.nome)}</span>`).join(' '):'<span class="muted">nenhuma</span>'}</td>
        <td class="num"><span class="badge ${sit.classe}">${disp} · ${sit.texto}</span></td>
        <td>${p.ativo?'<span class="badge success">Ativo</span>':'<span class="badge">Inativo</span>'}</td>
        <td><button class="btn secondary" type="button" data-edit="${p.id}">Editar</button></td>
      </tr>`;
    }).join('')||'<tr><td colspan="8" class="muted">Nenhum produto com esses filtros.</td></tr>';
  }

  function open(product){
    editing=product||null;
    document.getElementById('productModalTitle').textContent=product?`Editar ${product.nome}`:'Novo produto';
    document.getElementById('pNome').value=product?product.nome:'';
    document.getElementById('pCodigo').value=product?product.codigo:'';
    document.getElementById('pCodigo').disabled=!!product;
    document.getElementById('pColecao').value=product?product.colecao:COLECOES[0];
    document.getElementById('pPreco').value=product?(product.precoCentavos/100).toFixed(2).replace('.',','):'';
    document.getElementById('pAtivo').checked=product?product.ativo:true;
    document.getElementById('deactivateWarn').hidden=true;
    document.getElementById('priceNote').hidden=!product;
    modal.classList.add('open');
    document.getElementById('pNome').focus();
  }

  form.addEventListener('submit',e=>{
    e.preventDefault();
    const nome=document.getElementById('pNome').value.trim();
    const codigo=document.getElementById('pCodigo').value.trim().toUpperCase();
    const preco=Math.round(parseFloat(document.getElementById('pPreco').value.replace(/\./g,'').replace(',','.'))*100);
    if(!nome)return toast('Informe o nome do produto.');
    if(!/^[A-Z0-9-]{3,20}$/.test(codigo))return toast('Código: 3 a 20 caracteres, letras, números e hífen.');
    if(!editing&&PRODUTOS.some(p=>p.codigo===codigo))return toast('Já existe um produto com esse código.');
    if(!(preco>0))return toast('Informe um preço maior que zero.');
    const dados={nome,colecao:document.getElementById('pColecao').value,precoCentavos:preco,ativo:document.getElementById('pAtivo').checked};
    if(editing)Object.assign(editing,dados);
    else PRODUTOS.push({id:'p'+(PRODUTOS.length+1),codigo,total:0,reservado:0,vendido:0,...dados});
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
