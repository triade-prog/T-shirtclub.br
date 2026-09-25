// Dados de exemplo compartilhados pelas telas administrativas do protótipo.
// Valores em centavos, como no desenho técnico. Nada aqui é persistido.
const LIMITE_ULTIMAS_UNIDADES=2;

const COLECOES=['Teddy','Dog Club','Trendy'];

const PRODUTOS=[
  {id:'p1',nome:'Teddy Rose',modelo:'TED-ROSE',colecao:'Teddy',precoCentavos:4990,promo:true,ativo:true},
  {id:'p2',nome:'Teddy Bleu',modelo:'TED-BLEU',colecao:'Teddy',precoCentavos:4990,promo:true,ativo:true},
  {id:'p3',nome:'Dog Club 01',modelo:'DOG-01',colecao:'Dog Club',precoCentavos:4990,promo:true,ativo:true},
  {id:'p4',nome:'Dog Club 02',modelo:'DOG-02',colecao:'Dog Club',precoCentavos:4990,promo:true,ativo:true},
  {id:'p5',nome:'Trendy Teddy',modelo:'TRD-TEDDY',colecao:'Trendy',precoCentavos:4990,promo:true,ativo:true},
  {id:'p6',nome:'Urso Listras',modelo:'TRD-URSO',colecao:'Trendy',precoCentavos:4990,promo:true,ativo:true}
];

// total = unidades físicas; reservado e vendido mudam só pelo fluxo de reservas.
const VARIACOES=[
  {id:'v01',produto:'p1',tamanho:'P',total:6,reservado:1,vendido:2},
  {id:'v02',produto:'p1',tamanho:'M',total:8,reservado:0,vendido:3},
  {id:'v03',produto:'p1',tamanho:'G',total:6,reservado:1,vendido:1},
  {id:'v04',produto:'p2',tamanho:'P',total:3,reservado:0,vendido:3},
  {id:'v05',produto:'p2',tamanho:'M',total:4,reservado:1,vendido:2},
  {id:'v06',produto:'p2',tamanho:'G',total:3,reservado:0,vendido:2},
  {id:'v07',produto:'p3',tamanho:'M',total:10,reservado:1,vendido:4},
  {id:'v08',produto:'p3',tamanho:'G',total:8,reservado:0,vendido:2},
  {id:'v09',produto:'p3',tamanho:'GG',total:4,reservado:0,vendido:1},
  {id:'v10',produto:'p4',tamanho:'M',total:8,reservado:2,vendido:3},
  {id:'v11',produto:'p4',tamanho:'G',total:6,reservado:0,vendido:1},
  {id:'v12',produto:'p5',tamanho:'P',total:4,reservado:1,vendido:2},
  {id:'v13',produto:'p5',tamanho:'M',total:4,reservado:0,vendido:3},
  {id:'v14',produto:'p6',tamanho:'M',total:5,reservado:1,vendido:4},
  {id:'v15',produto:'p6',tamanho:'G',total:4,reservado:0,vendido:4}
];

const MOVIMENTOS=[
  {quando:'25/09 09:12',sku:'DOG-02-M',tipo:'RESERVA',qtd:1,reserva:'#1048',autor:'Sistema',motivo:'Reserva criada'},
  {quando:'25/09 08:57',sku:'TRD-URSO-M',tipo:'VENDA',qtd:1,reserva:'#1047',autor:'Sistema',motivo:'Pagamento confirmado'},
  {quando:'25/09 08:40',sku:'TED-ROSE-P',tipo:'LIBERACAO',qtd:1,reserva:'#1046',autor:'Sistema',motivo:'Reserva expirada'},
  {quando:'24/09 17:05',sku:'DOG-01-M',tipo:'ENTRADA',qtd:6,reserva:'—',autor:'Paula (admin)',motivo:'Chegada do fornecedor, NF 3321'},
  {quando:'24/09 16:48',sku:'TED-BLEU-G',tipo:'AJUSTE',qtd:-1,reserva:'—',autor:'Paula (admin)',motivo:'Peça com defeito de estampa'}
];

function variacoesDo(produtoId){return VARIACOES.filter(v=>v.produto===produtoId);}
function produtoDe(variacao){return PRODUTOS.find(p=>p.id===variacao.produto);}
function skuDe(variacao){return `${produtoDe(variacao).modelo}-${variacao.tamanho}`;}
function disponivel(v){return v.total-v.reservado-v.vendido;}
function situacaoEstoque(qtd){
  if(qtd<=0)return {texto:'Esgotado',classe:'danger'};
  if(qtd<=LIMITE_ULTIMAS_UNIDADES)return {texto:'Últimas unidades',classe:'warning'};
  return {texto:'Disponível',classe:'success'};
}
function reais(centavos){return (centavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function escaparHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
