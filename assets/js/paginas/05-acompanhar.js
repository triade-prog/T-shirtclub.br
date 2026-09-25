// Consulta pelo site com validação invertida: a cliente pede o código pelo WhatsApp.
(function(){
  const NUMERO_LOJA='5577998155772';
  const REF='P3M8';
  const TEXTO=`Quero consultar minhas reservas (ref. ${REF})`;

  document.getElementById('lookupForm').addEventListener('submit',e=>{
    e.preventDefault();
    if(!e.target.reportValidity())return;
    // No sistema real, abre o WhatsApp com a mensagem pronta.
    const link=`https://wa.me/${NUMERO_LOJA}?text=${encodeURIComponent(TEXTO)}`;
    document.getElementById('otpLookup').hidden=false;
    toast('Abrindo o WhatsApp: '+decodeURIComponent(link.split('text=')[1]));
  });
  document.getElementById('simulateLookup').addEventListener('click',()=>{
    document.getElementById('lookupWait').hidden=true;
    document.getElementById('lookupCodeBox').hidden=false;
    toast('Código enviado no WhatsApp.');
  });
  document.getElementById('confirmLookup').addEventListener('click',()=>{
    if(document.getElementById('lookupCode').value.length<6)return toast('Digite o código de 6 dígitos.');
    document.getElementById('results').hidden=false;
    toast('WhatsApp validado.');
  });
})();
