// Dados de exemplo compartilhados pelas telas administrativas do protótipo.
// Valores em centavos, como no desenho técnico. Nada aqui é persistido.
// Todas as peças são de tamanho único: o estoque é controlado por produto.
const LIMITE_ULTIMAS_UNIDADES=2;

const COLECOES=['Teddy','Dog Club','Trendy'];

// Cores de coleção aprovadas (contraste e daltonismo validados). A loja escolhe da lista; não digita cor.
// A cor nunca identifica a coleção sozinha: o nome aparece junto.
const CORES_COLECAO=[
  {id:'TOMATE',nome:'Vermelho tomate',cor:'#EE4A2A'},
  {id:'LIMAO',nome:'Amarelo limão',cor:'#F2DD3D'},
  {id:'MEDITERRANEO',nome:'Azul mediterrâneo',cor:'#2F6FD0'},
  {id:'LAVANDA',nome:'Lavanda',cor:'#A77BE0'},
  {id:'MENTA',nome:'Menta',cor:'#2FA58A'}
];
const COR_DA_COLECAO={'Teddy':'TOMATE','Dog Club':'MEDITERRANEO','Trendy':'LIMAO'};

// Tipos de foto do produto (1 a 10 fotos; a primeira é a capa na vitrine).
const TIPOS_FOTO={FRENTE:'Frente',COSTAS:'Costas',DETALHE:'Detalhe da estampa',VESTIDA:'Vestida',CAMPANHA:'Campanha'};
const MAX_FOTOS=10;

// total = unidades físicas; reservado e vendido mudam só pelo fluxo de reservas.
const PRODUTOS=[
  {id:'p1',nome:'Teddy Rose',codigo:'TED-ROSE',colecao:'Teddy',precoCentavos:4999,fotos:[],ativo:true,total:20,reservado:2,vendido:6},
  {id:'p2',nome:'Teddy Bleu',codigo:'TED-BLEU',colecao:'Teddy',precoCentavos:4999,fotos:[],ativo:true,total:10,reservado:1,vendido:7},
  {id:'p3',nome:'Dog Club 01',codigo:'DOG-01',colecao:'Dog Club',precoCentavos:4999,fotos:[],ativo:true,total:22,reservado:1,vendido:7},
  {id:'p4',nome:'Dog Club 02',codigo:'DOG-02',colecao:'Dog Club',precoCentavos:4999,fotos:[],ativo:true,total:14,reservado:2,vendido:4},
  {id:'p5',nome:'Trendy Teddy',codigo:'TRD-TEDDY',colecao:'Trendy',precoCentavos:4999,fotos:[],ativo:true,total:8,reservado:1,vendido:5},
  {id:'p6',nome:'Urso Listras',codigo:'TRD-URSO',colecao:'Trendy',precoCentavos:4999,fotos:[],ativo:true,total:9,reservado:1,vendido:8}
];

const MOVIMENTOS=[
  {quando:'25/09 09:12',codigo:'DOG-02',tipo:'RESERVA',qtd:1,reserva:'#1048',autor:'Sistema',motivo:'Reserva criada'},
  {quando:'25/09 08:57',codigo:'TRD-URSO',tipo:'VENDA',qtd:1,reserva:'#1047',autor:'Sistema',motivo:'Pagamento confirmado'},
  {quando:'25/09 08:40',codigo:'TED-ROSE',tipo:'LIBERACAO',qtd:1,reserva:'#1046',autor:'Sistema',motivo:'Reserva expirada'},
  {quando:'24/09 17:05',codigo:'DOG-01',tipo:'ENTRADA',qtd:6,reserva:'—',autor:'Carol (admin)',motivo:'Chegada do fornecedor, NF 3321'},
  {quando:'24/09 16:48',codigo:'TED-BLEU',tipo:'AJUSTE',qtd:-1,reserva:'—',autor:'Carol (admin)',motivo:'Peça com defeito de estampa'}
];

