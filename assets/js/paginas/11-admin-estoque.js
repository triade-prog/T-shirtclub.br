// Estoque: saldo por SKU, ajuste com motivo e histórico de movimentos.
// Regra: o total nunca pode ficar abaixo de reservado + vendido.
(function(){
  const rows=document.getElementById('stockRows');
  const modal=document.getElementById('adjustModal');
  let current=null;

  const TIPOS={ENTRADA:{sinal:1,rotulo:'ENTRADA'},AJUSTE_MAIS:{sinal:1,rotulo:'AJUSTE'},AJUSTE_MENOS:{sinal:-1,rotulo:'AJUSTE'},PERDA:{sinal:-1,rotulo:'AJUSTE'}};

  function renderStats(){
    const soma=k=>VARIACOES.reduce((a,v)=>a+(k==='disp'?disponivel(v):v[k]),0);
    const esgot=VARIACOES.filter(v=>disponivel(v)<=0).length;
    document.getElementById('stats').innerHTML=[
      [soma('disp'),'unidades disponíveis'],[soma('reservado'),'reservadas agora'],
      [soma('vendido'),'vendidas'],[esgot,'SKUs esgotados']
    ].map(([v,l])=>`<div class="stat"><div class="value">${v}</div><div class="label">${l}</div></div>`).join('');
  }

  function render(){
    const q=document.getElementById('search').value.trim().toLowerCase();
    const st=document.getElementById('filterStatus').value;
    rows.innerHTML=VARIACOES.map(v=>{
      const p=produtoDe(v), d=disponivel(v), sit=situacaoEstoque(d), sku=skuDe(v);
      if(q&&!sku.toLowerCase().includes(q)&&!p.nome.toLowerCase().includes(q))return '';
      if(st&&sit.texto!==st)return '';
      const pct=n=>v.total?(n/v.total*100):0;
      return `<tr>
        <td><strong>${escaparHtml(sku)}</strong></td>
        <td>${escaparHtml(p.nome)} <span class="muted">· ${escaparHtml(v.tamanho)}</span></td>
        <td class="num">${v.total}</td><td class="num">${v.reservado}</td><td class="num">${v.vendido}</td>
        <td class="num"><strong>${d}</strong></td>
        <td><div class="bar" title="${v.vendido} vendido, ${v.reservado} reservado, ${d} disponível"><div class="sold" style="width:${pct(v.vendido)}%"></div><div class="res" style="width:${pct(v.reservado)}%"></div></div></td>
        <td><span class="badge ${sit.classe}">${sit.texto}</span></td>
        <td><button class="btn secondary" type="button" data-adjust="${v.id}">Ajustar</button></td>
      </tr>`;
    }).join('')||'<tr><td colspan="9" class="muted">Nenhum SKU com esses filtros.</td></tr>';
    renderStats();
  }

  function renderMoves(){
    document.getElementById('moveRows').innerHTML=MOVIMENTOS.map(m=>{
      const qtd=(m.tipo==='ENTRADA'||m.tipo==='AJUSTE')?(m.qtd>0?'+'+m.qtd:m.qtd):m.qtd;
      return `<tr><td>${escaparHtml(m.quando)}</td><td>${escaparHtml(m.sku)}</td><td><span class="badge">${m.tipo}</span></td><td class="num">${qtd}</td><td>${escaparHtml(m.reserva)}</td><td>${escaparHtml(m.autor)}</td><td>${escaparHtml(m.motivo)}</td></tr>`;
    }).join('');
  }

  function preview(){
    if(!current)return;
    const tipo=TIPOS[document.getElementById('adjType').value];
    const qtd=Math.max(0,parseInt(document.getElementById('adjQty').value,10)||0);
    const novoTotal=current.total+tipo.sinal*qtd;
    const minimo=current.reservado+current.vendido;
    const box=document.getElementById('adjPreview');
    const ok=novoTotal>=minimo&&qtd>0;
    box.className='notice'+(ok?'':' danger');
    box.innerHTML=ok
      ?`Total passa de <strong>${current.total}</strong> para <strong>${novoTotal}</strong>. Disponível fica em <strong>${novoTotal-minimo}</strong>.`
      :(qtd<=0?'Informe uma quantidade maior que zero.'
        :`Não é possível: ${minimo} unidade(s) estão reservadas ou vendidas. O total não pode ficar abaixo disso.`);
    document.getElementById('adjSubmit').disabled=!ok;
    return {ok,novoTotal,tipo,qtd};
  }

  rows.addEventListener('click',e=>{
    const id=e.target.dataset&&e.target.dataset.adjust; if(!id)return;
    current=VARIACOES.find(v=>v.id===id);
    document.getElementById('adjustTitle').textContent=`Ajustar ${skuDe(current)}`;
    document.getElementById('adjustCurrent').textContent=`Hoje: total ${current.total}, reservado ${current.reservado}, vendido ${current.vendido}, disponível ${disponivel(current)}.`;
    document.getElementById('adjType').value='ENTRADA';
    document.getElementById('adjQty').value=1;
    document.getElementById('adjReason').value='';
    preview();modal.classList.add('open');
  });
  ['adjType','adjQty'].forEach(id=>document.getElementById(id).addEventListener('input',preview));

  document.getElementById('adjustForm').addEventListener('submit',e=>{
    e.preventDefault();
    const r=preview(); if(!r||!r.ok)return;
    const motivo=document.getElementById('adjReason').value.trim();
    if(!motivo)return toast('O motivo é obrigatório para registrar o ajuste.');
    current.total=r.novoTotal;
    const agora=new Date();
    MOVIMENTOS.unshift({quando:agora.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',',''),
      sku:skuDe(current),tipo:r.tipo.rotulo,qtd:r.tipo.sinal*r.qtd,reserva:'—',autor:'Você (admin)',motivo});
    modal.classList.remove('open');
    render();renderMoves();
    toast('Ajuste registrado no histórico e na auditoria.');
  });
  document.getElementById('closeAdjust').addEventListener('click',()=>modal.classList.remove('open'));
  ['search','filterStatus'].forEach(id=>document.getElementById(id).addEventListener('input',render));

  render();renderMoves();
})();
