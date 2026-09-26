"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { formatarReais, textoCupom, textoErro, type CodigoErro, type ItemCarrinho, type ResultadoPreco } from "@tshirtclub/domain";
import { Aviso, Botao, Campo, cx } from "@tshirtclub/ui";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { Turnstile, CHAVE_TURNSTILE } from "./Turnstile";

// Passo 1 da reserva (tela 5 do design, proposta 3 no tema claro): nome, WhatsApp, entrega
// pretendida e cupom. Nada fica reservado aqui; a api-public confere preço, limites e bloqueios
// e cria a tentativa com a referência curta que a cliente manda pelo WhatsApp.

const ENTREGAS = [
  { valor: "RETIRADA", rotulo: "Retirar na loja" },
  { valor: "MOTOBOY", rotulo: "Entrega local (motoboy)" },
  { valor: "ENVIO", rotulo: "Envio para outra cidade" },
] as const;

export interface TentativaCriada { id: string; ref: string; telefone: string; whatsapp: { texto: string; url: string } }

export function FormDados({ pedido, pecas, cotacaoInicial }: { pedido: ItemCarrinho[]; pecas: number; cotacaoInicial: ResultadoPreco }) {
  const router = useRouter();
  const [cotacao, setCotacao] = useState(cotacaoInicial);
  const [cupom, setCupom] = useState("");
  const [cupomAplicado, setCupomAplicado] = useState<string | undefined>();
  const [msgCupom, setMsgCupom] = useState<{ texto: string; ok: boolean } | null>(null);
  const [erros, setErros] = useState<{ nome?: string; telefone?: string; entrega?: string; geral?: string; sacola?: boolean }>({});
  const [enviando, setEnviando] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [versaoDesafio, setVersaoDesafio] = useState(0);

  async function aplicarCupom() {
    const codigo = cupom.trim().toUpperCase();
    if (!codigo) { setCupomAplicado(undefined); setCotacao(cotacaoInicial); setMsgCupom(null); return; }
    if (!/^[A-Z0-9]{4,20}$/.test(codigo)) { setMsgCupom({ texto: textoCupom("NAO_ENCONTRADO"), ok: false }); return; }
    const r = await chamarApi<ResultadoPreco>("v1/cart/quote", { itens: pedido, cupom: codigo });
    if (!r.ok) { setMsgCupom({ texto: mensagemDeErro(r.codigo, r.detalhes), ok: false }); return; }
    const situacao = r.dados.cupom;
    if (situacao?.situacao === "INVALIDO") {
      setMsgCupom({ texto: textoCupom(situacao.motivo, { gastoMinimoCentavos: situacao.gastoMinimoCentavos }), ok: false });
      setCupomAplicado(undefined);
      setCotacao(cotacaoInicial);
      return;
    }
    setCotacao(r.dados);
    setCupomAplicado(codigo);
    setMsgCupom(situacao?.situacao === "NAO_E_O_MELHOR"
      ? { texto: textoErro("COUPON_NOT_BEST").mensagem, ok: true }
      : { texto: `Cupom ${codigo} aplicado.`, ok: true });
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get("nome") ?? "").trim();
    const telefone = String(f.get("telefone") ?? "").trim();
    const entrega = f.get("entrega");
    const novos: typeof erros = {};
    if (nome.length < 2) novos.nome = "Escreva seu nome.";
    if (telefone.replace(/\D/g, "").length < 10) novos.telefone = textoErro("PHONE_INVALID").mensagem;
    if (!entrega) novos.entrega = "Escolha como prefere receber.";
    setErros(novos);
    if (Object.keys(novos).length > 0) return;
    if (CHAVE_TURNSTILE && !token) { setErros({ geral: textoErro("TURNSTILE_REQUIRED").mensagem }); return; }

    setEnviando(true);
    const r = await chamarApi<TentativaCriada>("v1/reservation-attempts", {
      nome, telefone, entrega, itens: pedido,
      totalEsperadoCentavos: cotacao.totalCentavos,
      ...(cupomAplicado ? { cupom: cupomAplicado } : {}),
      turnstileToken: token ?? "sem-turnstile",
    });
    if (r.ok) {
      try { sessionStorage.setItem(`tc-tentativa-${r.dados.id}`, JSON.stringify(r.dados)); } catch { /* sem armazenamento: a tela do código refaz o link */ }
      router.push(`/reserva/codigo?t=${r.dados.id}`);
      return;
    }
    setEnviando(false);
    // O desafio vale uma vez só: depois de um erro, pede outro.
    setToken(null);
    setVersaoDesafio((v) => v + 1);
    tratarErro(r.codigo, r.detalhes);
  }

  function tratarErro(codigo: CodigoErro, detalhes: Record<string, unknown>) {
    const texto = mensagemDeErro(codigo, detalhes);
    if (codigo === "PHONE_INVALID" || codigo === "NO_WHATSAPP" || codigo === "PHONE_BLOCKED") return setErros({ telefone: texto });
    if (codigo === "VALIDATION_ERROR") return setErros({ geral: "Confira seu nome e o WhatsApp e tente de novo." });
    if (codigo === "COUPON_INVALID") {
      setCupomAplicado(undefined);
      setCotacao(cotacaoInicial);
      setMsgCupom({ texto, ok: false });
      return setErros({ geral: "O cupom não vale para esta reserva. Tire o cupom ou continue sem ele." });
    }
    if (codigo === "PRICE_CHANGED" && typeof detalhes.totalCentavos === "number") {
      setCotacao({ ...cotacao, totalCentavos: detalhes.totalCentavos });
      return setErros({ geral: texto });
    }
    const daSacola = ["INSUFFICIENT_STOCK", "STOCK_UNAVAILABLE", "MAX_ITEMS", "MAX_PER_MODEL"].includes(codigo);
    setErros({ geral: texto, sacola: daSacola });
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      {erros.geral && (
        <div role="alert" className="grid gap-2">
          <Aviso tipo="atencao" titulo={erros.geral} />
          {erros.sacola && <Link href="/sacola" className="text-sm font-bold underline decoration-rosa decoration-2 underline-offset-2">Voltar para a sacola</Link>}
        </div>
      )}

      <Campo name="nome" rotulo="Nome" autoComplete="name" maxLength={60} required erro={erros.nome} />
      <Campo name="telefone" rotulo="WhatsApp" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" maxLength={20} required ajuda="O código chega neste número." erro={erros.telefone} />

      <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={erros.entrega ? "entrega-erro" : "entrega-ajuda"}>
        <legend className="mb-1.5 p-0 text-[15px] font-semibold">Como prefere receber</legend>
        {ENTREGAS.map((op) => (
          <label key={op.valor} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-campo border-2 border-tinta bg-branco px-4 shadow-adesivo-sm has-checked:bg-rosa-bruma">
            <input type="radio" name="entrega" value={op.valor} className="size-5 accent-rosa" />
            <span className="text-[15px]">{op.rotulo}</span>
          </label>
        ))}
        {erros.entrega
          ? <p id="entrega-erro" className="m-0 text-sm font-semibold text-erro">{erros.entrega}</p>
          : <p id="entrega-ajuda" className="m-0 text-sm text-tinta-suave">Você confirma de novo depois do pagamento. O frete, quando houver, é calculado depois.</p>}
      </fieldset>

      <div className="grid gap-1.5">
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Campo name="cupom" rotulo="Cupom (opcional)" autoComplete="off" maxLength={20} value={cupom} onChange={(e) => setCupom(e.target.value)} className="uppercase" />
          <Botao variante="contorno" onClick={aplicarCupom}>Aplicar</Botao>
        </div>
        {msgCupom && <p role="status" className={cx("m-0 text-sm", msgCupom.ok ? "text-verde-escuro" : "font-semibold text-erro")}>{msgCupom.texto}</p>}
      </div>

      <p className="m-0 text-[13px] text-tinta-suave">
        Usamos seu nome e WhatsApp só para esta reserva e para os avisos sobre ela. Veja a{" "}
        <Link href="/privacidade" className="font-semibold underline decoration-rosa decoration-2 underline-offset-2">política de privacidade</Link>.
      </p>

      <Turnstile aoResolver={setToken} versao={versaoDesafio} />

      <div className="sticky bottom-0 -mx-3.5 grid gap-3 border-t-2 border-tinta bg-papel/95 px-3.5 pb-4 pt-3 backdrop-blur-md md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <p className="m-0 flex items-baseline justify-between gap-3 text-sm">
          <span>{pecas} {pecas === 1 ? "peça" : "peças"}{cotacao.aplicada ? ` · ${cotacao.aplicada.rotulo}` : ""}</span>
          <b className="font-display text-xl font-extrabold">{formatarReais(cotacao.totalCentavos)}</b>
        </p>
        <Botao type="submit" cheio carregando={enviando} icone={<MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} />}>
          Receber código no WhatsApp
        </Botao>
      </div>
    </form>
  );
}
