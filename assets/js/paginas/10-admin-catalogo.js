// Catálogo: lista, filtros e cadastro/edição de produto (tamanho único, preço fixo, 1 a 10 fotos).
(function(){
  const rows=document.getElementById('productRows');
  const modal=document.getElementById('productModal');
  const form=document.getElementById('productForm');
  let editing=null, fotos=[];

  function fillCollections(){
    const opts=COLECOES.map(c=>`<option>${escaparHtml(c)}</option>`).join('');
    document.getElementById('filterCollection').innerHTML='<option value="">Todas as coleções</option>'+opts;
    document.getElementById('pColecao').innerHTML=opts;
    document.getElementById('collectionList').innerHTML=COLECOES.map(c=>{
      const n=PRODUTOS.filter(p=>p.colecao===c).length, cor=CORES_COLECAO.find(x=>x.id===COR_DA_COLECAO[c]);
      return `<span class="badge">${cor?`<span class="cor-colecao" style="background:${cor.cor}" aria-hidden="true"></span>`:''}${escaparHtml(c)} · ${n} produto(s)${cor?` · ${cor.nome}`:''}</span>`;
    }).join('');
    document.getElementById('newCollectionColor').innerHTML=CORES_COLECAO.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
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
        <td>${p.fotos.length?`<img class="thumb" src="${p.fotos[0].url}" alt="">`:'<div class="thumb" aria-hidden="true"></div>'}<div class="muted" style="font-size:11px">${p.fotos.length} foto(s)</div></td>
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
    fotos=product?product.fotos.map(f=>({...f})):[];
    renderFotos();
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
    const ativo=document.getElementById('pAtivo').checked;
    if(ativo&&!fotos.length)return toast('Para aparecer na loja, o produto precisa de pelo menos 1 foto.');
    const semTexto=fotos.findIndex(f=>!f.alt.trim());
    if(semTexto>=0){document.getElementById('fAlt'+semTexto).focus();return toast(`Descreva a foto ${semTexto+1} (texto para leitor de tela).`);}
    const dados={nome,colecao:document.getElementById('pColecao').value,precoCentavos:preco,ativo,fotos:fotos.map(f=>({...f}))};
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

  // Fotos: no sistema, o painel reduz cada foto no navegador (até 2400 px, WebP) e envia por URL assinada.
  function renderFotos(){
    document.getElementById('fotosCount').textContent=`${fotos.length} de ${MAX_FOTOS}`;
    document.getElementById('fotosAdd').hidden=fotos.length>=MAX_FOTOS;
    document.getElementById('fotosLista').innerHTML=fotos.map((f,i)=>`<li>
      <img src="${f.url}" alt="">
      <div class="campos">
        ${i===0?'<span class="capa">Capa</span>':''}
        <label class="sr-only" for="fTipo${i}">Tipo da foto ${i+1}</label>
        <select id="fTipo${i}" data-i="${i}" data-k="tipo">${Object.entries(TIPOS_FOTO).map(([v,t])=>`<option value="${v}" ${f.tipo===v?'selected':''}>${t}</option>`).join('')}</select>
        <label class="sr-only" for="fAlt${i}">Descrição da foto ${i+1}</label>
        <input id="fAlt${i}" data-i="${i}" data-k="alt" maxlength="200" value="${escaparHtml(f.alt)}" placeholder="Ex.: T-shirt Pomodoro com jeans, vista de frente">
      </div>
      <div class="acoes">
        <button type="button" class="btn ghost" data-move="${i}" data-dir="-1" ${i===0?'disabled':''} aria-label="Subir foto ${i+1}">↑</button>
        <button type="button" class="btn ghost" data-move="${i}" data-dir="1" ${i===fotos.length-1?'disabled':''} aria-label="Descer foto ${i+1}">↓</button>
        <button type="button" class="btn ghost" data-del="${i}" aria-label="Apagar foto ${i+1}">✕</button>
      </div></li>`).join('');
  }
  const tipoSugerido=i=>['FRENTE','COSTAS','DETALHE','VESTIDA'][i]||'VESTIDA';
  document.getElementById('pFotos').addEventListener('change',e=>{
    const arquivos=[...e.target.files].filter(f=>f.type.startsWith('image/'));
    const cabem=MAX_FOTOS-fotos.length;
    arquivos.slice(0,cabem).forEach(a=>{
      if(a.size>15*1024*1024)return toast(`${a.name}: a foto passa de 15 MB.`);
      fotos.push({url:URL.createObjectURL(a),tipo:tipoSugerido(fotos.length),alt:''});
    });
    if(arquivos.length>cabem)toast(`Cabem até ${MAX_FOTOS} fotos por produto; ${arquivos.length-cabem} ficaram de fora.`);
    e.target.value='';renderFotos();
  });
  document.getElementById('fotosLista').addEventListener('input',e=>{
    const {i,k}=e.target.dataset; if(i!==undefined)fotos[+i][k]=e.target.value;
  });
  document.getElementById('fotosLista').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.dataset.del!==undefined){fotos.splice(+b.dataset.del,1);renderFotos();return;}
    if(b.dataset.move!==undefined){
      const i=+b.dataset.move, j=i+(+b.dataset.dir);
      [fotos[i],fotos[j]]=[fotos[j],fotos[i]];renderFotos();
      const alvo=document.querySelector(`#fotosLista button[data-move="${j}"][data-dir="${b.dataset.dir}"]:not([disabled])`)||document.querySelector(`#fotosLista button[data-move="${j}"]:not([disabled])`);
      alvo?.focus();
    }
  });
  document.getElementById('closeProduct').addEventListener('click',()=>modal.classList.remove('open'));
  document.getElementById('collectionForm').addEventListener('submit',e=>{
    e.preventDefault();
    const input=document.getElementById('newCollectionName');
    const nome=input.value.trim();
    if(!nome)return toast('Informe o nome da coleção.');
    if(COLECOES.some(c=>c.toLowerCase()===nome.toLowerCase()))return toast('Essa coleção já existe.');
    COLECOES.push(nome);COR_DA_COLECAO[nome]=document.getElementById('newCollectionColor').value;input.value='';fillCollections();render();
    toast(`Coleção "${nome}" criada.`);
  });
  ['search','filterCollection','filterActive'].forEach(id=>document.getElementById(id).addEventListener('input',render));

  fillCollections();render();
})();
