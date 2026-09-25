// Seletor de produtos reutilizado pelas telas de promoção.
// Uso: SeletorProdutos.abrir({selecionados, bloqueados:{id:motivo}, aoConfirmar(ids)})
const SeletorProdutos=(function(){
  let modal, lista, busca, estado;

  function montar(){
    modal=document.createElement('div');
    modal.className='modal';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','pickerTitle');
    modal.innerHTML=`<div class="modal-box wide">
      <h2 id="pickerTitle">Selecionar produtos</h2>
      <input id="pickerSearch" placeholder="Buscar por nome ou código" aria-label="Buscar produto">
      <div class="picker-list" id="pickerList"></div>
      <div class="toolbar" style="margin-top:14px"><button class="btn" type="button" id="pickerOk">Confirmar seleção</button><button class="btn ghost" type="button" id="pickerCancel">Cancelar</button></div>
    </div>`;
    document.body.appendChild(modal);
    lista=modal.querySelector('#pickerList');busca=modal.querySelector('#pickerSearch');
    busca.addEventListener('input',render);
    lista.addEventListener('change',e=>{
      if(e.target.type!=='checkbox')return;
      if(e.target.checked)estado.sel.add(e.target.value);else estado.sel.delete(e.target.value);
    });
    modal.querySelector('#pickerCancel').addEventListener('click',()=>modal.classList.remove('open'));
    modal.querySelector('#pickerOk').addEventListener('click',()=>{
      modal.classList.remove('open');estado.aoConfirmar([...estado.sel]);
    });
  }

  function render(){
    const q=busca.value.trim().toLowerCase();
    lista.innerHTML=PRODUTOS.filter(p=>p.ativo&&(!q||p.nome.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q))).map(p=>{
      const motivo=estado.bloqueados[p.id];
      return `<label class="${motivo?'conflict':''}"><input type="checkbox" value="${p.id}" ${estado.sel.has(p.id)?'checked':''} ${motivo?'disabled':''}>
        <span><strong>${escaparHtml(p.nome)}</strong> <span class="muted">· ${escaparHtml(p.codigo)} · ${reais(p.precoCentavos)}</span>${motivo?`<br><span class="muted">${escaparHtml(motivo)}</span>`:''}</span></label>`;
    }).join('')||'<p class="muted">Nenhum produto encontrado.</p>';
  }

  function abrir({selecionados=[],bloqueados={},aoConfirmar}){
    if(!modal)montar();
    estado={sel:new Set(selecionados),bloqueados,aoConfirmar};
    busca.value='';render();modal.classList.add('open');busca.focus();
  }

  function resumo(ids){
    if(!ids.length)return 'Clique para selecionar';
    const nomes=ids.map(id=>produtoPorId(id).nome);
    return nomes.length<=2?nomes.join(', '):`${nomes.slice(0,2).join(', ')} e mais ${nomes.length-2}`;
  }

  return {abrir,resumo};
})();
