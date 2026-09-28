"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Check, Copy } from "lucide-react";
import { TEXTO_CONSENTIMENTO_VIP, condicaoBeneficioVip, textoBeneficioVip, textoErro, type BeneficioVip } from "@tshirtclub/domain";
import { Botao, Campo, cx } from "@tshirtclub/ui";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { lembrar } from "@/lib/navegador";

/** Marca, neste aparelho, que a cliente já entrou na lista (o pop-up não aparece mais). */
export const CHAVE_VIP = "tc-vip";

type Cupom = BeneficioVip & { codigo: string };

// Entrada na Lista VIP (0390), no pop-up e no rodapé: WhatsApp, nome opcional e os dois aceites
// separados e desmarcados (marketing e política de privacidade). Quem entra vê o cupom de
// boas-vindas, se houver um valendo.
export function FormVip({ origem, compacto = false, aoEntrar }: { origem: "POPUP" | "RODAPE"; compacto?: boolean; aoEntrar?: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<{ telefone?: string; aceites?: string; geral?: string }>({});
  const [pronto, setPronto] = useState<{ cupom: Cupom | null } | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const telefone = String(f.get("telefone") ?? "").trim();
    const novos: typeof erros = {};
    if (telefone.replace(/\D/g, "").length < 10) novos.telefone = textoErro("PHONE_INVALID").mensagem;
    if (!f.get("consentimento") || !f.get("privacidade")) novos.aceites = "Marque as duas opções para entrar na lista.";
    setErros(novos);
    if (Object.keys(novos).length > 0) return;
    setEnviando(true);
    const r = await chamarApi<{ novo: boolean; cupom: Cupom | null }>("v1/vip", {
      telefone, nome: String(f.get("nome") ?? "").trim() || undefined, origem, consentimento: true, privacidade: true,
    });
    setEnviando(false);
    if (!r.ok) {
      if (r.codigo === "PHONE_INVALID") return setErros({ telefone: mensagemDeErro(r.codigo) });
      if (r.codigo === "RATE_LIMITED") return setErros({ geral: "Muitas tentativas agora. Tente de novo daqui a pouco." });
      return setErros({ geral: mensagemDeErro(r.codigo, r.detalhes) });
    }
    lembrar(CHAVE_VIP, "1");
    setPronto({ cupom: r.dados.cupom });
    aoEntrar?.();
  }

  async function copiar(codigo: string) {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); } catch { /* sem permissão: o código continua na tela */ }
  }

  if (pronto) {
    const c = pronto.cupom;
    return (
      <div role="status" className="grid gap-3">
        <p className="m-0 font-editorial text-[26px] font-bold leading-tight tracking-[-0.035em]">Você está na Lista VIP.</p>
        {c ? (
          <>
            <p className="m-0 text-sm">Seu cupom de boas-vindas: <b>{textoBeneficioVip(c)} {condicaoBeneficioVip(c)}</b>. Use o código na reserva.</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <code className="rounded-campo border-2 border-dashed border-tinta bg-citrino px-4 py-2.5 font-display text-2xl font-extrabold tracking-[0.08em] text-no-citrino">{c.codigo}</code>
              <Botao variante="contorno" onClick={() => void copiar(c.codigo)} icone={copiado ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}>
                {copiado ? "Copiado" : "Copiar código"}
              </Botao>
            </div>
          </>
        ) : (
          <p className="m-0 text-sm">Quando chegar drop novo, você fica sabendo pelo WhatsApp.</p>
        )}
      </div>
    );
  }

  const idAceites = `vip-aceites-${origem.toLowerCase()}`;
  return (
    <form onSubmit={enviar} noValidate className="grid gap-3.5">
      <div className={cx("grid gap-3", compacto && "md:grid-cols-2")}>
        <Campo name="telefone" rotulo="WhatsApp" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" maxLength={20} required erro={erros.telefone} />
        <Campo name="nome" rotulo="Nome (opcional)" autoComplete="given-name" maxLength={60} />
      </div>
      <fieldset className="m-0 grid gap-1 border-0 p-0" aria-describedby={erros.aceites ? idAceites : undefined}>
        <legend className="sr-only">Aceites</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm leading-snug">
          <input type="checkbox" name="consentimento" className="mt-0.5 size-5 shrink-0 accent-rosa" />
          <span>{TEXTO_CONSENTIMENTO_VIP}</span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm leading-snug">
          <input type="checkbox" name="privacidade" className="mt-0.5 size-5 shrink-0 accent-rosa" />
          <span>Li e concordo com a <Link href="/privacidade" className="tc-alvo relative font-semibold underline decoration-rosa decoration-2 underline-offset-2">Política de privacidade</Link>.</span>
        </label>
        {erros.aceites && <p id={idAceites} className="m-0 text-sm font-semibold text-erro">{erros.aceites}</p>}
      </fieldset>
      {erros.geral && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erros.geral}</p>}
      <Botao type="submit" carregando={enviando} className={compacto ? "md:justify-self-start" : undefined}>Quero ser VIP</Botao>
      <p className="m-0 text-xs text-tinta-suave">Você sai da lista quando quiser, pelo WhatsApp da loja.</p>
    </form>
  );
}
