"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Botao } from "@tshirtclub/ui";
import { carregarTag, gravarConsentimento, lerConsentimento } from "@/lib/anuncios";

// Tag do Google Ads com o aviso de cookies de anúncio (LGPD): sem aceite, a tag não carrega e
// nada vai para o Google. A escolha fica neste aparelho; o aviso só aparece enquanto não houver.
export function TagGoogle({ id }: { id: string }) {
  const [perguntar, setPerguntar] = useState(false);

  useEffect(() => {
    const escolha = lerConsentimento();
    if (escolha === "aceito") carregarTag(id);
    // Depois de montar (o servidor não conhece a escolha): evita piscar o aviso para quem já decidiu
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else if (escolha === null) setPerguntar(true);
  }, [id]);

  if (!perguntar) return null;

  function decidir(aceitou: boolean) {
    gravarConsentimento(aceitou ? "aceito" : "recusado");
    if (aceitou) carregarTag(id);
    setPerguntar(false);
  }

  return (
    <section aria-label="Cookies de anúncio"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto grid max-w-xl gap-3 rounded-[20px] border-2 border-tinta bg-papel p-4 shadow-[5px_5px_0_var(--tc-citrino)] md:inset-x-5">
      <p className="m-0 text-sm leading-relaxed">
        Usamos cookies do Google para saber quais anúncios trouxeram você até aqui. Isso não muda nada no seu pedido.{" "}
        <Link href="/privacidade" className="font-semibold underline decoration-rosa decoration-2 underline-offset-2">Política de privacidade</Link>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao onClick={() => decidir(true)}>Aceitar</Botao>
        <Botao variante="contorno" onClick={() => decidir(false)}>Agora não</Botao>
      </div>
    </section>
  );
}
