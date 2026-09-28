"use client";

// Utilidades de navegador das telas da loja: sessionStorage tolerante (aba anônima, bloqueio)
// e consulta periódica que pausa com a aba escondida.
import { useEffect, useRef } from "react";

export function guardado(chave: string): string | null {
  try { return sessionStorage.getItem(chave); } catch { return null; }
}
export function guardar(chave: string, valor: string) {
  try { sessionStorage.setItem(chave, valor); } catch { /* sem armazenamento: a tela refaz a busca */ }
}

/** Como guardado/guardar, mas no localStorage: vale para as próximas visitas neste aparelho. */
export function lembrado(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
export function lembrar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: no pior caso, a página de aprovado abre de novo */ }
}

/** Repete `fn` a cada `ms` com a aba visível (e na volta para a aba). */
export function useRepetir(fn: () => void, ms: number, ligado: boolean) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    if (!ligado) return;
    const passo = () => { if (document.visibilityState === "visible") ref.current(); };
    const id = setInterval(passo, ms);
    document.addEventListener("visibilitychange", passo);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", passo); };
  }, [ms, ligado]);
}
