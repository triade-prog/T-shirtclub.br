"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { chamarApi, dataHora, telefone } from "@/lib/api";
import { STATUS_RESERVA } from "@/lib/rotulos";
import { DecisaoComMotivo } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Abas, Aviso, Carregando, Selo, tomDoStatus } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Pagamentos em análise (F6.9, tela 12 do protótipo; sem referência V4, no estilo do painel V4):
// pagamento aprovado fora do prazo ou com valor diferente nunca confirma sozinho. A loja
// estorna ou converte em um pedido novo; a reserva de origem não é reativada.

export const MOTIVO_ANALISE: Record<string, string> = {
  APROVADO_APOS_TOLERANCIA: "Aprovado depois da tolerância",
  RESERVA_ENCERRADA: "Reserva já encerrada",
  VALOR_DIVERGENTE: "Valor diferente do cobrado",
  FRETE_ENCERRADO: "Frete já encerrado",
};

interface Caso {
  id: string; motivo: string; status: "ABERTA" | "RESOLVIDA"; resolucao?: "ESTORNAR" | "CONVERTER_EM_PEDIDO"; nota?: string; criadaEm: string; novaReservaId?: string;
  pagamento: { id: string; forma: "PIX" | "CARTAO"; finalidade: string; valorCentavos: number; aprovadoEm?: string };
  reserva: { id: string; numero: number; status: string; nome: string; telefone: string; totalCentavos: number; expiradaEm?: string };
}

type Filtro = "ABERTA" | "RESOLVIDA" | "TODAS";

export function Pagamentos() {
  const [filtro, setFiltro] = useState<Filtro>("ABERTA");
  const { dados, erro, recarregar } = useDados<Caso[]>(`v1/admin/payment-reviews?status=${filtro}`);
  const abertos = dados?.filter((c) => c.status === "ABERTA").length ?? 0;
  // O caso convertido sai da aba Abertos: o pedido novo aparece aqui em cima.
  const [novoPedido, setNovoPedido] = useState<{ id: string; numero: number } | null>(null);

  return (
    <Casca kicker="PAGAMENTOS" titulo="Pagamentos em análise"
      sub="Pagamentos aprovados pelo provedor depois do prazo da reserva. Eles nunca confirmam sozinhos e a reserva expirada não é reativada: a loja estorna ou converte em um novo pedido.">
      <Abas rotulo="Filtrar casos" valor={filtro} aoMudar={setFiltro}
        opcoes={[{ valor: "ABERTA", texto: "Abertos", n: filtro === "ABERTA" ? abertos : undefined }, { valor: "RESOLVIDA", texto: "Resolvidos" }, { valor: "TODAS", texto: "Todos" }]} />
      {novoPedido && (
        <div className="mb">
          <Aviso tipo="green" titulo={`Pedido #${novoPedido.numero} criado em Pagamento confirmado.`}>
            <p>A cliente recebe o aviso no WhatsApp. <Link className="btn-link" href={`/reservas/${novoPedido.id}`}>Abrir o pedido #{novoPedido.numero}</Link></p>
          </Aviso>
        </div>
      )}
      {!dados ? <Carregando erro={erro} /> : dados.length === 0 ? (
        <p className="muted loading">{filtro === "ABERTA" ? "Nenhum pagamento esperando decisão." : "Nenhum caso."}</p>
      ) : (
        <div className="list">{dados.map((c) => <CartaoCaso key={c.id} caso={c} aoResolver={() => void recarregar()} aoConverter={setNovoPedido} />)}</div>
      )}
      <p className="field-help mt">Cada reserva é paga com uma única forma, PIX ou cartão, escolhida na primeira cobrança; o valor da cobrança é sempre o total exato da reserva.</p>
    </Casca>
  );
}

function CartaoCaso({ caso: c, aoResolver, aoConverter }: { caso: Caso; aoResolver: () => void; aoConverter: (pedido: { id: string; numero: number }) => void }) {
  const aberto = c.status === "ABERTA";
  const frete = c.pagamento.finalidade === "FRETE";

  return (
    <section className={`card case${aberto ? " open" : ""}`} aria-label={`Pagamento da reserva #${c.reserva.numero}`}>
      <div className="case-head">
        <div>
          <Link href={`/reservas/${c.reserva.id}`} className="pop">#{c.reserva.numero}</Link>
          <p>{c.reserva.nome} · {telefone(c.reserva.telefone)}</p>
        </div>
        <div className="mini-actions">
          <Selo tom={tomDoStatus(c.reserva.status)}>{STATUS_RESERVA[c.reserva.status] ?? c.reserva.status}</Selo>
          {aberto ? <Selo tom="issue">Em análise</Selo> : <Selo tom="paid">Resolvido</Selo>}
        </div>
      </div>
      <div className="notice">
        <p className="big">{MOTIVO_ANALISE[c.motivo] ?? c.motivo}</p>
        <p>
          {formatarReais(c.pagamento.valorCentavos)} por {c.pagamento.forma === "PIX" ? "PIX" : "cartão"}{frete ? " (frete)" : ""}
          {c.pagamento.aprovadoEm ? `, aprovado em ${dataHora(c.pagamento.aprovadoEm)}` : ""}.
          {c.reserva.expiradaEm ? ` A reserva terminou em ${dataHora(c.reserva.expiradaEm)}.` : ""}
          {c.motivo === "VALOR_DIVERGENTE" ? ` O total da reserva é ${formatarReais(c.reserva.totalCentavos)}.` : ""}
          {" "}O pagamento está aprovado no provedor, mas não confirma a reserva.
        </p>
      </div>
      {aberto ? (
        <DecisaoComMotivo rotulo="Motivo da decisão" placeholder="Obrigatório. Ex.: conversei com a cliente pelo WhatsApp"
          ajuda={`Converter cria uma reserva nova, com outro número, já em Pagamento confirmado, se ainda houver estoque. A reserva #${c.reserva.numero} continua como está.`}
          aoDecidir={aoResolver}
          opcoes={[
            { rotulo: "Estornar pagamento", variante: "danger", enviar: (nota) => chamarApi(`v1/admin/payment-reviews/${c.id}/resolve`, { resolucao: "ESTORNAR", nota }) },
            ...(frete ? [] : [{
              rotulo: "Converter em novo pedido", variante: "dark" as const,
              enviar: async (nota: string) => {
                const r = await chamarApi<{ reserva?: { id: string; numero: number } }>(`v1/admin/payment-reviews/${c.id}/resolve`, { resolucao: "CONVERTER_EM_PEDIDO", nota });
                if (r.ok && r.dados.reserva) aoConverter(r.dados.reserva);
                return r;
              },
            }]),
          ]} />
      ) : (
        <p className="field-help">
          {c.resolucao === "ESTORNAR" ? "Estornado" : "Convertido em novo pedido"}{c.nota ? `: “${c.nota}”` : "."}{" "}
          {c.novaReservaId && <Link className="btn-link" href={`/reservas/${c.novaReservaId}`}>Abrir o novo pedido</Link>}
        </p>
      )}
    </section>
  );
}
