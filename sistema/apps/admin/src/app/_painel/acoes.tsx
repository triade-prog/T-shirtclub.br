"use client";

import Link from "next/link";
import { useState } from "react";
import { chamarApi, type RespostaApi } from "@/lib/api";
import { paraCentavos } from "@/lib/catalogo";
import { useEnvio } from "./useEnvio";
import { Botao, Campo, Seta } from "./ui";

// Ações da operação (F7, F8) no desenho V4 (telas 05 a 08): toda decisão pede motivo (vai
// para a auditoria) e o erro aparece junto do formulário.

/** Aprovar ou recusar um pedido de cancelamento (regra 12), sempre com motivo. */
export function DecisaoCancelamento({ pedidoId, reservaId, aoDecidir }: { pedidoId: string; reservaId?: string; aoDecidir: () => void }) {
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
      <div className="actions" style={{ marginTop: 14 }}>
        <Botao onClick={() => setAcao("approve")}>Aprovar cancelamento</Botao>
        <Botao variante="ghost" onClick={() => setAcao("reject")}>Recusar</Botao>
        {reservaId && <Link className="btn btn-ghost" href={`/reservas/${reservaId}`}>Abrir reserva</Link>}
      </div>
    );
  }
  return (
    <form onSubmit={decidir} className="decision">
      <Campo multilinha name="motivo" maxLength={500} erro={erro ?? undefined}
        rotulo={acao === "approve" ? "Motivo da aprovação" : "Motivo da recusa"}
        ajuda={acao === "approve" ? "As peças voltam ao estoque e a reserva termina." : "A reserva continua valendo até o fim do prazo."} />
      <div className="actions">
        <Botao type="submit" variante={acao === "approve" ? "dark" : "ghost"} carregando={ocupado}>
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
    const valor = paraCentavos(String(f.get("valor") ?? ""));
    const prazo = String(f.get("prazo") ?? "").trim();
    const observacao = String(f.get("observacao") ?? "").trim();
    if (valor === null || valor < 1 || valor > 100_000) return setErro("Informe o valor do frete, como 15,00.");
    if (prazo && !/^\d{1,2}$/.test(prazo)) return setErro("O prazo é em dias úteis, de 0 a 60.");
    void enviar(chamarApi(`v1/admin/reservations/${reservaId}/shipping-quote`, {
      valorCentavos: valor, ...(prazo ? { prazoDias: Number(prazo) } : {}), ...(observacao ? { observacao } : {}),
    }));
  }
  return (
    <form onSubmit={salvar} className="grid" style={{ gap: 12, marginTop: 14 }} noValidate>
      <div className="form-row two">
        <Campo name="valor" rotulo="Valor do frete (R$)" inputMode="decimal" placeholder="15,00" maxLength={9} />
        <Campo name="prazo" rotulo="Prazo (dias úteis)" inputMode="numeric" maxLength={2} placeholder="2" />
      </div>
      <Campo name="observacao" rotulo="Observação para a cliente (opcional)" maxLength={300} placeholder="Ex.: entrega à tarde" />
      {erro && <p role="alert" className="field-error">{erro}</p>}
      <Botao type="submit" carregando={ocupado}>Enviar o frete para a cliente <Seta /></Botao>
      <p className="field-help">A cliente recebe o valor no WhatsApp e tem 2 horas para pagar.</p>
    </form>
  );
}

