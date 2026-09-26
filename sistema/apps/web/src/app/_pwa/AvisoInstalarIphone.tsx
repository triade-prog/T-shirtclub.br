"use client";

import { useSyncExternalStore } from "react";
import { Aviso } from "@tshirtclub/ui";

const CHAVE = "tshirtclub:aviso-instalar-iphone";
const EVENTO = "tshirtclub:aviso-instalar-iphone";
let dispensadoNestaVisita = false; // navegação privada sem armazenamento

function dispensado(): boolean {
  if (dispensadoNestaVisita) return true;
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

function deveMostrar(): boolean {
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return iphone && !instalada && !dispensado();
}

function assinar(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

function dispensar(): void {
  dispensadoNestaVisita = true;
  try {
    localStorage.setItem(CHAVE, "1");
  } catch {
    // sem armazenamento, vale só para esta visita
  }
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * No iPhone não há aviso de instalação do navegador: a loja ensina o caminho pelo menu
 * Compartilhar (seção 2b). Some depois de instalada ou quando a cliente dispensa. No
 * servidor não aparece (só o navegador sabe se é iPhone e se já está instalada).
 */
export function AvisoInstalarIphone() {
  const mostrar = useSyncExternalStore(assinar, deveMostrar, () => false);
  if (!mostrar) return null;
  return (
    <div className="px-4 pt-4" data-aviso="instalar-iphone">
      <Aviso tipo="marca" titulo="Tenha a loja na tela do seu iPhone">
        <p className="m-0 mt-1 text-sm">
          Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. Nos lançamentos, a loja abre num toque.
        </p>
        <button
          type="button"
          className="mt-2 min-h-11 rounded-campo px-2 text-sm font-semibold underline decoration-rosa decoration-2 underline-offset-2"
          onClick={dispensar}
        >
          Agora não
        </button>
      </Aviso>
    </div>
  );
}
