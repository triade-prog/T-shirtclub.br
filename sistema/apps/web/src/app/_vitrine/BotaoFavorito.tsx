"use client";

import { Heart } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cx } from "@tshirtclub/ui";

// Favoritar da V4 (coração no cartão e na página do produto). Fica só neste navegador; a
// lista de favoritos entra quando houver a página dela.
const CHAVE = "tc-favoritos";

function ler(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// Os corações da página acompanham a mesma lista (e as outras abas, pelo evento "storage").
const avisos = new Set<() => void>();
function assinar(aviso: () => void) {
  avisos.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    avisos.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}
const lerTexto = () => ler().join("\n");

export function BotaoFavorito({ slug, nome, className }: { slug: string; nome: string; className?: string }) {
  const ativo = useSyncExternalStore(assinar, lerTexto, () => "").split("\n").includes(slug);

  function alternar() {
    const lista = ler().filter((s) => s !== slug);
    if (!ativo) lista.push(slug);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(lista));
    } catch {
      // Sem armazenamento (aba anônima): o coração não guarda a escolha.
    }
    avisos.forEach((a) => a());
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={ativo}
      aria-label={`Favoritar ${nome}`}
      className={cx("grid place-items-center rounded-full border-[1.5px] border-tinta bg-papel/90", className)}
    >
      <Heart aria-hidden="true" className={cx("size-4.5", ativo ? "fill-rosa stroke-rosa" : "fill-none")} strokeWidth={1.7} />
    </button>
  );
}
