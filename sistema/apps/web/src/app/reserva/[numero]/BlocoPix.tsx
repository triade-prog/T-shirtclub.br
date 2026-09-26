"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";
import { Aviso, Botao } from "@tshirtclub/ui";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { guardado, guardar, useRepetir, type Pagamento } from "./util";

// PIX da reserva (produtos, F6) e do frete (F8): gerar com Idempotency-Key (um por clique),
// "Copiar código PIX" como ação principal, QR para o computador e consulta a cada 3 s
// (seção 08). Um PIX em andamento (outra aba, recarregou) volta pelo PAYMENT_IN_PROGRESS.

const ESPERA_PAGAMENTO_MS = 3000;

export function BlocoPix({ reservaId, finalidade, titulo, valorCentavos, podeGerar, aoAprovar, aoGerar, aoTravarCartao }: {
  reservaId: string;
  finalidade: "PRODUTOS" | "FRETE";
  titulo: string;
  valorCentavos: number;
  podeGerar: boolean;
  aoAprovar: () => void;
  /** Um PIX foi gerado ou encontrado: a forma da reserva fica fixa. */
  aoGerar?: () => void;
  /** A reserva foi paga com cartão (METHOD_LOCKED): a tela troca para ele. */
  aoTravarCartao?: () => void;
}) {
  const chave = `tc-pix-${reservaId}${finalidade === "FRETE" ? "-frete" : ""}`;
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ler = useCallback(async (pid: string) => {
    const r = await chamarApi<Pagamento>(`v1/reservations/${reservaId}/payments/${pid}`);
    if (!r.ok) return;
    setPagamento(r.dados);
    aoGerar?.();
    if (r.dados.status === "APROVADO") aoAprovar();
  }, [reservaId, aoAprovar, aoGerar]);

  // Se este navegador já gerou um PIX, ele volta (depois do await, como as consultas seguintes).
  useEffect(() => {
    const pid = guardado(chave);
    if (pid) void (async () => { await ler(pid); })();
  }, [chave, ler]);

  const pendente = pagamento?.status === "CRIADO" || pagamento?.status === "PENDENTE";
  useRepetir(() => { if (pagamento) void ler(pagamento.id); }, ESPERA_PAGAMENTO_MS, pendente);

  async function gerar() {
    setGerando(true);
    setErro(null);
    const rota = finalidade === "FRETE" ? "shipping-payments" : "payments";
    const r = await chamarApi<{ pagamento: Pagamento }>(`v1/reservations/${reservaId}/${rota}`, { forma: "PIX" }, "POST", { "idempotency-key": crypto.randomUUID() });
    setGerando(false);
    if (r.ok) {
      setPagamento(r.dados.pagamento);
      aoGerar?.();
      return guardar(chave, r.dados.pagamento.id);
    }
    if (r.codigo === "METHOD_LOCKED") {
      if (aoTravarCartao) return aoTravarCartao();
      setErro("Esta reserva começou pelo cartão; continue por ele.");
    }
    else if (r.codigo === "PAYMENT_IN_PROGRESS" && typeof r.detalhes.pagamentoId === "string") {
      guardar(chave, r.detalhes.pagamentoId);
      return void ler(r.detalhes.pagamentoId);
    }
    setErro(mensagemDeErro(r.codigo, r.detalhes));
  }

  async function copiar() {
    if (!pagamento?.pix) return;
    try {
      await navigator.clipboard.writeText(pagamento.pix.copiaECola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 4000);
    } catch {
      // Sem permissão da área de transferência: seleciona o código para copiar à mão.
      const el = document.getElementById(`codigo-pix-${finalidade}`);
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  }

  const naoConcluido = pagamento && ["RECUSADO", "CANCELADO", "FALHOU"].includes(pagamento.status);
  const idTitulo = `titulo-pix-${finalidade}`;

  return (
    <section aria-labelledby={idTitulo} className="grid gap-4 rounded-[22px] border-2 border-tinta bg-papel p-5 shadow-[6px_6px_0_var(--tc-citrino)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={idTitulo} className="m-0 font-editorial text-2xl font-bold tracking-[-0.035em]">{titulo}</h2>
        <p className="m-0 text-sm">Total <b className="font-display text-2xl font-extrabold">{formatarReais(valorCentavos)}</b></p>
      </div>
      {erro && <div role="alert"><Aviso tipo="erro" titulo={erro} /></div>}

      {pagamento?.pix && !naoConcluido ? (
        <>
          <Botao cheio onClick={copiar} icone={copiado ? <Check aria-hidden="true" className="size-5" /> : <Copy aria-hidden="true" className="size-5" strokeWidth={1.8} />}>
            {copiado ? "Código copiado" : "Copiar código PIX"}
          </Botao>
          <p className="sr-only" role="status">{copiado ? "Código PIX copiado." : ""}</p>
          <ol className="m-0 grid gap-1.5 pl-5 text-[15px]">
            <li>Abra o app do seu banco.</li>
            <li>Escolha <b>Pix › Pix copia e cola</b>.</li>
            <li>Cole o código e confirme. Esta tela atualiza sozinha.</li>
          </ol>
          <details className="rounded-campo border border-linha px-3.5 py-2.5">
            <summary className="cursor-pointer text-sm font-semibold">Está no computador? Mostrar o QR code</summary>
            <div className="grid justify-items-center gap-3 pt-3">
              {pagamento.pix.qrBase64 && (
                // eslint-disable-next-line @next/next/no-img-element -- imagem em data: vinda do Mercado Pago
                <img src={`data:image/png;base64,${pagamento.pix.qrBase64}`} alt="QR code do PIX" width={220} height={220} className="rounded-campo border-2 border-tinta" />
              )}
              <p id={`codigo-pix-${finalidade}`} className="m-0 w-full break-all rounded-campo bg-algodao p-3 font-mono text-xs">{pagamento.pix.copiaECola}</p>
            </div>
          </details>
          <p className="m-0 text-sm text-tinta-suave" role="status">
            {pagamento.status === "APROVADO" ? "Pagamento confirmado." : pagamento.status === "EM_ANALISE" ? "Seu pagamento está em análise com a loja." : "Esperando o pagamento…"}
          </p>
        </>
      ) : (
        <>
          {naoConcluido && <Aviso tipo="atencao" titulo="Este PIX não foi concluído. Gere outro código para pagar." />}
          <Botao cheio carregando={gerando} disabled={!podeGerar} onClick={gerar}>Gerar código PIX</Botao>
          <p className="m-0 text-xs text-tinta-suave">
            {finalidade === "FRETE" ? "O frete é pago pela mesma forma dos produtos." : "A forma escolhida na primeira cobrança fica fixa para esta reserva."}
          </p>
        </>
      )}
    </section>
  );
}
