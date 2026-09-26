"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MessageCircle } from "lucide-react";
import { linkWhatsApp, textoPedidoCodigo, type CodigoErro } from "@tshirtclub/domain";
import { Aviso, Botao, Campo, Sobretitulo } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";
import { esvaziarSacola } from "../acoes";
import type { TentativaCriada } from "../FormDados";

type Situacao =
  | "AGUARDANDO_MENSAGEM" | "CODIGO_ENVIADO" | "CODIGO_VENCIDO" | "BLOQUEADA"
  | "VERIFICADA" | "FALHOU_ESTOQUE" | "VERIFICACAO_VENCIDA" | "CONVERTIDA" | "ABANDONADA";

interface Status {
  ref: string;
  situacao: Situacao;
  telefone: string;
  codigo?: { expiraEm: string; tentativasRestantes: number; codigosRestantes: number };
  bloqueadoAte?: string;
  reservaId?: string;
}

const semAviso = () => () => {};
function lerGuardada(id: string): string | null {
  try { return sessionStorage.getItem(`tc-tentativa-${id}`); } catch { return null; }
}

// Enquanto espera a mensagem, confere a cada 2 s (F3.8); com a aba escondida, para.
const INTERVALO_MS = 2000;

export function PassoCodigo({ tentativaId, numeroLoja }: { tentativaId: string; numeroLoja: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [naoAchou, setNaoAchou] = useState(false);
  const [erro, setErro] = useState<{ texto: string; sacola?: boolean } | null>(null);
  const [erroCodigo, setErroCodigo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  // O link pronto que a api-public devolveu no passo 1 (no servidor, ainda não existe).
  const guardada = useSyncExternalStore(semAviso, () => lerGuardada(tentativaId), () => null);
  const criada = useMemo(() => {
    try { return guardada ? (JSON.parse(guardada) as TentativaCriada) : null; } catch { return null; }
  }, [guardada]);

  const atualizar = useCallback(async () => {
    const r = await chamarApi<Status>(`v1/reservation-attempts/${tentativaId}`);
    if (r.ok) setStatus(r.dados);
    else if (r.codigo === "NOT_FOUND") setNaoAchou(true);
  }, [tentativaId]);

  useEffect(() => {
    let ativo = true;
    const passo = () => { if (ativo && document.visibilityState === "visible") void atualizar(); };
    passo();
    const id = setInterval(passo, INTERVALO_MS);
    document.addEventListener("visibilitychange", passo);
    return () => { ativo = false; clearInterval(id); document.removeEventListener("visibilitychange", passo); };
  }, [atualizar]);

  const ref = status?.ref ?? criada?.ref;
  const texto = criada?.whatsapp.texto ?? (ref ? textoPedidoCodigo(ref) : "");
  const urlWhats = criada?.whatsapp.url ?? (ref ? linkWhatsApp(numeroLoja, texto) : "#");

  async function confirmar(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const codigo = e ? String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/[\s.-]/g, "") : undefined;
    if (e && !/^\d{6}$/.test(codigo ?? "")) { setErroCodigo(mensagemDeErro("OTP_INVALID")); return; }
    setEnviando(true);
    setErro(null);
    setErroCodigo(undefined);
    const r = await chamarApi<{ reserva: { id: string; numero: number } }>(`v1/reservation-attempts/${tentativaId}/confirm`, codigo ? { codigo } : {});
    if (r.ok) {
      await esvaziarSacola();
      try {
        sessionStorage.removeItem(`tc-tentativa-${tentativaId}`);
        // A página da reserva é por número; a API, por id (sem isto, ela procura nas reservas do telefone).
        sessionStorage.setItem(`tc-reserva-${r.dados.reserva.numero}`, r.dados.reserva.id);
      } catch { /* sem armazenamento: a página procura pelo número */ }
      router.replace(`/reserva/${r.dados.reserva.numero}`);
      return;
    }
    setEnviando(false);
    tratarErro(r.codigo, r.detalhes);
    void atualizar();
  }

  function tratarErro(codigo: CodigoErro, detalhes: Record<string, unknown>) {
    const texto = mensagemDeErro(codigo, detalhes);
    if (codigo === "OTP_INVALID" || codigo === "OTP_EXPIRED") return setErroCodigo(texto);
    setErro({ texto, sacola: ["STOCK_UNAVAILABLE", "INSUFFICIENT_STOCK", "PRICE_CHANGED", "MAX_ITEMS", "MAX_PER_MODEL"].includes(codigo) });
  }

  if (naoAchou || status?.situacao === "ABANDONADA" || status?.situacao === "VERIFICACAO_VENCIDA") {
    return (
      <Moldura>
        <Aviso tipo="atencao" titulo="Esta confirmação não vale mais.">
          <p className="m-0 mt-1 text-sm">Ela só abre no navegador em que você começou, e por um tempo curto. Comece de novo: suas peças continuam na sacola.</p>
        </Aviso>
        <Link href="/reserva" className="font-bold underline decoration-rosa decoration-2 underline-offset-2">Começar de novo</Link>
      </Moldura>
    );
  }

  const situacao = status?.situacao;
  const verificada = situacao === "VERIFICADA" || situacao === "FALHOU_ESTOQUE" || situacao === "CONVERTIDA";

  return (
    <Moldura>
      {erro && (
        <div role="alert" className="grid gap-2">
          <Aviso tipo="atencao" titulo={erro.texto} />
          {erro.sacola && <Link href="/sacola" className="text-sm font-bold underline decoration-rosa decoration-2 underline-offset-2">Ajustar a sacola</Link>}
        </div>
      )}

      {situacao === "BLOQUEADA" ? (
        <Aviso tipo="erro" titulo={`Muitos códigos pedidos. Você pode pedir de novo às ${status?.bloqueadoAte ? horario(status.bloqueadoAte) : "mais tarde"}.`} />
      ) : verificada ? (
        <div className="grid gap-4">
          <Aviso tipo="ok" titulo="WhatsApp confirmado." />
          <Botao cheio carregando={enviando} onClick={() => confirmar()}>Confirmar e reservar</Botao>
        </div>
      ) : (
        <>
          {/* Passo A: a cliente manda a mensagem pronta do próprio WhatsApp */}
          <div className="grid gap-3">
            <p className="m-0 text-[15px]">
              Toque no botão: o seu WhatsApp abre com a mensagem pronta para a loja. É só enviar{status?.telefone ? <> do número <b>{status.telefone}</b></> : null}.
            </p>
            <div role="group" aria-label="Mensagem que você vai enviar" className="grid gap-2 rounded-[18px] border-2 border-tinta bg-[#e7f7dc] p-3.5">
              <span className="justify-self-end rounded-[14px] rounded-br-[4px] bg-[#d2f5bd] px-3 py-2 text-sm shadow-[0_1px_0_rgb(0_0_0/0.08)]">{texto || "…"}</span>
              <span className="justify-self-start rounded-[14px] rounded-bl-[4px] bg-branco px-3 py-2 text-sm text-tinta-suave shadow-[0_1px_0_rgb(0_0_0/0.08)]">
                Seu código da T-shirt Club.br é <b>••••••</b>. Vale por 5 minutos.
              </span>
            </div>
            <a
              href={urlWhats}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!ref}
              className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-pilula border-2 border-tinta bg-rosa px-6 text-[15px] font-bold text-no-rosa shadow-adesivo"
            >
              <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />
              {situacao === "CODIGO_ENVIADO" || situacao === "CODIGO_VENCIDO" ? "Pedir novo código no WhatsApp" : "Receber código no WhatsApp"}
            </a>
            <p className="m-0 text-sm text-tinta-suave" role="status">
              {situacao === "CODIGO_ENVIADO"
                ? `Código enviado. ${status?.codigo ? `Vale até ${horario(status.codigo.expiraEm)}.` : ""}`
                : situacao === "CODIGO_VENCIDO" ? "O código venceu. Peça um novo pelo mesmo botão."
                : "Aguardando sua mensagem no WhatsApp…"}
            </p>
          </div>

          {/* Passo B: o código que chegou */}
          <form onSubmit={confirmar} noValidate className="grid gap-4">
            <Campo
              name="codigo"
              rotulo="Código de 6 dígitos"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={9}
              placeholder="000000"
              className="font-display text-2xl tracking-[0.3em]"
              ajuda={status?.codigo
                ? `Vale até ${horario(status.codigo.expiraEm)} · ${status.codigo.tentativasRestantes} ${status.codigo.tentativasRestantes === 1 ? "tentativa" : "tentativas"} · ${status.codigo.codigosRestantes} ${status.codigo.codigosRestantes === 1 ? "novo código" : "novos códigos"}`
                : "Pode colar o código copiado no WhatsApp."}
              erro={erroCodigo}
            />
            <Aviso tipo="marca" titulo="Nada fica guardado ainda.">
              <p className="m-0 mt-1 text-sm">Depois do código, conferimos o estoque e começa o prazo de 15 minutos para pagar.</p>
            </Aviso>
            <Botao type="submit" cheio carregando={enviando}>Confirmar e reservar</Botao>
          </form>
          <p className="m-0 text-xs text-tinta-suave">
            Envie do mesmo número informado. Mensagens de outro número não geram código. Depois de 2 novos códigos, o número fica 30 minutos sem poder pedir outro.
          </p>
        </>
      )}
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto grid w-full max-w-xl gap-5 px-3.5 pb-12 pt-8 md:pt-12">
      <div>
        <Sobretitulo>Passo 2 de 3</Sobretitulo>
        <h1 className="m-0 mt-2 font-editorial text-[clamp(36px,5vw,56px)] font-bold leading-[0.95] tracking-[-0.05em]">
          Confirme seu <em className="text-rosa-press">WhatsApp.</em>
        </h1>
      </div>
      {children}
    </section>
  );
}
