"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Aviso } from "@tshirtclub/ui";
import { chamarApi, mensagemDeErro } from "@/lib/api";

// Abre a reserva do link: troca a chave do fragmento por uma sessão só desta reserva
// (escopo RESERVA, ou mantém a do telefone se a cliente já tinha) e segue para a página dela.
// A chave sai da barra de endereço logo que é lida (não fica no histórico nem em capturas).

export function AbrirLink() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function abrir() {
      const chave = location.hash.slice(1);
      history.replaceState(null, "", "/r");
      await Promise.resolve(); // o estado muda depois de um await, fora do corpo do efeito
      setErro(null);
      if (!/^[0-9A-Za-z]{22}$/.test(chave)) return setErro("Este link não está completo. Abra de novo pela mensagem do WhatsApp.");
      const r = await chamarApi<{ reserva: { id: string; numero: number } }>("v1/r", { chave });
      if (!r.ok) {
        return setErro(r.codigo === "NOT_FOUND"
          ? "Este link não vale mais ou não está completo. Abra de novo pela mensagem do WhatsApp."
          : mensagemDeErro(r.codigo, r.detalhes));
      }
      try { sessionStorage.setItem(`tc-reserva-${r.dados.reserva.numero}`, r.dados.reserva.id); } catch { /* a página procura pelo número */ }
      router.replace(`/reserva/${r.dados.reserva.numero}`);
    }
    const aoMudar = () => void abrir();
    aoMudar();
    // Outro link aberto com a página já em /r muda só o fragmento, sem recarregar.
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, [router]);

  return (
    <section className="mx-auto grid w-full max-w-xl gap-4 px-3.5 pb-12 pt-8 md:pt-12">
      <h1 className="m-0 font-editorial text-[clamp(34px,5vw,48px)] font-bold leading-[0.95] tracking-[-0.05em]">Sua reserva</h1>
      {erro ? (
        <>
          <div role="alert"><Aviso tipo="atencao" titulo={erro} /></div>
          <p className="m-0 text-sm text-tinta-suave">No WhatsApp da loja, você também pode mandar “Minha reserva” a qualquer momento.</p>
          <Link href="/" className="font-bold underline decoration-rosa decoration-2 underline-offset-2">Voltar para a loja</Link>
        </>
      ) : (
        <p role="status" className="m-0 text-tinta-suave">Abrindo sua reserva…</p>
      )}
    </section>
  );
}
