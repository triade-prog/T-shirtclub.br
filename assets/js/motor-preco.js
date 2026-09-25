// Motor de preço do protótipo. Espelha a regra decidida (P6): vale só a promoção mais vantajosa.
// Entrada: itens [{produto, qtd}] e, opcionalmente, o código de cupom digitado.
// Saída: subtotal, desconto, total, promoção aplicada e a situação do cupom.
const MotorPreco=(function(){
  function ativa(pr){return situacaoPromocao(pr).texto==='Ativa';}
  function cobre(pr,produtoId){return pr.escopo==='TODOS'||pr.produtos.includes(produtoId);}
  function pctDe(valorCentavos,pct){return Math.round(valorCentavos*pct/100);}

  // Preço promocional do produto por um desconto do produto ativo (ou null).
  function precoPromocional(produto){
    const pr=PROMOCOES.find(x=>x.tipo==='DESCONTO_PRODUTO'&&ativa(x)&&x.produtos.includes(produto.id));
    if(!pr)return null;
    const v=pr.valores[produto.id];
    return {promocao:pr,preco:pr.modo==='PERCENTUAL'?produto.precoCentavos-pctDe(produto.precoCentavos,v):v};
  }

  function candidatoDescontoProduto(pr,linhas){
    const desconto=linhas.filter(l=>pr.produtos.includes(l.produto.id)).reduce((a,l)=>{
      const v=pr.valores[l.produto.id];
      const unit=pr.modo==='PERCENTUAL'?pctDe(l.produto.precoCentavos,v):l.produto.precoCentavos-v;
      return a+unit*l.qtd;
    },0);
    return desconto>0?{promocao:pr,desconto,rotulo:pr.nome}:null;
  }

  function candidatoCompreMais(pr,linhas){
    const part=linhas.filter(l=>cobre(pr,l.produto.id));
    const pecas=part.reduce((a,l)=>a+l.qtd,0);
    const nivel=[...pr.niveis].reverse().find(n=>pecas>=n.qtd);
    if(!nivel)return null;
    const desconto=part.reduce((a,l)=>a+pctDe(l.produto.precoCentavos*l.qtd,nivel.pct),0);
    if(pr.orcamentoCentavos!=null&&pr.usadoCentavos+desconto>pr.orcamentoCentavos)return null; // orçamento esgotado
    return {promocao:pr,desconto,rotulo:`${pr.nome} (${pecas} peças, ${nivel.pct}%)`};
  }

  // Retorna {candidato} ou {erro} explicando por que o cupom não vale.
  function avaliarCupom(codigo,linhas,subtotal){
    const pr=PROMOCOES.find(x=>x.tipo==='CUPOM'&&x.codigo===codigo);
    if(!pr)return {erro:'Cupom não encontrado. Confira o código.'};
    const sit=situacaoPromocao(pr).texto;
    if(sit==='Agendada')return {erro:`Este cupom começa a valer em ${dataHora(pr.inicio)}.`};
    if(sit==='Encerrada')return {erro:'Este cupom não está mais válido.'};
    if(pr.usados>=pr.quantidade)return {erro:'Este cupom esgotou.'};
    if(pr.gastoMinimoCentavos&&subtotal<pr.gastoMinimoCentavos)return {erro:`Este cupom vale para compras a partir de ${reais(pr.gastoMinimoCentavos)}.`};
    const base=linhas.filter(l=>cobre(pr,l.produto.id)).reduce((a,l)=>a+l.produto.precoCentavos*l.qtd,0);
    if(!base)return {erro:'Este cupom não vale para os produtos escolhidos.'};
    let desconto=pr.modo==='VALOR'?Math.min(pr.valor,base):pctDe(base,pr.valor);
    if(pr.modo==='PERCENTUAL'&&pr.descontoMaximoCentavos)desconto=Math.min(desconto,pr.descontoMaximoCentavos);
    return {candidato:{promocao:pr,desconto,rotulo:`Cupom ${pr.codigo}`}};
  }

  function calcular(itens,codigoCupom){
    const linhas=itens.filter(i=>i.qtd>0).map(i=>({produto:produtoPorId(i.produto),qtd:i.qtd}));
    const subtotal=linhas.reduce((a,l)=>a+l.produto.precoCentavos*l.qtd,0);
    const candidatos=[];
    PROMOCOES.filter(ativa).forEach(pr=>{
      const c=pr.tipo==='DESCONTO_PRODUTO'?candidatoDescontoProduto(pr,linhas):pr.tipo==='COMPRE_MAIS'?candidatoCompreMais(pr,linhas):null;
      if(c)candidatos.push(c);
    });
    let cupom=null;
    const codigo=(codigoCupom||'').trim().toUpperCase();
    if(codigo){
      const r=avaliarCupom(codigo,linhas,subtotal);
      cupom=r.erro?{codigo,situacao:'INVALIDO',mensagem:r.erro}:{codigo,situacao:'AVALIADO',candidato:r.candidato};
      if(r.candidato)candidatos.push(r.candidato);
    }
    // Maior desconto vence; no empate, a promoção automática fica e o cupom não é gasto.
    let melhor=null;
    candidatos.forEach(c=>{
      const eCupom=c.promocao.tipo==='CUPOM';
      if(!melhor||c.desconto>melhor.desconto||(c.desconto===melhor.desconto&&melhor.promocao.tipo==='CUPOM'&&!eCupom))melhor=c;
    });
    if(melhor)melhor.desconto=Math.min(melhor.desconto,subtotal);
    if(cupom&&cupom.situacao==='AVALIADO'){
      const aplicado=melhor&&melhor.promocao.tipo==='CUPOM';
      cupom.situacao=aplicado?'APLICADO':'NAO_E_O_MELHOR';
      cupom.mensagem=aplicado?`Cupom ${codigo} aplicado.`:'Você já tem um desconto maior. O cupom não foi usado e continua disponível.';
    }
    const desconto=melhor?melhor.desconto:0;
    return {linhas,subtotal,desconto,total:subtotal-desconto,aplicada:melhor,cupom,pecas:linhas.reduce((a,l)=>a+l.qtd,0)};
  }

  return {calcular,precoPromocional};
})();
