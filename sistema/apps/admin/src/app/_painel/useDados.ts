"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { chamarApi, mensagemDeErro, precisaEntrar } from "@/lib/api";

/** GET na api-admin com recarga; sem sessão (ou sem o autenticador), vai para /entrar. */
export function useDados<T>(caminho: string | null) {
  const router = useRouter();
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Trocando de filtro rápido, a resposta do filtro anterior pode chegar depois: fica de fora.
  const atual = useRef(caminho);
  useEffect(() => { atual.current = caminho; }, [caminho]);

  const recarregar = useCallback(async () => {
    if (!caminho) return;
    const r = await chamarApi<T>(caminho);
    if (atual.current !== caminho) return;
    if (r.ok) {
      setDados(r.dados);
      setErro(null);
    } else if (precisaEntrar(r.codigo)) {
      router.replace(`/entrar?voltar=${encodeURIComponent(location.pathname + location.search)}`);
    } else {
      setErro(mensagemDeErro(r.codigo, r.detalhes));
    }
  }, [caminho, router]);

  useEffect(() => { void (async () => { await recarregar(); })(); }, [recarregar]);
  return { dados, erro, recarregar };
}
