"use client";

import { createContext, useContext, useState } from "react";

// Barra lateral recolhida no computador (pedido da loja, 03/10): fica só com os ícones e os
// contadores. A escolha vale para todas as telas e fica guardada num cookie, que o layout lê no
// servidor para a tela já abrir do jeito escolhido, sem piscar.

const COOKIE_MENU = "painel_menu";

interface Menu { recolhido: boolean; alternar: () => void }
const ContextoMenu = createContext<Menu>({ recolhido: false, alternar: () => {} });
export const useMenuRecolhido = () => useContext(ContextoMenu);

export function MenuRecolhido({ inicial, children }: { inicial: boolean; children: React.ReactNode }) {
  const [recolhido, setRecolhido] = useState(inicial);
  function alternar() {
    const novo = !recolhido;
    setRecolhido(novo);
    const seguro = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${COOKIE_MENU}=${novo ? "recolhido" : "aberto"}; path=/; max-age=31536000; samesite=lax${seguro}`;
  }
  return <ContextoMenu.Provider value={{ recolhido, alternar }}>{children}</ContextoMenu.Provider>;
}
