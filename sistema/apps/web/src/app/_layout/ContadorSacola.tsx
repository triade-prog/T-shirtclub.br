"use client";

import { useSyncExternalStore } from "react";
import { COOKIE_SACOLA, lerSacola, pecasNaSacola } from "@/lib/sacola";

// Número de peças na pílula da sacola (V4). Lido do cookie no navegador para o cabeçalho
// continuar estático (a página sem conexão fica guardada pelo service worker).
function lerCookie(): string {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_SACOLA}=`));
  if (!par) return "";
  // Valor malformado (editado à mão) não pode derrubar o cabeçalho de todas as páginas.
  try { return decodeURIComponent(par.slice(COOKIE_SACOLA.length + 1)); } catch { return ""; }
}
// O cookie não avisa quando muda (Remover na sacola, outra aba): confere a cada segundo, e o
// React só redesenha quando o texto muda.
function assinar(aviso: () => void) {
  const id = setInterval(aviso, 1000);
  return () => clearInterval(id);
}

export function ContadorSacola() {
  const pecas = pecasNaSacola(lerSacola(useSyncExternalStore(assinar, lerCookie, () => "")));
  if (pecas === 0) return null;
  return (
    <span className="grid min-w-5.5 place-items-center rounded-full border-[1.5px] border-tinta bg-citrino px-1 text-[10px] text-no-citrino">
      {pecas}<span className="sr-only"> {pecas === 1 ? "peça" : "peças"}</span>
    </span>
  );
}
