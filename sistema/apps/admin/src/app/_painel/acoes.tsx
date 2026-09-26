"use client";

import { useState } from "react";
import { Aviso, Botao, Campo } from "@tshirtclub/ui";
import { chamarApi, mensagemDeErro, type RespostaApi } from "@/lib/api";

// Ações da operação (F7, F8), usadas no detalhe da reserva e nas filas: toda decisão pede
// motivo (vai para a auditoria), e o erro aparece junto do formulário.

function useEnvio(aoConcluir: () => void) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(chamada: Promise<RespostaApi<unknown>>) {
    setOcupado(true);
    setErro(null);
    const r = await chamada;
    setOcupado(false);
    if (r.ok) aoConcluir();
    else setErro(mensagemDeErro(r.codigo, r.detalhes));
  }
  return { ocupado, erro, setErro, enviar };
}

/** Aprovar ou recusar um pedido de cancelamento (regra 12), sempre com motivo. */
export function DecisaoCancelamento({ pedidoId, aoDecidir }: { pedidoId: string; aoDecidir: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio(aoDecidir);
  const [acao, setAcao] = useState<"approve" | "reject" | null>(null);

  function decidir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
    if (motivo.length < 3) return setErro("Escreva o motivo (a cliente não vê; fica na auditoria).");
    void enviar(chamarApi(`v1/admin/cancellation-requests/${pedidoId}/${acao}`, { motivo }));
  }

  if (!acao) {
    return (
      <div className="flex flex-wrap gap-2">
        <Botao variante="escuro" onClick={() => setAcao("approve")}>Aprovar cancelamento</Botao>
        <Botao variante="contorno" onClick={() => setAcao("reject")}>Recusar</Botao>
      </div>
    );
  }
  return (
    <form onSubmit={decidir} className="grid gap-2">
      <label htmlFor={`motivo-${pedidoId}`} className="text-sm font-semibold">
        {acao === "approve" ? "Motivo da aprovação (as peças voltam ao estoque e a reserva termina)" : "Motivo da recusa (a reserva continua valendo)"}
      </label>
      <textarea id={`motivo-${pedidoId}`} name="motivo" rows={2} maxLength={500} className="rounded-campo border-2 border-tinta bg-branco p-2 text-base" />
      {erro && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" variante={acao === "approve" ? "escuro" : "contorno"} carregando={ocupado}>
          {acao === "approve" ? "Confirmar aprovação" : "Confirmar recusa"}
        </Botao>
        <Botao variante="link" onClick={() => { setAcao(null); setErro(null); }}>Voltar</Botao>
      </div>
    </form>
  );
}

/** Frete calculado à mão (regra 17): valor, prazo em dias úteis e observação; a cliente tem 2 h. */
export function FormFrete({ reservaId, aoSalvar }: { reservaId: string; aoSalvar: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio(aoSalvar);
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const valor = Math.round(Number(String(f.get("valor") ?? "").replace(/\./g, "").replace(",", ".")) * 100);
    const prazo = String(f.get("prazo") ?? "").trim();
    const observacao = String(f.get("observacao") ?? "").trim();
    if (!Number.isFinite(valor) || valor < 1 || valor > 100_000) return setErro("Informe o valor do frete, como 15,00.");
    if (prazo && !/^\d{1,2}$/.test(prazo)) return setErro("O prazo é em dias úteis, de 0 a 60.");
    void enviar(chamarApi(`v1/admin/reservations/${reservaId}/shipping-quote`, {
      valorCentavos: valor, ...(prazo ? { prazoDias: Number(prazo) } : {}), ...(observacao ? { observacao } : {}),
    }));
  }
  return (
    <form onSubmit={salvar} className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo name="valor" rotulo="Valor do frete (R$)" inputMode="decimal" placeholder="15,00" maxLength={9} />
        <Campo name="prazo" rotulo="Prazo (dias úteis)" inputMode="numeric" maxLength={2} />
      </div>
      <Campo name="observacao" rotulo="Observação para a cliente (opcional)" maxLength={300} placeholder="Ex.: entrega à tarde" />
      {erro && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erro}</p>}
      <Botao type="submit" carregando={ocupado}>Enviar o frete para a cliente</Botao>
      <p className="m-0 text-xs text-tinta-suave">A cliente recebe o valor no WhatsApp e tem 2 horas para pagar.</p>
    </form>
  );
}

/** Próximo passo da entrega: pronto / saiu / enviado (com rastreio) e, depois, entregue. */
export function AcoesEntrega({ reservaId, modalidade, substatus, aoMudar }: { reservaId: string; modalidade?: string; substatus?: string; aoMudar: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio(aoMudar);
  const [entregando, setEntregando] = useState(false);

  if (substatus === "EM_PREPARACAO") {
    if (modalidade === "ENVIO") {
      return (
        <form className="grid gap-2" onSubmit={(e) => {
          e.preventDefault();
          const rastreio = String(new FormData(e.currentTarget).get("rastreio") ?? "").trim().toUpperCase();
          if (rastreio && !/^[A-Z0-9-]{4,40}$/.test(rastreio)) return setErro("Confira o código de rastreio.");
          void enviar(chamarApi(`v1/admin/reservations/${reservaId}/fulfillment/substatus`, { substatus: "ENVIADO", ...(rastreio ? { rastreio } : {}) }, "PUT"));
        }}>
          <Campo name="rastreio" rotulo="Código de rastreio (opcional)" maxLength={40} className="uppercase" />
          {erro && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erro}</p>}
          <Botao type="submit" carregando={ocupado}>Marcar como enviado</Botao>
        </form>
      );
    }
    const proximo = modalidade === "RETIRADA" ? ["PRONTO_PARA_RETIRADA", "Pronto para retirada"] : ["SAIU_PARA_ENTREGA", "Saiu para entrega"];
    return (
      <div className="grid gap-2">
        {erro && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erro}</p>}
        <Botao carregando={ocupado} onClick={() => void enviar(chamarApi(`v1/admin/reservations/${reservaId}/fulfillment/substatus`, { substatus: proximo[0] }, "PUT"))}>
          Marcar: {proximo[1]}
        </Botao>
        <p className="m-0 text-xs text-tinta-suave">A cliente recebe o aviso no WhatsApp.</p>
      </div>
    );
  }

  if (substatus && ["PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO"].includes(substatus)) {
    return entregando ? (
      <form className="grid gap-2" onSubmit={(e) => {
        e.preventDefault();
        const observacao = String(new FormData(e.currentTarget).get("observacao") ?? "").trim();
        void enviar(chamarApi(`v1/admin/reservations/${reservaId}/deliver`, observacao ? { observacao } : {}));
      }}>
        <Campo name="observacao" rotulo="Observação (opcional)" maxLength={500} placeholder="Ex.: retirado pela irmã" />
        {erro && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erro}</p>}
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" variante="escuro" carregando={ocupado}>Confirmar entrega</Botao>
          <Botao variante="link" onClick={() => setEntregando(false)}>Voltar</Botao>
        </div>
      </form>
    ) : (
      <Botao variante="escuro" onClick={() => setEntregando(true)}>Marcar como entregue</Botao>
    );
  }
  return erro ? <Aviso tipo="erro" titulo={erro} /> : null;
}
