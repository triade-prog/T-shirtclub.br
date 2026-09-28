"use client";

import { usePecasNaSacola } from "../_sacola/sacolaNoNavegador";

// Número de peças na pílula da sacola (V4). Lido do cookie no navegador para o cabeçalho
// continuar igual para todas as clientes (a página sem conexão fica guardada pelo service worker).
export function ContadorSacola() {
  const pecas = usePecasNaSacola();
  if (pecas === 0) return null;
  return (
    <span className="grid min-w-5.5 place-items-center rounded-full border-[1.5px] border-tinta bg-citrino px-1 text-[10px] text-no-citrino">
      {pecas}<span className="sr-only"> {pecas === 1 ? "peça" : "peças"}</span>
    </span>
  );
}
