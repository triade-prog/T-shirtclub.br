"use client";

import { ProgressoClub } from "@tshirtclub/ui";
import { progressoTrio } from "@/lib/sacola";
import { usePecasNaSacola } from "./sacolaNoNavegador";

// Progresso do trio fora da sacola (início, coleção e peça): conta as peças que já estão na
// sacola e atualiza na hora em que a cliente adiciona uma, sem sair da página.
export function ProgressoDaSacola({ qtd, preco, titulo, texto, nivel, inicial }: {
  qtd: number;
  /** Preço do grupo já formatado ("R$ 119,99"). */
  preco: string;
  /** Título e texto com a sacola vazia. */
  titulo: React.ReactNode;
  texto: React.ReactNode;
  nivel?: 2 | 3;
  /** Cookie da sacola lido no servidor. */
  inicial?: string;
}) {
  const pecas = usePecasNaSacola(inicial);
  const p = progressoTrio(pecas, qtd);
  if (!p.titulo) return <ProgressoClub nivel={nivel} pecas={0} titulo={titulo} texto={texto} />;
  const falta = qtd - p.noTrio;
  return (
    <ProgressoClub nivel={nivel} pecas={pecas} titulo={p.titulo}
      texto={p.completo
        ? <><b className="tc-destaque">{qtd} peças por {preco}</b>, sem cupom. Dá para começar outro trio.</>
        : <>Com mais {falta === 1 ? "uma peça" : `${falta} peças`}, de qualquer coleção, você leva <b className="tc-destaque">{qtd} peças por {preco}</b>.</>} />
  );
}