// Promoções nos três formatos: desconto do produto, compre e economize mais, cupom.
const PROMOCOES=[
  // Oferta principal (D19): cada grupo de 3 peças sai por R$ 119,99; as que sobram pagam o preço normal.
  {id:'pr1',tipo:'COMPRE_MAIS',modo:'PRECO_POR_GRUPO',nome:'Monte seu Club',inicio:'2026-09-20T09:00',fim:'2026-11-24T23:59',desativada:false,
    escopo:'TODOS',produtos:[],grupo:{qtd:3,precoCentavos:11999},umaPorCliente:false,orcamentoCentavos:null,usadoCentavos:17988},
  {id:'pr6',tipo:'COMPRE_MAIS',modo:'NIVEIS',nome:'Leve 3, ganhe 20%',inicio:'2026-08-01T09:00',fim:'2026-09-19T23:59',desativada:false,
    escopo:'TODOS',produtos:[],niveis:[{qtd:3,pct:20},{qtd:6,pct:25}],umaPorCliente:false,orcamentoCentavos:null,usadoCentavos:18450},
  {id:'pr2',tipo:'DESCONTO_PRODUTO',nome:'Semana Dog Club',inicio:'2026-09-22T00:00',fim:'2026-10-07T23:59',desativada:false,
    escopo:'ESPECIFICOS',produtos:['p3','p4'],modo:'PERCENTUAL',valores:{p3:15,p4:15}},
  {id:'pr3',tipo:'CUPOM',nome:'Boas-vindas',codigo:'BEMVINDA10',inicio:'2026-09-15T00:00',fim:'2026-12-31T23:59',desativada:false,
    escopo:'TODOS',produtos:[],modo:'VALOR',valor:1000,descontoMaximoCentavos:null,gastoMinimoCentavos:8990,quantidade:1000,usados:37,porCliente:1,validadeDias:3},
  {id:'pr5',tipo:'CUPOM',nome:'Primavera 15%',codigo:'PRIMAVERA15',inicio:'2026-10-10T00:00',fim:'2026-10-31T23:59',desativada:false,
    escopo:'TODOS',produtos:[],modo:'PERCENTUAL',valor:15,descontoMaximoCentavos:3000,gastoMinimoCentavos:null,quantidade:300,usados:0,porCliente:1,validadeDias:7},
  {id:'pr4',tipo:'DESCONTO_PRODUTO',nome:'Queima Teddy',inicio:'2026-09-01T00:00',fim:'2026-09-10T23:59',desativada:false,
    escopo:'ESPECIFICOS',produtos:['p1','p2'],modo:'PRECO_FIXO',valores:{p1:3990,p2:3990}}
];

const TIPOS_PROMOCAO={
  DESCONTO_PRODUTO:{rotulo:'Desconto do produto',pagina:'15-admin-desconto-produto.html'},
  COMPRE_MAIS:{rotulo:'Compre e economize mais',pagina:'16-admin-compre-mais.html'},
  CUPOM:{rotulo:'Cupom',pagina:'17-admin-cupom.html'}
};

// "Agora" fixo do protótipo, para as situações das promoções serem estáveis.
const AGORA_PROTOTIPO=new Date('2026-09-25T10:00');

function produtoPorId(id){return PRODUTOS.find(p=>p.id===id);}
function disponivel(p){return p.total-p.reservado-p.vendido;}
function situacaoEstoque(qtd){
  if(qtd<=0)return {texto:'Esgotado',classe:'danger'};
  if(qtd<=LIMITE_ULTIMAS_UNIDADES)return {texto:'Últimas unidades',classe:'warning'};
  return {texto:'Disponível',classe:'success'};
}
function situacaoPromocao(pr){
  if(pr.desativada)return {texto:'Encerrada',classe:''};
  const ini=new Date(pr.inicio), fim=new Date(pr.fim);
  if(AGORA_PROTOTIPO<ini)return {texto:'Agendada',classe:'warning'};
  if(AGORA_PROTOTIPO>fim)return {texto:'Encerrada',classe:''};
  return {texto:'Ativa',classe:'success'};
}
function promocoesAtivasDo(produtoId){
  return PROMOCOES.filter(pr=>situacaoPromocao(pr).texto==='Ativa'&&(pr.escopo==='TODOS'||pr.produtos.includes(produtoId)));
}
function reais(centavos){return (centavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function dataHora(iso){return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','');}
function escaparHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
