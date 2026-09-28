"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { EVENTO_ADICIONADA, type Adicionada } from "./sacolaNoNavegador";

const TEMPO_MS = 6000;

// Aviso de "entrou na sacola" (embaixo da tela) depois de adicionar sem sair da página: o nome
// da peça, o progresso do trio e o link para a sacola. Some sozinho; o leitor de tela ouve.
export function AvisoSacola() {
  const [atual, setAtual] = useState<(Adicionada & { vez: number }) | null>(null);

  useEffect(() => {
    const ouvir = (e: Event) => setAtual({ ...(e as CustomEvent<Adicionada>).detail, vez: Date.now() });
    window.addEventListener(EVENTO_ADICIONADA, ouvir);
    return () => window.removeEventListener(EVENTO_ADICIONADA, ouvir);
  }, []);

  useEffect(() => {
    if (!atual) return;
    const id = setTimeout(() => setAtual(null), TEMPO_MS);
    return () => clearTimeout(id);
  }, [atual]);

  return (
    <div role="status" aria-live="polite" aria-label="Aviso da sacola" className="pointer-events-none fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl md:inset-x-5">
      {atual && (
        <div className="pointer-events-auto grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-[20px] border-2 border-tinta bg-papel p-4 shadow-[5px_5px_0_var(--tc-citrino)]">
          <p className="m-0 text-sm leading-snug">
            {atual.aviso ?? <><b>{atual.nome}</b> entrou na sacola.{atual.progresso && <><br /><span className="font-bold text-rosa-press">{atual.progresso}</span></>}</>}
          </p>
          <button type="button" onClick={() => setAtual(null)} aria-label="Fechar aviso"
            className="tc-alvo relative grid size-9 place-items-center rounded-full border-[1.5px] border-tinta bg-papel">
            <X aria-hidden="true" className="size-4" strokeWidth={2} />
          </button>
          <Link href="/sacola" className="col-span-2 inline-flex min-h-11 w-fit items-center rounded-pilula border-2 border-tinta bg-tinta px-5 text-sm font-bold text-papel shadow-adesivo-sm">
            Ver sacola
          </Link>
        </div>
      )}
    </div>
  );
}