/** Próximo passo da entrega: pronto / saiu / enviado (com rastreio) e, depois, entregue. */
export function AcoesEntrega({ reservaId, modalidade, substatus, aoMudar }: { reservaId: string; modalidade?: string; substatus?: string; aoMudar: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio(aoMudar);
  const [entregando, setEntregando] = useState(false);
  const mudar = (corpo: Record<string, string>) => void enviar(chamarApi(`v1/admin/reservations/${reservaId}/fulfillment/substatus`, corpo, "PUT"));

  if (substatus === "EM_PREPARACAO") {
    if (modalidade === "ENVIO") {
      return (
        <form className="grid" style={{ gap: 12, marginTop: 14 }} onSubmit={(e) => {
          e.preventDefault();
          const rastreio = String(new FormData(e.currentTarget).get("rastreio") ?? "").trim().toUpperCase();
          if (rastreio && !/^[A-Z0-9-]{4,40}$/.test(rastreio)) return setErro("Confira o código de rastreio.");
          mudar({ substatus: "ENVIADO", ...(rastreio ? { rastreio } : {}) });
        }}>
          <Campo name="rastreio" rotulo="Código de rastreio (opcional)" maxLength={40} erro={erro ?? undefined} />
          <Botao type="submit" carregando={ocupado}>Marcar como enviado <Seta /></Botao>
        </form>
      );
    }
    const [valor, rotulo] = modalidade === "RETIRADA" ? ["PRONTO_PARA_RETIRADA", "Pronto para retirada"] : ["SAIU_PARA_ENTREGA", "Saiu para entrega"];
    return (
      <div className="grid" style={{ gap: 8, marginTop: 14 }}>
        {erro && <p role="alert" className="field-error">{erro}</p>}
        <Botao carregando={ocupado} onClick={() => mudar({ substatus: valor })}>Marcar: {rotulo} <Seta /></Botao>
        <p className="field-help">A cliente recebe o aviso no WhatsApp.</p>
      </div>
    );
  }

  if (substatus && ["PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO"].includes(substatus)) {
    return entregando ? (
      <form className="grid" style={{ gap: 12, marginTop: 14 }} onSubmit={(e) => {
        e.preventDefault();
        const observacao = String(new FormData(e.currentTarget).get("observacao") ?? "").trim();
        void enviar(chamarApi(`v1/admin/reservations/${reservaId}/deliver`, observacao ? { observacao } : {}));
      }}>
        <Campo name="observacao" rotulo="Observação (opcional)" maxLength={500} placeholder="Ex.: retirado pela irmã" erro={erro ?? undefined} />
        <div className="actions">
          <Botao type="submit" carregando={ocupado}>Confirmar entrega</Botao>
          <Botao variante="link" onClick={() => setEntregando(false)}>Voltar</Botao>
        </div>
      </form>
    ) : (
      <div className="actions" style={{ marginTop: 14 }}><Botao onClick={() => setEntregando(true)}>Marcar como entregue</Botao></div>
    );
  }
  return erro ? <p role="alert" className="field-error">{erro}</p> : null;
}

/**
 * Decisão com motivo obrigatório e mais de um caminho (análise de pagamento, contestação,
 * bloqueio): o motivo fica visível, cada botão manda a decisão com ele e o erro aparece junto.
 */
export function DecisaoComMotivo({ rotulo, ajuda, placeholder, opcoes, aoDecidir }: {
  rotulo: string;
  ajuda?: string;
  placeholder?: string;
  opcoes: { rotulo: string; variante?: "dark" | "ghost" | "danger"; enviar: (motivo: string) => Promise<RespostaApi<unknown>> }[];
  aoDecidir: () => void;
}) {
  const { ocupado, erro, setErro, enviar } = useEnvio(aoDecidir);
  const [qual, setQual] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  function decidir(i: number) {
    const texto = motivo.trim();
    if (texto.length < 3) return setErro("Escreva o motivo: ele fica registrado na auditoria.");
    setQual(i);
    void enviar(opcoes[i]!.enviar(texto));
  }

  return (
    <div className="decision">
      <div className="field">
        <label htmlFor={`motivo-${rotulo}`}>{rotulo}</label>
        <textarea id={`motivo-${rotulo}`} className="textarea" maxLength={500} placeholder={placeholder} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          aria-invalid={erro ? true : undefined} aria-describedby={erro ? `motivo-${rotulo}-erro` : undefined} />
        {erro && <p className="field-error" id={`motivo-${rotulo}-erro`} role="alert">{erro}</p>}
      </div>
      <div className="actions">
        {opcoes.map((o, i) => (
          <Botao key={o.rotulo} variante={o.variante ?? "dark"} carregando={ocupado && qual === i} disabled={ocupado && qual !== i} onClick={() => decidir(i)}>{o.rotulo}</Botao>
        ))}
      </div>
      {ajuda && <p className="field-help">{ajuda}</p>}
    </div>
  );
}
