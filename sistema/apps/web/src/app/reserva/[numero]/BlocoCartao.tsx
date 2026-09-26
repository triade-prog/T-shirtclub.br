"use client";

import { useEffect, useRef, useState } from "react";
import { formatarReais, textoRecusaCartao } from "@tshirtclub/domain";
import { Aviso, Botao } from "@tshirtclub/ui";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { guardar, useRepetir, type Pagamento } from "./util";

// Cartão pelo Card Payment Brick do Mercado Pago (F6.4, G16, G17): o SDK só carrega quando
// a cliente escolhe cartão; o número do cartão fica no Mercado Pago e a loja recebe só o
// token. Crédito à vista, binary_mode (aprova ou recusa na hora). Recusado, o formulário
// volta limpo para tentar outro cartão.

const SDK = "https://sdk.mercadopago.com/js/v2";
export const CHAVE_MP = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? "";

interface DadosBrick {
  token: string;
  payment_method_id: string;
  issuer_id?: string | number | null;
  payer?: { email?: string };
}
interface Controle { unmount(): void }
declare global {
  interface Window {
    MercadoPago?: new (chave: string, op: { locale: string }) => {
      bricks(): { create(tipo: "cardPayment", id: string, op: Record<string, unknown>): Promise<Controle> };
    };
  }
}

function carregarSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((ok, falha) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${SDK}"]`);
    const s = existente ?? Object.assign(document.createElement("script"), { src: SDK, async: true });
    s.addEventListener("load", () => ok());
    s.addEventListener("error", () => falha(new Error("sdk")));
    if (!existente) document.head.appendChild(s);
  });
}

export function BlocoCartao({ reservaId, finalidade = "PRODUTOS", titulo = "Pagar com cartão", valorCentavos, podePagar, aoAprovar, aoTravarPix }: {
  reservaId: string;
  /** Produtos (F6) ou frete (F8, sempre pela mesma forma dos produtos). */
  finalidade?: "PRODUTOS" | "FRETE";
  titulo?: string;
  valorCentavos: number;
  podePagar: boolean;
  aoAprovar: () => void;
  /** A reserva começou pelo PIX (METHOD_LOCKED): a tela volta para ele. */
  aoTravarPix: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [versao, setVersao] = useState(0);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const ultimos = useRef({ aoAprovar, aoTravarPix });
  useEffect(() => { ultimos.current = { aoAprovar, aoTravarPix }; });

  useEffect(() => {
    if (!CHAVE_MP || !podePagar || !caixa.current) return;
    const id = `cartao-${reservaId}-${finalidade.toLowerCase()}`;
    caixa.current.id = id;
    let controle: Controle | null = null;
    let ativo = true;

    async function enviar(dados: DadosBrick): Promise<void> {
      setErro(null);
      setRecusa(null);
      const rota = finalidade === "FRETE" ? "shipping-payments" : "payments";
      const r = await chamarApi<{ pagamento: Pagamento; recusa?: string }>(`v1/reservations/${reservaId}/${rota}`, {
        forma: "CARTAO",
        cartao: { token: dados.token, paymentMethodId: dados.payment_method_id, issuerId: dados.issuer_id ?? null, email: dados.payer?.email ?? "" },
      }, "POST", { "idempotency-key": crypto.randomUUID() });
      if (!r.ok) {
        if (r.codigo === "METHOD_LOCKED") return ultimos.current.aoTravarPix();
        setErro(mensagemDeErro(r.codigo, r.detalhes));
        return setVersao((v) => v + 1);
      }
      guardar(`tc-forma-${reservaId}`, "CARTAO");
      setPagamento(r.dados.pagamento);
      if (r.dados.pagamento.status === "APROVADO") return ultimos.current.aoAprovar();
      if (r.dados.pagamento.status === "RECUSADO") {
        setRecusa(textoRecusaCartao(r.dados.recusa));
        setVersao((v) => v + 1); // formulário limpo para outro cartão (o token vale uma vez)
      }
    }

    void (async () => {
      try {
        await carregarSdk();
        if (!ativo || !window.MercadoPago) return;
        const mp = new window.MercadoPago(CHAVE_MP, { locale: "pt-BR" });
        controle = await mp.bricks().create("cardPayment", id, {
          initialization: { amount: valorCentavos / 100 },
          customization: {
            paymentMethods: { minInstallments: 1, maxInstallments: 1, types: { excluded: ["debit_card", "prepaid_card"] } },
            visual: { hideFormTitle: true, style: { theme: "default", customVariables: { baseColor: "#e8478a", borderRadiusMedium: "14px" } } },
          },
          callbacks: {
            onReady: () => { if (ativo) setPronto(true); },
            onSubmit: (dados: DadosBrick) => enviar(dados),
            onError: () => { if (ativo) setErro("Não conseguimos carregar o pagamento com cartão. Tente de novo ou pague com PIX."); },
          },
        });
        if (!ativo) controle.unmount();
      } catch {
        if (ativo) setErro("Não conseguimos carregar o pagamento com cartão. Tente de novo ou pague com PIX.");
      }
    })();
    return () => { ativo = false; setPronto(false); controle?.unmount(); };
  }, [reservaId, finalidade, valorCentavos, podePagar, versao]);

  // Cartão em análise no Mercado Pago (raro com binary_mode): confere como o PIX.
  const pendente = pagamento?.status === "PENDENTE" || pagamento?.status === "CRIADO";
  useRepetir(async () => {
    if (!pagamento) return;
    const r = await chamarApi<Pagamento>(`v1/reservations/${reservaId}/payments/${pagamento.id}`);
    if (!r.ok) return;
    setPagamento(r.dados);
    if (r.dados.status === "APROVADO") ultimos.current.aoAprovar();
  }, 3000, pendente);

  return (
    <section aria-labelledby={`titulo-cartao-${finalidade}`} className="grid gap-4 rounded-[22px] border-2 border-tinta bg-papel p-5 shadow-[6px_6px_0_var(--tc-citrino)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`titulo-cartao-${finalidade}`} className="m-0 font-editorial text-2xl font-bold tracking-[-0.035em]">{titulo}</h2>
        <p className="m-0 text-sm">Total <b className="font-display text-2xl font-extrabold">{formatarReais(valorCentavos)}</b></p>
      </div>
      {recusa && <div role="alert"><Aviso tipo="atencao" titulo={recusa} /></div>}
      {erro && <div role="alert"><Aviso tipo="erro" titulo={erro} /></div>}
      {!CHAVE_MP ? (
        <Aviso tipo="info" titulo="O pagamento com cartão não está disponível agora. Use o PIX." />
      ) : !podePagar ? (
        <p className="m-0 text-sm text-tinta-suave">O prazo para começar um pagamento acabou.</p>
      ) : pendente ? (
        <p role="status" className="m-0 text-[15px]">Pagamento em análise no Mercado Pago. Esta tela atualiza sozinha.</p>
      ) : (
        <>
          {!pronto && <p role="status" className="m-0 text-sm text-tinta-suave">Carregando o formulário do cartão…</p>}
          <div ref={caixa} key={versao} />
          {erro && <Botao variante="contorno" onClick={() => setVersao((v) => v + 1)}>Tentar de novo</Botao>}
        </>
      )}
      <p className="m-0 text-xs text-tinta-suave">
        Crédito à vista. Os dados do cartão vão direto para o Mercado Pago; a loja não vê nem guarda o número.
      </p>
    </section>
  );
}
