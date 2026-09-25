// Criar cupom: valor ou porcentagem, gasto mínimo, quantidade total, limite por cliente e escopo.
(function(){
  const MAX_CUPONS=9999999;
  FormPromocao.nome('nome','nomeCount','Cupom');
  FormPromocao.periodo('inicio','fim');
  let selecionados=[];

  const modo=FormPromocao.alternar('modo',v=>{
    document.getElementById('valorLabel').textContent=v==='PERCENTUAL'?'Porcentagem de desconto (%)':'Valor do desconto (R$)';
    estimar();
  });
  const minimo=FormPromocao.alternar('minimo');
  const escopo=FormPromocao.alternar('escopo');
  const validade=FormPromocao.stepper(document.getElementById('validade'),{min:1,max:90});
  const porCliente=FormPromocao.stepper(document.getElementById('porCliente'),{min:1,max:10});

  function descontoPorUso(){
    const v=document.getElementById('valor').value;
    if(modo()==='VALOR'){const c=FormPromocao.centavos(v);return c>0?c:null;}
    const teto=FormPromocao.centavos(document.getElementById('teto').value);
    return teto>0?teto:null; // porcentagem sem teto: custo depende do carrinho
  }

  function estimar(){
    const q=parseInt(document.getElementById('quantidade').value,10);
    const ok=Number.isInteger(q)&&q>=1&&q<=MAX_CUPONS;
    document.getElementById('claimable').textContent=ok?q.toLocaleString('pt-BR'):'--';
    const d=descontoPorUso();
    document.getElementById('estimate').textContent=ok&&d?reais(d*q)+(modo()==='PERCENTUAL'?' (no máximo)':''):'--';
  }
  ['valor','teto','quantidade'].forEach(id=>document.getElementById(id).addEventListener('input',estimar));

  document.getElementById('pickBtn').addEventListener('click',()=>SeletorProdutos.abrir({selecionados,aoConfirmar:ids=>{
    selecionados=ids;document.getElementById('pickSummary').textContent=SeletorProdutos.resumo(ids)+' ›';}}));

  document.getElementById('form').addEventListener('submit',e=>{
    e.preventDefault();
    if(!document.getElementById('nome').value.trim())return toast('Informe o nome do cupom.');
    const codigo=document.getElementById('codigo').value.trim().toUpperCase();
    if(!/^[A-Z0-9]{4,20}$/.test(codigo))return toast('Código: 4 a 20 letras ou números, sem espaços.');
    if(PROMOCOES.some(pr=>pr.tipo==='CUPOM'&&pr.codigo===codigo))return toast('Já existe um cupom com esse código.');
    const erroPeriodo=FormPromocao.validarPeriodo('inicio','fim');if(erroPeriodo)return toast(erroPeriodo);
    const v=document.getElementById('valor').value;
    if(modo()==='VALOR'&&!(FormPromocao.centavos(v)>0))return toast('Informe o valor do desconto.');
    if(modo()==='PERCENTUAL'){const p=parseInt(v,10);if(!(p>=1&&p<=90))return toast('A porcentagem deve ser de 1% a 90%.');}
    if(minimo()==='DEFINIR'){
      const m=FormPromocao.centavos(document.getElementById('gastoMinimo').value);
      if(!(m>0))return toast('Informe o gasto mínimo.');
      if(modo()==='VALOR'&&FormPromocao.centavos(v)>=m)return toast('O desconto precisa ser menor que o gasto mínimo.');
    }
    const q=parseInt(document.getElementById('quantidade').value,10);
    if(!(q>=1&&q<=MAX_CUPONS))return toast('Quantidade de uso: de 1 a 9.999.999.');
    if(escopo()==='ESPECIFICOS'&&!selecionados.length)return toast('Selecione os produtos do cupom.');
    FormPromocao.publicado(`Cupom ${codigo} publicado. Validade de ${validade.valor()} dia(s), até ${porCliente.valor()} uso(s) por cliente.`);
  });

  estimar();
})();
