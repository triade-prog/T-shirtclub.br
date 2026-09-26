"use client";

import { useState } from "react";
import { mensagemDeErro, type RespostaApi } from "@/lib/api";

/** Envio de um formulário do painel: ocupado, erro junto do formulário e o que fazer no fim. */
export function useEnvio<T = unknown>(aoConcluir: (dados: T) => void) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(chamada: Promise<RespostaApi<T>>): Promise<boolean> {
    setOcupado(true);
    setErro(null);
    const r = await chamada;
    setOcupado(false);
    if (r.ok) { aoConcluir(r.dados); return true; }
    setErro(mensagemDeErro(r.codigo, r.detalhes));
    return false;
  }
  return { ocupado, erro, setErro, enviar };
}
