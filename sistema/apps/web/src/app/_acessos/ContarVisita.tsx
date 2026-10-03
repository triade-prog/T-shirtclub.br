"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Acessos (0520): a cada página vista, um aviso para /api/v1/visita com o endereço e, só na
 * primeira página da visita, de onde ela veio (utm_source ou o endereço anterior). Sem cookie e
 * sem guardar nada no navegador; o aviso não segura a página nem a troca de página.
 */
export function ContarVisita() {
  const caminho = usePathname();
  const primeira = useRef(true);
  useEffect(() => {
    if (!caminho) return;
    const corpo: { caminho: string; origem?: string } = { caminho };
    if (primeira.current) {
      primeira.current = false;
      corpo.origem = new URLSearchParams(location.search).get("utm_source") ?? document.referrer;
    }
    // keepalive: o aviso sai mesmo se a cliente trocar de página ou fechar logo
    fetch("/api/v1/visita", { method: "POST", body: JSON.stringify(corpo), keepalive: true, headers: { "content-type": "application/json" } })
      .catch(() => undefined);
  }, [caminho]);
  return null;
}
