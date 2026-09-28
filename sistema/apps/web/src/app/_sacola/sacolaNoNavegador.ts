"use client";

import { useSyncExternalStore } from "react";
import { COOKIE_SACOLA, lerSacola, pecasNaSacola } from "@/lib/sacola";

// A sacola vista do navegador: o cookie (não é httpOnly) lido a cada segundo e na hora em que a
// loja adiciona uma peça sem sair da página (evento "tc-sacola"). O contador do cabeçalho, o
// progresso do trio e o aviso de "entrou na sacola" leem daqui.

export const EVENTO_SACOLA = "tc-sacola";
export const EVENTO_ADICIONADA = "tc-sacola-adicionada";

/** O que o aviso mostra depois de adicionar sem sair da página. */
export interface Adicionada { nome: string; progresso: string | null; aviso: string | null }

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
  window.addEventListener(EVENTO_SACOLA, aviso);
  return () => { clearInterval(id); window.removeEventListener(EVENTO_SACOLA, aviso); };
}

/**
 * Peças na sacola. `inicial` é o cookie lido no servidor, para a página já chegar com o número
 * certo (sem ele, o servidor desenha zero e o navegador corrige).
 */
export function usePecasNaSacola(inicial = ""): number {
  return pecasNaSacola(lerSacola(useSyncExternalStore(assinar, lerCookie, () => inicial)));
}

/** Avisa a página de que a sacola mudou (contador, progresso e o aviso de peça adicionada). */
export function avisarSacola(adicionada: Adicionada) {
  window.dispatchEvent(new Event(EVENTO_SACOLA));
  window.dispatchEvent(new CustomEvent<Adicionada>(EVENTO_ADICIONADA, { detail: adicionada }));
}
