// Meu pedido: o que a cliente vê depois de pagar (modalidade, endereço, frete, andamento)
// e também a reserva expirada ou cancelada. É a tela aberta pelo link do WhatsApp.
(function(){
  const $=id=>document.getElementById(id);
  const PRAZO_FRETE_MS=2*60*60*1000;
  const carrinho=Carrinho.ler();
  const preco=MotorPreco.calcular(Carrinho.itens(carrinho),carrinho.cupom);
  let salvo={};try{salvo=JSON.parse(localStorage.getItem('prototipo-reserva-status'))||{};}catch(e){}
  const pedido={
    cenario:salvo.estado==='EXPIRADO'?'EXPIRADO':'MODALIDADE',
    forma:salvo.forma||'PIX',
    modalidade:salvo.modalidade||(carrinho.dados||{}).entrega||'Retirada',
    endereco:null,frete:1200,freteAte:null
  };

  const ETAPAS=['Pagamento confirmado','Entrega combinada','Em preparação','A caminho ou pronto','Entregue'];
  const ETAPA_DO={MODALIDADE:1,AGUARDANDO_FRETE:1,FRETE_A_PAGAR:1,FRETE_VENCIDO:1,EM_PREPARACAO:2,PRONTO_PARA_RETIRADA:3,SAIU_PARA_ENTREGA:3,ENVIADO:3,ENTREGUE:5};

  function badge(){
    const c=pedido.cenario, b=$('stateBadge'), sub=$('subBadge');
    const oficial=c==='ENTREGUE'?['ENTREGUE','']:c==='EXPIRADO'||c==='CANCELADO'?['EXPIRADO','danger']:['PAGAMENTO CONFIRMADO','success'];
    b.textContent=oficial[0];b.className='badge '+oficial[1];
    const subs={AGUARDANDO_FRETE:'Calculando frete',FRETE_A_PAGAR:'Frete a pagar',FRETE_VENCIDO:'Prazo do frete vencido',EM_PREPARACAO:'Em preparação',PRONTO_PARA_RETIRADA:'Pronto para retirada',SAIU_PARA_ENTREGA:'Saiu para entrega',ENVIADO:'Enviado',CANCELADO:'Cancelamento aprovado'};
    sub.hidden=!subs[c];sub.textContent=subs[c]||'';
  }

  function passos(){
    const c=pedido.cenario;
    if(c==='EXPIRADO'||c==='CANCELADO'){$('steps').innerHTML='<p class="muted">Esta reserva foi encerrada. As peças voltaram ao estoque.</p>';return;}
    const atual=ETAPA_DO[c];
    $('steps').innerHTML=ETAPAS.map((t,i)=>{
      const cls=i<atual?'done':i===atual?'now':'later';
      return `<div class="order-step ${cls}"><span class="dot" aria-hidden="true"></span><span>${t}${i===atual&&c!=='ENTREGUE'?' <span class="muted">· agora</span>':''}</span></div>`;
    }).join('');
  }

  function resumo(){
    $('items').innerHTML=preco.linhas.map(l=>`<div class="row"><span>${escaparHtml(l.produto.nome)} ×${l.qtd}</span><span>${reais(l.produto.precoCentavos*l.qtd)}</span></div>`).join('')
      +(preco.desconto?`<div class="row"><span class="muted">${escaparHtml(preco.aplicada.rotulo)}</span><span>− ${reais(preco.desconto)}</span></div>`:'');
    $('productsTotal').textContent=reais(preco.total);
    const temFrete=['EM_PREPARACAO','SAIU_PARA_ENTREGA','ENVIADO','ENTREGUE'].includes(pedido.cenario)&&pedido.modalidade!=='Retirada';
    $('freightRow').hidden=!temFrete;$('freightTotal').textContent=reais(pedido.frete);
    $('payInfo').textContent=pedido.cenario==='EXPIRADO'||pedido.cenario==='CANCELADO'?'não pago':(pedido.forma==='PIX'?'PIX':'Cartão')+' · confirmado';
  }

  function formEntrega(){
    const m=pedido.modalidade;
    return `<h2>Como você quer receber?</h2>
      <p class="muted" style="margin-top:0">Pagamento confirmado. Confirme a entrega (você escolheu <strong>${escaparHtml(m)}</strong> na reserva, mas pode mudar).</p>
      <form id="deliveryForm" novalidate>
        <div class="method" role="radiogroup" aria-label="Modalidade de entrega" style="grid-template-columns:1fr">
          ${['Retirada','Entrega local / motoboy','Envio para outra cidade'].map(o=>`<label><input type="radio" name="mod" value="${o}" ${o===m?'checked':''}><span>${o}</span><small>${o==='Retirada'?'Sem frete · retire na loja com o código do pedido':o.startsWith('Entrega')?'Frete calculado pela loja':'Frete calculado pela loja · Correios ou transportadora'}</small></label>`).join('')}
        </div>
        <div id="addr" hidden>
          <div class="field"><label for="aCep">CEP</label><input id="aCep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" maxlength="9"></div>
          <div class="field" style="margin-top:8px"><label for="aRua">Rua</label><input id="aRua" autocomplete="address-line1"></div>
          <div class="field-row" style="margin-top:8px"><div class="field"><label for="aNum">Número</label><input id="aNum" inputmode="numeric"></div><div class="field"><label for="aCompl">Complemento</label><input id="aCompl" autocomplete="address-line2" placeholder="Opcional"></div></div>
          <div class="field" style="margin-top:8px"><label for="aBairro">Bairro</label><input id="aBairro"></div>
          <div class="field-row" style="margin-top:8px"><div class="field"><label for="aCidade">Cidade</label><input id="aCidade" autocomplete="address-level2"></div><div class="field"><label for="aUf">UF</label><input id="aUf" maxlength="2" autocomplete="address-level1" style="text-transform:uppercase"></div></div>
          <p class="muted" style="font-size:12px">O endereço é usado só para esta entrega.</p>
        </div>
        <div class="bottom-cta"><button class="btn citron full" type="submit">Confirmar entrega</button></div>
      </form>`;
  }

  function codigoPix(v){return '00020126580014BR.GOV.BCB.PIX0136frete-1048-exemplo520400005303986540'+(v/100).toFixed(2)+'5802BR5913T-SHIRT CLUB6304FRTE';}

  function acao(){
    const c=pedido.cenario, el=$('actionCard');
    const blocos={
      MODALIDADE:formEntrega,
      AGUARDANDO_FRETE:()=>`<h2>A loja está calculando o frete</h2><p class="muted">Recebemos o endereço. Você vai receber o valor aqui e no WhatsApp. Depois disso, tem <strong>2 horas</strong> para pagar o frete.</p>
        <div class="status-box wait"><span class="spinner" aria-hidden="true"></span>Aguardando o valor do frete.</div>
        <div class="proto-tools"><button class="btn secondary" type="button" data-go="FRETE_A_PAGAR">Protótipo: loja informou o frete</button></div>`,
      FRETE_A_PAGAR:()=>`<h2>Pague o frete</h2>
        <div class="row"><span>${escaparHtml(pedido.modalidade)}</span><span class="price">${reais(pedido.frete)}</span></div>
        <div class="status-box wait">Pague até <strong>${new Date(pedido.freteAte).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</strong> · faltam <strong class="countdown" id="freteCd"></strong></div>
        <button class="btn citron full" type="button" id="copyFrete" style="margin-top:12px">Copiar código PIX do frete</button>
        <ol class="steps-list"><li>Abra o app do seu banco.</li><li>Escolha <strong>Pix › Pix copia e cola</strong>.</li><li>Cole o código e confirme.</li></ol>
        <p class="muted" style="font-size:12px">O frete é pago pela mesma forma do pedido: ${pedido.forma==='PIX'?'PIX':'cartão (no sistema real aparece o formulário do cartão)'}.</p>
        <button class="btn ghost" type="button" data-go="MODALIDADE">Mudar para retirada ou outro endereço</button>
        <div class="proto-tools"><div class="toolbar"><button class="btn secondary" type="button" data-go="EM_PREPARACAO">Protótipo: frete pago</button><button class="btn secondary" type="button" data-go="FRETE_VENCIDO">Protótipo: passar 2 horas</button></div></div>`,
      FRETE_VENCIDO:()=>`<h2>O prazo do frete venceu</h2><p class="muted">Seu pedido continua pago e guardado. A loja vai falar com você no WhatsApp para combinar um novo valor ou a retirada.</p>
        <button class="btn secondary" type="button" data-go="MODALIDADE">Prefiro retirar na loja</button>`,
      EM_PREPARACAO:()=>`<h2>Estamos preparando seu pedido</h2><p class="muted">Você recebe um aviso no WhatsApp quando ele ${pedido.modalidade==='Retirada'?'estiver pronto para retirada':'sair para entrega'}.</p>
        <div class="proto-tools"><button class="btn secondary" type="button" data-go="${pedido.modalidade==='Retirada'?'PRONTO_PARA_RETIRADA':pedido.modalidade.startsWith('Envio')?'ENVIADO':'SAIU_PARA_ENTREGA'}">Protótipo: avançar</button></div>`,
      PRONTO_PARA_RETIRADA:()=>`<h2>Pronto para retirada</h2><p class="muted">Leve nome, WhatsApp e o código do pedido.</p>
        <div class="card citron" style="text-align:center"><div class="muted" style="color:var(--ink)">Código de retirada</div><div class="price" style="font-size:34px">R-1048</div></div>
        <p class="muted" style="margin-top:12px">Endereço e horário da loja: [a preencher pela loja].</p>`,
      SAIU_PARA_ENTREGA:()=>`<h2>Saiu para entrega</h2><p class="muted">O motoboy está a caminho${pedido.endereco?' de '+escaparHtml(pedido.endereco):''}. Tenha alguém para receber.</p>`,
      ENVIADO:()=>`<h2>Pedido enviado</h2><p class="muted">Código de rastreio: <strong>AB123456789BR</strong></p>`,
      ENTREGUE:()=>`<h2>Pedido entregue</h2><p class="muted">Obrigada pela compra! Trocas e devoluções são combinadas pelo WhatsApp.</p><a class="btn citron full" href="01-loja.html">Ver novidades na loja</a>`,
      EXPIRADO:()=>`<h2>Reserva expirada</h2><p class="muted">O prazo terminou sem pagamento confirmado e as peças voltaram ao estoque. Esta reserva não pode ser reativada.</p><a class="btn citron full" href="01-loja.html">Fazer nova reserva</a>`,
      CANCELADO:()=>`<h2>Reserva cancelada</h2><p class="muted">A loja aprovou o seu pedido de cancelamento. As peças voltaram ao estoque e nenhum valor foi cobrado.</p><a class="btn citron full" href="01-loja.html">Voltar à loja</a>`
    };
    el.innerHTML=blocos[c]();
    if(c==='MODALIDADE')ligarForm();
    if(c==='FRETE_A_PAGAR'){
      $('copyFrete').addEventListener('click',()=>{const ok=()=>toast('Código PIX do frete copiado.');navigator.clipboard?navigator.clipboard.writeText(codigoPix(pedido.frete)).then(ok,ok):ok();});
      contagem();
    }
  }

  let cdTimer=null;
  function contagem(){
    clearInterval(cdTimer);
    const upd=()=>{const el=$('freteCd');if(!el)return clearInterval(cdTimer);const ms=pedido.freteAte-Date.now();
      if(ms<=0){clearInterval(cdTimer);return ir('FRETE_VENCIDO');}
      el.textContent=`${Math.floor(ms/3600000)}h${String(Math.floor(ms%3600000/60000)).padStart(2,'0')}m${String(Math.floor(ms%60000/1000)).padStart(2,'0')}s`;};
    upd();cdTimer=setInterval(upd,1000);
  }

  function ligarForm(){
    const mostrar=()=>{$('addr').hidden=document.querySelector('input[name=mod]:checked').value==='Retirada';};
    document.querySelectorAll('input[name=mod]').forEach(r=>r.addEventListener('change',mostrar));mostrar();
    $('aCep').addEventListener('input',e=>{const d=e.target.value.replace(/\D/g,'').slice(0,8);e.target.value=d.length>5?d.slice(0,5)+'-'+d.slice(5):d;});
    $('deliveryForm').addEventListener('submit',e=>{
      e.preventDefault();
      const m=document.querySelector('input[name=mod]:checked').value;
      pedido.modalidade=m;
      if(m==='Retirada'){toast('Retirada confirmada. Sem frete.');return ir('EM_PREPARACAO');}
      const campos=['aCep','aRua','aNum','aBairro','aCidade','aUf'];
      const vazio=campos.find(id=>!$(id).value.trim());
      if(vazio)return toast('Preencha o endereço completo (só o complemento é opcional).');
      if($('aCep').value.replace(/\D/g,'').length!==8)return toast('O CEP precisa ter 8 dígitos.');
      pedido.endereco=`${$('aRua').value.trim()}, ${$('aNum').value.trim()} · ${$('aBairro').value.trim()}`;
      toast('Endereço enviado. A loja vai calcular o frete.');
      ir('AGUARDANDO_FRETE');
    });
  }

  function ir(c){
    pedido.cenario=c;
    if(c==='FRETE_A_PAGAR')pedido.freteAte=Date.now()+PRAZO_FRETE_MS;
    $('scenario').value=c;render();
  }
  function render(){badge();passos();resumo();acao();}

  $('actionCard').addEventListener('click',e=>{const go=e.target.dataset&&e.target.dataset.go;if(go)ir(go);});
  $('scenario').addEventListener('input',e=>{
    if(e.target.value!=='MODALIDADE'&&pedido.modalidade==='Retirada'&&['AGUARDANDO_FRETE','FRETE_A_PAGAR','FRETE_VENCIDO','SAIU_PARA_ENTREGA'].includes(e.target.value))pedido.modalidade='Entrega local / motoboy';
    if(e.target.value==='ENVIADO')pedido.modalidade='Envio para outra cidade';
    ir(e.target.value);
  });
  $('scenario').value=pedido.cenario;
  render();
})();
