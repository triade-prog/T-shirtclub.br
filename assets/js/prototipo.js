// Utilitários compartilhados do protótipo do Sistema de Reserva.
function toast(msg){
  const t=document.getElementById('toast'); if(!t)return;
  t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);
}
