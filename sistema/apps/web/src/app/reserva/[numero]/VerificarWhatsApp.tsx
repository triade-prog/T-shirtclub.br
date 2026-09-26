"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Aviso, Botao } from "@tshirtclub/ui";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { CodigoWhatsApp, type ConsultaCriada } from "../../_verificacao/CodigoWhatsApp";

// Pelo link da reserva, confirmar ou trocar a entrega pede o código do WhatsApp (D13):
// cria a consulta ENTREGA (telefone da sessão do link) e segue com o código.

export function VerificarWhatsApp({ reservaId, aoVerificar }: { reservaId: string; aoVerificar: () => void }) {
  const [consulta, setConsulta] = useState<ConsultaCriada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function comecar() {
    setOcupado(true);
    setErro(null);
    const r = await chamarApi<ConsultaCriada>("v1/lookup-attempts", { motivo: "ENTREGA", reservaId });
    setOcupado(false);
    if (r.ok) setConsulta(r.dados);
    else setErro(mensagemDeErro(r.codigo, r.detalhes));
  }

  return (
    <div className="grid gap-4 rounded-[18px] border-2 border-tinta bg-rosa-bruma p-4">
      <p className="m-0 text-[15px]">
        <b>Confirme que é você.</b> Você abriu a reserva pelo link; para confirmar ou trocar a entrega, peça um código pelo seu WhatsApp.
      </p>
      {erro && <div role="alert"><Aviso tipo="atencao" titulo={erro} /></div>}
      {consulta ? (
        <CodigoWhatsApp consulta={consulta} aoVerificar={aoVerificar} />
      ) : (
        <Botao cheio carregando={ocupado} onClick={comecar} icone={<MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />}>
          Receber código no WhatsApp
        </Botao>
      )}
    </div>
  );
}
