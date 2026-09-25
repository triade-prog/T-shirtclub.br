// Utilitários compartilhados do protótipo do Sistema de Reserva.
// O aviso fica pelo menos 5 s na tela (mais para textos longos), para dar tempo de ler.
// Na produção, erros de formulário aparecem também junto do campo, e não só neste aviso.
let toastTimer=null;
function toast(msg){
  const t=document.getElementById('toast'); if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),Math.max(5000,msg.length*70));
}
// Tabelas com rolagem lateral precisam receber foco para quem usa teclado.
document.querySelectorAll('.table-wrap').forEach(w=>{
  const titulo=w.closest('section,.card')?.querySelector('h2,h3');
  w.tabIndex=0;w.setAttribute('role','region');w.setAttribute('aria-label',titulo?titulo.textContent.trim():'Tabela');
});
