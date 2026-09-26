"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Aviso, Botao, Campo } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";
import { useRepetir } from "./util";

// Pelo link da reserva, confirmar ou trocar a entrega pede o código do WhatsApp (D13): a
// cliente manda a mensagem pronta do próprio número e digita o código. Código certo abre a
// sessão do telefone, e a entrega segue.

interface Consulta { id: string; ref: string; telefone: string; whatsapp: { texto: string; url: string } }
interface Situacao {
  situacao: "AGUARDANDO_MENSAGEM" | "CODIGO_ENVIADO" | "CODIGO_VENCIDO" | "BLOQUEADA" | string;
  codigo?: { expiraEm: string; tentativasRestantes: number };
  bloqueadoAte?: string;
}

export function VerificarWhatsApp({ reservaId, aoVerificar }: { reservaId: string; aoVerificar: () => void }) {
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCodigo, setErroCodigo] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState(false);

  useRepetir(async () => {
    if (!consulta) return;
    const r = await chamarApi<Situacao>(`v1/lookup-attempts/${consulta.id}`);
    if (r.ok) setSituacao(r.dados);
  }, 2000, consulta !== null);

  async function comecar() {
    setOcupado(true);
    setErro(null);
    const r = await chamarApi<Consulta>("v1/lookup-attempts", { motivo: "ENTREGA", reservaId });
    setOcupado(false);
    if (r.ok) setConsulta(r.dados);
    else setErro(mensagemDeErro(r.codigo, r.detalhes));
  }

  async function verificar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consulta) return;
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/[\s.-]/g, "");
    if (!/^\d{6}$/.test(codigo)) return setErroCodigo(mensagemDeErro("OTP_INVALID"));
    setOcupado(true);
    setErroCodigo(undefined);
    const r = await chamarApi(`v1/lookup-attempts/${consulta.id}/verify`, { codigo });
    setOcupado(false);
    if (r.ok) return aoVerificar();
    if (r.codigo === "OTP_INVALID" || r.codigo === "OTP_EXPIRED") setErroCodigo(mensagemDeErro(r.codigo, r.detalhes));
    else setErro(mensagemDeErro(r.codigo, r.detalhes));
  }

  return (
    <div className="grid gap-4 rounded-[18px] border-2 border-tinta bg-rosa-bruma p-4">
      <p className="m-0 text-[15px]">
        <b>Confirme que é você.</b> Você abriu a reserva pelo link; para confirmar ou trocar a entrega, peça um código pelo seu WhatsApp.
      </p>
      {erro && <div role="alert"><Aviso tipo="atencao" titulo={erro} /></div>}
      {!consulta ? (
        <Botao cheio carregando={ocupado} onClick={comecar} icone={<MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />}>
          Receber código no WhatsApp
        </Botao>
      ) : situacao?.situacao === "BLOQUEADA" ? (
        <Aviso tipo="erro" titulo={`Muitos códigos pedidos. Você pode pedir de novo às ${situacao.bloqueadoAte ? horario(situacao.bloqueadoAte) : "mais tarde"}.`} />
      ) : (
        <>
          <a href={consulta.whatsapp.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-pilula border-2 border-tinta bg-rosa px-6 text-[15px] font-bold text-no-rosa shadow-adesivo">
            <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />
            {situacao?.situacao === "CODIGO_ENVIADO" || situacao?.situacao === "CODIGO_VENCIDO" ? "Pedir novo código no WhatsApp" : "Abrir o WhatsApp e enviar"}
          </a>
          <p className="m-0 text-sm text-tinta-suave" role="status">
            Envie “{consulta.whatsapp.texto}” do número {consulta.telefone}.{" "}
            {situacao?.situacao === "CODIGO_ENVIADO" && situacao.codigo ? `Código enviado; vale até ${horario(situacao.codigo.expiraEm)}.` : "Aguardando sua mensagem…"}
          </p>
          <form onSubmit={verificar} noValidate className="grid gap-3">
            <Campo name="codigo" rotulo="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={9} placeholder="000000"
              className="font-display text-2xl tracking-[0.3em]" erro={erroCodigo} />
            <Botao type="submit" variante="contorno" carregando={ocupado}>Confirmar código</Botao>
          </form>
        </>
      )}
    </div>
  );
}
