// Carrinho do protótipo: seleção da cliente guardada no navegador entre as páginas 01 a 05.
// Sem dado salvo (ou sem acesso ao armazenamento), usa uma seleção de exemplo.
const Carrinho=(function(){
  const CHAVE='prototipo-reserva-carrinho';
  const EXEMPLO={itens:{p1:1,p3:1,p2:1},cupom:'',dados:{nome:'Marina Souza',telefone:'(77) 99812-8809',entrega:'Retirada'}};
  const MAX_PECAS=9, MAX_POR_PRODUTO=2;

  function ler(){
    try{const s=JSON.parse(localStorage.getItem(CHAVE));if(s&&s.itens)return s;}catch(e){}
    return JSON.parse(JSON.stringify(EXEMPLO));
  }
  function salvar(estado){try{localStorage.setItem(CHAVE,JSON.stringify(estado));}catch(e){}}
  function itens(estado){return Object.entries(estado.itens).filter(([,q])=>q>0).map(([produto,qtd])=>({produto,qtd}));}
  function pecas(estado){return itens(estado).reduce((a,i)=>a+i.qtd,0);}

  // Retorna mensagem de erro, ou null se a peça pôde ser adicionada.
  function adicionar(estado,produtoId){
    const p=produtoPorId(produtoId), atual=estado.itens[produtoId]||0;
    if(disponivel(p)<=0)return 'Produto esgotado.';
    if(atual>=MAX_POR_PRODUTO)return 'Máximo de 2 unidades do mesmo modelo.';
    if(atual>=disponivel(p))return `Só ${disponivel(p)} unidade(s) disponível(is) agora.`;
    if(pecas(estado)>=MAX_PECAS)return 'Máximo de 9 peças por reserva.';
    estado.itens[produtoId]=atual+1;return null;
  }
  function remover(estado,produtoId){
    if(estado.itens[produtoId])estado.itens[produtoId]--;
  }
  function vazio(){return {itens:{},cupom:'',dados:{}};}
  function temSalvo(){try{return !!localStorage.getItem(CHAVE);}catch(e){return false;}}

  return {ler,salvar,itens,pecas,adicionar,remover,vazio,temSalvo};
})();
