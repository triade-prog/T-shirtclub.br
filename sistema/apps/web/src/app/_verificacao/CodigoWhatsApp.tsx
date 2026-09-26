"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Aviso, Botao, Campo } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";
import { useRepetir } from "@/lib/navegador";

// Verificação invertida (D13, G13) de uma consulta já criada (POST /v1/lookup-attempts):
// a cliente manda a mensagem pronta do próprio WhatsApp, a tela acompanha a cada 2 s e o
// código certo abre a sessão do telefone. Usado pela consulta e pela entrega pelo link.

export interface ConsultaCriada { id: string; ref: string; telefone: string; whatsapp: { texto: string; url: string } }
interface Situacao {
  situacao: "AGUARDANDO_MENSAGEM" | "CODIGO_ENVIADO" | "CODIGO_VENCIDO" | "BLOQUEADA" | string;
  codigo?: { expiraEm: string; tentativasRestantes: number };
  bloqueadoAte?: string;
}

export function CodigoWhatsApp({ consulta, rotuloConfirmar = "Confirmar código", aoVerificar }: {
  consulta: ConsultaCriada;
  rotuloConfirmar?: string;
  aoVerificar: () => void;
}) {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCodigo, setErroCodigo] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState(false);

  useRepetir(async () => {
    const r = await chamarApi<Situacao>(`v1/lookup-attempts/${consulta.id}`);
    if (r.ok) setSituacao(r.dados);
  }, 2000, true);

  async function verificar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/[\s.-]/g, "");
    if (!/^\d{6}$/.test(codigo)) return setErroCodigo(mensagemDeErro("OTP_INVALID"));
    setOcupado(true);
    setErro(null);
    setErroCodigo(undefined);
    const r = await chamarApi(`v1/lookup-attempts/${consulta.id}/verify`, { codigo });
    setOcupado(false);
    if (r.ok) return aoVerificar();
    if (r.codigo === "OTP_INVALID" || r.codigo === "OTP_EXPIRED") setErroCodigo(mensagemDeErro(r.codigo, r.detalhes));
    else setErro(mensagemDeErro(r.codigo, r.detalhes));
  }

  if (situacao?.situacao === "BLOQUEADA") {
    return <Aviso tipo="erro" titulo={`Muitos códigos pedidos. Você pode pedir de novo às ${situacao.bloqueadoAte ? horario(situacao.bloqueadoAte) : "mais tarde"}.`} />;
  }
  const jaEnviado = situacao?.situacao === "CODIGO_ENVIADO" || situacao?.situacao === "CODIGO_VENCIDO";
  return (
    <div className="grid gap-4">
      {erro && <div role="alert"><Aviso tipo="atencao" titulo={erro} /></div>}
      <a href={consulta.whatsapp.url} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-pilula border-2 border-tinta bg-rosa px-6 text-[15px] font-bold text-no-rosa shadow-adesivo">
        <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />
        {jaEnviado ? "Pedir novo código no WhatsApp" : "Abrir o WhatsApp e enviar"}
      </a>
      <p className="m-0 text-sm text-tinta-suave" role="status">
        Envie “{consulta.whatsapp.texto}” do número {consulta.telefone}.{" "}
        {situacao?.situacao === "CODIGO_ENVIADO" && situacao.codigo
          ? `Código enviado; vale até ${horario(situacao.codigo.expiraEm)}.`
          : situacao?.situacao === "CODIGO_VENCIDO" ? "O código venceu; peça um novo." : "Aguardando sua mensagem…"}
      </p>
      <form onSubmit={verificar} noValidate className="grid gap-3">
        <Campo name="codigo" rotulo="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={9} placeholder="000000"
          className="font-display text-2xl tracking-[0.3em]" ajuda="Pode colar o código copiado no WhatsApp." erro={erroCodigo} />
        <Botao type="submit" cheio carregando={ocupado}>{rotuloConfirmar}</Botao>
      </form>
    </div>
  );
}
