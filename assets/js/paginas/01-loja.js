// Loja: catálogo vindo dos dados do protótipo, preço promocional, limites e resumo com o motor de preço.
(function(){
  // Na loja a seleção começa vazia; o exemplo só é usado quando se abre direto a página 02.
  let carrinho=Carrinho.temSalvo()?Carrinho.ler():Carrinho.vazio();

  const SVG=`<svg viewBox="0 0 220 220" aria-hidden="true">
      <path d="M67 42 93 28h34l26 14 31 20-20 33-22-14v105H78V81L56 95 36 62Z" fill="#ffffff" stroke="#111111" stroke-width="6" stroke-linejoin="round"/>
      <path d="M92 30c3 13 11 19 18 19s15-6 18-19" fill="none" stroke="#111111" stroke-width="6" stroke-linecap="round"/>
      <circle cx="110" cy="108" r="24" fill="#D7FF3F" stroke="#111111" stroke-width="4"/>
      <path d="M99 108h22M110 97v22" stroke="#111111" stroke-width="4" stroke-linecap="round"/></svg>`;

  const compreMais=PROMOCOES.filter(pr=>pr.tipo==='COMPRE_MAIS'&&situacaoPromocao(pr).texto==='Ativa');

  function badgesPromocao(){
    document.getElementById('promoBadges').innerHTML=compreMais.map(pr=>
      `<span class="badge citron">${pr.niveis.map(n=>`Leve ${n.qtd}, ganhe ${n.pct}%`).join(' · ')}</span>`).join('');
  }

  function cartao(p){
    const d=disponivel(p), sit=situacaoEstoque(d), promo=MotorPreco.precoPromocional(p), q=carrinho.itens[p.id]||0;
    const tier=compreMais.find(pr=>pr.escopo==='TODOS'||pr.produtos.includes(p.id));
    const preco=promo
      ?`<div class="strike">${reais(p.precoCentavos)}</div><div class="price">${reais(promo.preco)}</div><div class="muted" style="font-size:11px">${escaparHtml(promo.promocao.nome)}</div>`
      :`<div class="price">${reais(p.precoCentavos)}</div>${tier?`<div class="muted" style="font-size:11px">${tier.niveis[0].pct}% OFF levando ${tier.niveis[0].qtd}</div>`:''}`;
    return `<article class="card product" data-col="${escaparHtml(p.colecao)}" data-status="${sit.texto}">
      <div class="product-media"><div class="dot"></div>${SVG}</div>
      <div class="row" style="margin-top:13px"><div><h3>${escaparHtml(p.nome)}</h3><div class="muted" style="font-size:12px">${escaparHtml(p.colecao)} · tamanho único</div></div><span class="badge ${sit.classe}">${sit.texto}</span></div>
      <div class="row" style="margin-top:14px"><div>${preco}</div>
      <div class="qty"><button type="button" class="minus" data-id="${p.id}" ${q?'':'disabled'} aria-label="Tirar ${escaparHtml(p.nome)}">−</button><span>${q}</span><button type="button" class="plus" data-id="${p.id}" ${d<=0?'disabled':''} aria-label="Adicionar ${escaparHtml(p.nome)}">+</button></div></div>
    </article>`;
  }

  function render(){
    const c=document.getElementById('filterCollection').value, st=document.getElementById('filterStatus').value;
    document.getElementById('products').innerHTML=PRODUTOS.filter(p=>p.ativo)
      .filter(p=>(!c||p.colecao===c)&&(!st||situacaoEstoque(disponivel(p)).texto===st)).map(cartao).join('')
      ||'<p class="muted">Nenhuma peça com esses filtros.</p>';
    const r=MotorPreco.calcular(Carrinho.itens(carrinho));
    document.getElementById('cartCount').textContent=r.pecas;
    document.getElementById('summaryLine').textContent=r.pecas?`${r.pecas} peça(s) selecionada(s).`:'Nenhuma peça selecionada.';
    document.getElementById('promoLine').textContent=r.aplicada?`Desconto aplicado: ${r.aplicada.rotulo}. Vale só a promoção mais vantajosa.`:'';
    document.getElementById('total').textContent=reais(r.total);
    document.getElementById('originalTotal').textContent=r.desconto?reais(r.subtotal):'';
  }

  document.getElementById('products').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.classList.contains('plus')){const erro=Carrinho.adicionar(carrinho,b.dataset.id);if(erro)return toast(erro);}
    if(b.classList.contains('minus'))Carrinho.remover(carrinho,b.dataset.id);
    Carrinho.salvar(carrinho);render();
    // A grade é redesenhada: devolve o foco ao mesmo botão (ou ao outro do par, se este ficou desativado).
    const mesmo=document.querySelector(`#products button.${b.classList.contains('plus')?'plus':'minus'}[data-id="${b.dataset.id}"]`);
    const par=document.querySelector(`#products button[data-id="${b.dataset.id}"]:not([disabled])`);
    (mesmo&&!mesmo.disabled?mesmo:par)?.focus();
  });
  document.getElementById('filterCollection').innerHTML='<option value="">Todas as coleções</option>'+COLECOES.map(c=>`<option>${escaparHtml(c)}</option>`).join('');
  ['filterCollection','filterStatus'].forEach(id=>document.getElementById(id).addEventListener('change',render));
  document.getElementById('goReserve').addEventListener('click',e=>{
    if(!Carrinho.pecas(carrinho)){e.preventDefault();toast('Selecione pelo menos uma T-shirt.');}
  });

  badgesPromocao();render();
})();
