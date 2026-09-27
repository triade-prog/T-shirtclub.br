"use client";

import { useEffect, useState } from "react";

/**
 * Relógio do servidor (R14): começa no "agora" que a API devolveu e anda com o relógio do
 * aparelho, corrigido pela diferença entre os dois. Um aparelho com a hora errada não adianta
 * nem atrasa o prazo, e quem decide a expiração continua sendo o banco. Anda a cada `passoMs`
 * com a aba visível e acerta na volta para a aba. Sem o "agora" da API, devolve null.
 */
export function useRelogioDoServidor(agoraDoServidor: string | undefined, passoMs = 1000, ligado = true): number | null {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    if (!agoraDoServidor || !ligado) return;
    const desvio = Date.parse(agoraDoServidor) - Date.now();
    const tique = () => { if (document.visibilityState === "visible") setAgora(Date.now() + desvio); };
    const id = setInterval(tique, passoMs);
    document.addEventListener("visibilitychange", tique);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tique); };
  }, [agoraDoServidor, passoMs, ligado]);
  if (!agoraDoServidor) return null;
  // Antes do primeiro tique (ou com o relógio parado), vale o "agora" da última resposta.
  return agora !== null && ligado ? Math.max(agora, Date.parse(agoraDoServidor)) : Date.parse(agoraDoServidor);
}
