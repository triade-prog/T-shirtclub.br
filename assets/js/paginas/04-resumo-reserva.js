// Reserva ativa: itens e valores vêm da seleção feita nas páginas 01 e 02, calculados pelo motor de preço.
(function(){
  const c=Carrinho.ler();
  const r=MotorPreco.calcular(Carrinho.itens(c),c.cupom);
  document.getElementById('reservedItems').innerHTML=r.linhas.map(l=>
    `<div class="row"><div><strong>${escaparHtml(l.produto.nome)}</strong><div class="muted">${l.qtd} unidade(s)</div></div><strong>${reais(l.produto.precoCentavos*l.qtd)}</strong></div>`).join('');
  document.getElementById('piecesBadge').textContent=`${r.pecas} peça(s)`;
  document.getElementById('resSubtotal').textContent=reais(r.subtotal);
  document.getElementById('resDiscountRow').hidden=!r.desconto;
  if(r.aplicada){
    document.getElementById('resDiscountLabel').textContent=r.aplicada.rotulo;
    document.getElementById('resDiscount').textContent='− '+reais(r.desconto);
  }
  document.getElementById('resTotal').textContent=reais(r.total);
  document.getElementById('paidTotal').textContent=reais(r.total);
  if(c.dados&&c.dados.entrega)document.getElementById('resDelivery').textContent=c.dados.entrega;
})();
