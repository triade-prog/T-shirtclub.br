"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { adicionarSemSair } from "../sacola/acoes";
import { avisarSacola } from "./sacolaNoNavegador";

// Formulário de "adicionar à sacola" (o + do cartão e o "Adicionar ao Club" da peça). Sem
// JavaScript é o GET /sacola?adicionar de sempre; com JavaScript, a peça entra na sacola sem
// sair da página e o aviso embaixo mostra o progresso do trio, com o link para a sacola.
export function FormSacola({ nome, className, children }: { nome: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();

  function enviar(e: FormEvent<HTMLFormElement>) {
    const dados = new FormData(e.currentTarget);
    const slug = dados.get("adicionar");
    const tamanho = dados.get("tamanho");
    // Sem tamanho escolhido, segue o caminho de sempre (o proxy leva à escolha na página da peça)
    if (typeof slug !== "string" || typeof tamanho !== "string") return;
    e.preventDefault();
    if (enviando) return;
    const semJs = `/sacola?${new URLSearchParams({ adicionar: slug, tamanho })}`;
    iniciar(async () => {
      try {
        const r = await adicionarSemSair(slug, tamanho);
        if (!r) return router.push(semJs);
        avisarSacola({ nome, progresso: r.progresso, aviso: r.aviso });
      } catch {
        // Sem resposta da ação (rede, versão nova publicada): o caminho sem JavaScript resolve
        router.push(semJs);
      }
    });
  }

  return <form action="/sacola" method="get" onSubmit={enviar} aria-busy={enviando || undefined} className={className}>{children}</form>;
}
