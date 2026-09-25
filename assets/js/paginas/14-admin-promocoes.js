// Lista de promoções: filtros por tipo e situação, resumo da regra e encerramento antecipado.
(function(){
  let alvo=null;

  function regra(pr){
    if(pr.tipo==='COMPRE_MAIS'){
      const niveis=pr.modo==='PRECO_POR_GRUPO'?`A cada ${pr.grupo.qtd} peças, ${reais(pr.grupo.precoCentavos)}`:pr.niveis.map(n=>`${n.qtd} peças → ${n.pct}%`).join(' · ');
      const extra=[pr.umaPorCliente?'1 por cliente':'',pr.orcamentoCentavos?`orçamento ${reais(pr.orcamentoCentavos)}`:''].filter(Boolean).join(' · ');
      return niveis+(extra?`<div class="muted">${extra}</div>`:'')+`<div class="muted">${reais(pr.usadoCentavos)} concedidos</div>`;
    }
    if(pr.tipo==='DESCONTO_PRODUTO'){
      return pr.produtos.map(id=>{
        const p=produtoPorId(id), v=pr.valores[id];
        return `${escaparHtml(p.nome)}: ${pr.modo==='PERCENTUAL'?v+'%':'por '+reais(v)}`;
      }).join('<br>');
    }
    const desc=pr.modo==='VALOR'?`${reais(pr.valor)} OFF`:`${pr.valor}% OFF`;
    const min=pr.gastoMinimoCentavos?` acima de ${reais(pr.gastoMinimoCentavos)}`:'';
    return `<strong>${escaparHtml(pr.codigo)}</strong> · ${desc}${min}<div class="muted">${pr.usados}/${pr.quantidade.toLocaleString('pt-BR')} usados · ${pr.porCliente} por cliente · ${pr.validadeDias} dia(s)</div>`;
  }

  function render(){
    const t=document.getElementById('filterType').value, st=document.getElementById('filterStatus').value;
    document.getElementById('promoRows').innerHTML=PROMOCOES.filter(pr=>(!t||pr.tipo===t)&&(!st||situacaoPromocao(pr).texto===st)).map(pr=>{
      const sit=situacaoPromocao(pr);
      const alcance=pr.escopo==='TODOS'?'Todos os produtos':`${pr.produtos.length} produto(s)`;
      const acao=sit.texto==='Encerrada'?'':`<button class="btn secondary" type="button" data-end="${pr.id}">Encerrar</button>`;
      return `<tr><td><strong>${escaparHtml(pr.nome)}</strong></td><td>${TIPOS_PROMOCAO[pr.tipo].rotulo}</td><td>${regra(pr)}</td><td>${alcance}</td>
        <td>${dataHora(pr.inicio)}<div class="muted">até ${dataHora(pr.fim)}</div></td><td><span class="badge ${sit.classe}">${sit.texto}</span></td><td>${acao}</td></tr>`;
    }).join('')||'<tr><td colspan="7" class="muted">Nenhuma promoção com esses filtros.</td></tr>';
  }

  document.getElementById('promoRows').addEventListener('click',e=>{
    const id=e.target.dataset&&e.target.dataset.end; if(!id)return;
    alvo=PROMOCOES.find(p=>p.id===id);
    document.getElementById('endText').textContent=`"${alvo.nome}" deixa de valer para novas reservas agora. Reservas já criadas mantêm o preço calculado.`;
    document.getElementById('endModal').classList.add('open');
  });
  document.getElementById('closeEnd').addEventListener('click',()=>document.getElementById('endModal').classList.remove('open'));
  document.getElementById('confirmEnd').addEventListener('click',()=>{
    alvo.desativada=true;document.getElementById('endModal').classList.remove('open');render();
    toast('Promoção encerrada e registrada na auditoria.');
  });
  ['filterType','filterStatus'].forEach(id=>document.getElementById(id).addEventListener('input',render));
  render();
})();
