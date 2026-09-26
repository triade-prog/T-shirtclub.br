"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { chamarApi, dataHora, telefone } from "@/lib/api";
import { STATUS_PAGAMENTO } from "@/lib/rotulos";
import { DecisaoComMotivo } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Abas, Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Contestações (G2; sem referência V4 nem no protótipo, no estilo do painel V4): pagamento
// já confirmado que voltou por estorno, contestação ou cancelamento no provedor. Enquanto
// estiver aberta, o pedido não pode ser marcado como entregue.

const TIPO: Record<string, string> = { ESTORNO: "Estorno no provedor", CONTESTACAO: "Contestação da cliente", CANCELAMENTO: "Cancelado no provedor" };

interface Disputa {
  id: string; tipo: string; status: "ABERTA" | "RESOLVIDA"; statusProvedor?: string; abertaEm: string; resolvidaEm?: string; nota?: string;
  pagamento: { forma: "PIX" | "CARTAO"; finalidade: string; status: string; valorCentavos: number; aprovadoEm?: string };
  reserva: { id: string; numero: number; status: string; nome: string; telefone: string };
}

type Filtro = "ABERTA" | "RESOLVIDA" | "TODAS";

export function Contestacoes() {
  const [filtro, setFiltro] = useState<Filtro>("ABERTA");
  const { dados, erro, recarregar } = useDados<Disputa[]>(`v1/admin/payment-disputes?status=${filtro}`);
  const abertas = dados?.filter((d) => d.status === "ABERTA").length ?? 0;

  return (
    <Casca kicker="PAGAMENTOS" titulo="Contestações"
      sub="Pagamentos confirmados que voltaram no provedor. Enquanto a contestação estiver aberta, o pedido não pode ser marcado como entregue.">
      <Abas rotulo="Filtrar contestações" valor={filtro} aoMudar={setFiltro}
        opcoes={[{ valor: "ABERTA", texto: "Abertas", n: filtro === "ABERTA" ? abertas : undefined }, { valor: "RESOLVIDA", texto: "Resolvidas" }, { valor: "TODAS", texto: "Todas" }]} />
      {!dados ? <Carregando erro={erro} /> : dados.length === 0 ? (
        <p className="muted loading">{filtro === "ABERTA" ? "Nenhuma contestação aberta." : "Nenhuma contestação."}</p>
      ) : (
        <div className="list">
          {dados.map((d) => (
            <section key={d.id} className={`card case${d.status === "ABERTA" ? " open" : ""}`} aria-label={`Contestação da reserva #${d.reserva.numero}`}>
              <div className="case-head">
                <div>
                  <Link href={`/reservas/${d.reserva.id}`} className="pop">#{d.reserva.numero}</Link>
                  <p>{d.reserva.nome} · {telefone(d.reserva.telefone)}</p>
                </div>
                {d.status === "ABERTA" ? <Selo tom="issue">Aberta</Selo> : <Selo tom="paid">Resolvida</Selo>}
              </div>
              <div className="notice">
                <p className="big">{TIPO[d.tipo] ?? d.tipo}</p>
                <p>
                  {formatarReais(d.pagamento.valorCentavos)} por {d.pagamento.forma === "PIX" ? "PIX" : "cartão"}{d.pagamento.finalidade === "FRETE" ? " (frete)" : ""}
                  {d.pagamento.aprovadoEm ? `, aprovado em ${dataHora(d.pagamento.aprovadoEm)}` : ""}. Aberta em {dataHora(d.abertaEm)}; no provedor: {STATUS_PAGAMENTO[d.pagamento.status] ?? d.statusProvedor ?? d.pagamento.status}.
                </p>
              </div>
              {d.status === "ABERTA" ? (
                <DecisaoComMotivo rotulo="Como foi resolvida" placeholder="Obrigatório. Ex.: peça devolvida na loja; ou cliente desistiu da contestação"
                  ajuda="Registrar a resolução libera o pedido para seguir. O que aconteceu no provedor não muda por aqui."
                  aoDecidir={() => void recarregar()}
                  opcoes={[{ rotulo: "Registrar resolução", enviar: (nota) => chamarApi(`v1/admin/payment-disputes/${d.id}/resolve`, { nota }) }]} />
              ) : (
                <p className="field-help">Resolvida{d.resolvidaEm ? ` em ${dataHora(d.resolvidaEm)}` : ""}{d.nota ? `: “${d.nota}”` : "."}</p>
              )}
            </section>
          ))}
        </div>
      )}
    </Casca>
  );
}
