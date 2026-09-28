"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { condicaoBeneficioVip, textoBeneficioVip, type BeneficioVip } from "@tshirtclub/domain";
import { Selo } from "@tshirtclub/ui";
import { lembrado, lembrar } from "@/lib/navegador";
import { CHAVE_VIP, FormVip } from "./FormVip";

// Pop-up da Lista VIP (referência Le Lis, no estilo V4): aparece uma vez, alguns segundos depois
// de a cliente chegar, só nas páginas de vitrine. Nunca na sacola, na reserva, no pagamento ou
// na consulta. Fechou: volta só depois de 30 dias; entrou na lista: não volta. Espera o aviso de
// cookies de anúncio, quando houver, para não empilhar dois avisos.
const ESPERA_MS = 8000;
const PAUSA_MS = 30 * 24 * 60 * 60 * 1000;
const FORA = /^\/(sacola|reserva|r|consulta|pagamento-aprovado|privacidade|offline)(\/|$)/;
const CHAVE_FECHADO = "tc-vip-fechado";

export function PopupVip({ beneficio }: { beneficio: BeneficioVip | null }) {
  const caminho = usePathname();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [entrou, setEntrou] = useState(false);

  useEffect(() => {
    if (FORA.test(caminho) || lembrado(CHAVE_VIP)) return;
    if (Date.now() - Number(lembrado(CHAVE_FECHADO) ?? 0) < PAUSA_MS) return;
    let id: ReturnType<typeof setTimeout>;
    const tentar = () => {
      const d = dialogo.current;
      if (!d || d.open) return;
      if (document.querySelector('[aria-label="Cookies de anúncio"]')) { id = setTimeout(tentar, 3000); return; }
      d.showModal();
    };
    id = setTimeout(tentar, ESPERA_MS);
    return () => clearTimeout(id);
  }, [caminho]);

  const oferta = beneficio ? `${textoBeneficioVip(beneficio)} ${condicaoBeneficioVip(beneficio)}` : null;

  return (
    <dialog ref={dialogo} aria-labelledby="vip-titulo" onClose={() => { if (!entrou) lembrar(CHAVE_FECHADO, String(Date.now())); }}
      className="m-auto max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-3xl overflow-auto rounded-[24px] border-2 border-tinta bg-papel p-0 text-tinta shadow-[8px_8px_0_var(--tc-citrino)] backdrop:bg-tinta/55">
      <div className="grid md:grid-cols-[0.85fr_1.15fr]">
        <div className="relative grid content-center justify-items-start gap-4 overflow-hidden bg-rosa px-6 py-8 text-no-rosa max-md:py-6 md:px-8">
          <Selo fundo="papel">Lista VIP</Selo>
          <p className="tc-titulo m-0 text-[clamp(44px,6vw,76px)] leading-[0.82] text-tinta">Você faz<br /><em className="text-tinta">o Club.</em></p>
          {oferta && (
            <p className="m-0 -rotate-2 rounded-selo border-2 border-tinta bg-citrino px-3 py-2 font-display text-lg font-extrabold leading-tight text-no-citrino shadow-adesivo-sm">
              {oferta}
            </p>
          )}
        </div>
        <div className="relative grid gap-4 px-6 pb-7 pt-6 md:px-8 md:pt-8">
          <button type="button" onClick={() => dialogo.current?.close()} aria-label="Fechar"
            className="tc-alvo absolute right-3.5 top-3.5 grid size-10 place-items-center rounded-full border-[1.5px] border-tinta bg-papel">
            <X aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
          <div className="grid gap-2 pr-12">
            <h2 id="vip-titulo" className="m-0 font-editorial text-[30px] font-bold leading-[0.95] tracking-[-0.045em]">Entre para a Lista VIP</h2>
            <p className="m-0 text-sm leading-relaxed text-tinta-suave">
              {oferta ? `Ganhe ${oferta} e fique sabendo dos drops novos pelo WhatsApp.` : "Fique sabendo dos drops novos pelo WhatsApp, antes de acabar."}
            </p>
          </div>
          <FormVip origem="POPUP" aoEntrar={() => setEntrou(true)} />
        </div>
      </div>
    </dialog>
  );
}
