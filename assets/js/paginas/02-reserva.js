// Criar reserva: dados da cliente, resumo pelo motor de preço e cupom (vale só o mais vantajoso).
(function(){
  const carrinho=Carrinho.ler();
  const d=carrinho.dados||{};
  document.getElementById('name').value=d.nome||'';
  document.getElementById('phone').value=d.telefone||'';
  document.getElementById('delivery').value=d.entrega||'';
  document.getElementById('coupon').value=carrinho.cupom||'';

  function render(){
    const r=MotorPreco.calcular(Carrinho.itens(carrinho),carrinho.cupom);
    document.getElementById('summaryItems').innerHTML=r.linhas.map(l=>
      `<div class="row"><div><strong>${escaparHtml(l.produto.nome)}</strong><div class="muted">${l.qtd} unidade(s) × ${reais(l.produto.precoCentavos)}</div></div><strong>${reais(l.produto.precoCentavos*l.qtd)}</strong></div>`).join('')
      ||'<p class="muted">Nenhuma peça selecionada. <a href="01-loja.html">Voltar à loja</a></p>';
    document.getElementById('subtotal').textContent=reais(r.subtotal);
    document.getElementById('subtotal').className=r.desconto?'strike':'';
    document.getElementById('discountRow').hidden=!r.desconto;
    if(r.aplicada){
      document.getElementById('discountLabel').textContent=r.aplicada.rotulo;
      document.getElementById('discountValue').textContent='− '+reais(r.desconto);
    }
    document.getElementById('totalValue').textContent=reais(r.total);
    const msg=document.getElementById('couponMsg');
    msg.textContent=r.cupom?r.cupom.mensagem:'';
    msg.style.color=!r.cupom?'':r.cupom.situacao==='APLICADO'?'var(--success)':r.cupom.situacao==='INVALIDO'?'var(--danger)':'var(--warning)';
    return r;
  }

  document.getElementById('couponForm').addEventListener('submit',e=>{
    e.preventDefault();
    carrinho.cupom=document.getElementById('coupon').value.trim().toUpperCase();
    Carrinho.salvar(carrinho);
    const r=render();
    if(!carrinho.cupom)toast('Cupom removido.');
    else if(r.cupom)toast(r.cupom.mensagem);
  });

  document.getElementById('reserveForm').addEventListener('submit',e=>{
    e.preventDefault();
    if(!e.target.reportValidity())return;
    if(!Carrinho.pecas(carrinho))return toast('Selecione pelo menos uma T-shirt.');
    carrinho.dados={nome:document.getElementById('name').value.trim(),telefone:document.getElementById('phone').value.trim(),entrega:document.getElementById('delivery').value};
    // Cupom inválido não impede a reserva: ele só não é aplicado.
    Carrinho.salvar(carrinho);
    location.href='03-validar-whatsapp.html';
  });

  render();
})();
