"use client";

import { useEffect, useRef } from "react";

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
