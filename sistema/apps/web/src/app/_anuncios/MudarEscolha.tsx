"use client";

import { Botao } from "@tshirtclub/ui";
import { CHAVE_CONSENTIMENTO } from "@/lib/anuncios";

// Na política de privacidade: apaga a escolha sobre os cookies de anúncio e recarrega a página,
// para o aviso aparecer de novo.
export function MudarEscolha() {
  function mudar() {
    try { localStorage.removeItem(CHAVE_CONSENTIMENTO); } catch { /* sem armazenamento: o aviso já aparece a cada visita */ }
    window.location.reload();
  }
  return <Botao variante="contorno" className="justify-self-start" onClick={mudar}>Mudar minha escolha de cookies</Botao>;
}
