"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { chamarApi, dataHora, telefone } from "@/lib/api";
import { STATUS_RESERVA } from "@/lib/rotulos";
import { DecisaoComMotivo } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Abas, Aviso, Carregando, Selo, tomDoStatus } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Pagamentos (F6.9, tela 12 do protótipo; sem referência V4, no estilo do painel V4). Desde 03/10
// (0600, pedido da loja: "não tem o histórico dos pagamentos, nem em análise, nem cancelado, nem
// aprovado"), a tela abre com todos os pagamentos, dos mais novos aos mais antigos, filtrados por
// grupo. A aba Em análise segue como antes: pagamento aprovado fora do prazo ou com valor
// diferente nunca confirma sozinho; a loja estorna ou converte em um pedido novo, e a reserva de
// origem não é reativada.

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

type Grupo = "APROVADO" | "AGUARDANDO" | "EM_ANALISE" | "ESTORNADO" | "NAO_PAGO";
interface Pagamento {
  id: string; status: string; grupo: Grupo; forma: "PIX" | "CARTAO"; finalidade: "PRODUTOS" | "FRETE"; valorCentavos: number;
  criadoEm: string; aprovadoEm?: string; estornadoEm?: string; idProvedor?: string; motivoAnalise?: string;
  reserva: { id: string; numero: number; status: string; nome: string; telefone: string; totalCentavos: number };
}
interface Historico { totais: Partial<Record<Grupo, number>>; itens: Pagamento[] }

const GRUPOS: { valor: Grupo | "TODOS"; texto: string }[] = [
  { valor: "TODOS", texto: "Todos" }, { valor: "APROVADO", texto: "Aprovados" }, { valor: "AGUARDANDO", texto: "Aguardando" },
  { valor: "EM_ANALISE", texto: "Em análise" }, { valor: "ESTORNADO", texto: "Estornados" }, { valor: "NAO_PAGO", texto: "Não pagos" },
];
/** O status do provedor em palavras da loja. */
const STATUS: Record<string, string> = {
  CRIADO: "Cobrança criada", PENDENTE: "Aguardando pagamento", APROVADO: "Aprovado", RECUSADO: "Recusado",
  CANCELADO: "Cancelado", FALHOU: "Falhou", EM_ANALISE: "Em análise", ESTORNADO: "Estornado",
};
const TOM: Record<Grupo, "reserved" | "paid" | "issue" | "ship" | "expired"> = {
  APROVADO: "paid", AGUARDANDO: "reserved", EM_ANALISE: "issue", ESTORNADO: "expired", NAO_PAGO: "expired",
};

type Aba = "HISTORICO" | "ABERTA" | "RESOLVIDA";

export function Pagamentos() {
  const [aba, setAba] = useState<Aba>(useSearchParams().get("aba") === "analise" ? "ABERTA" : "HISTORICO");
  const abertos = useDados<Caso[]>("v1/admin/payment-reviews?status=ABERTA");
  const resolvidos = useDados<Caso[]>(aba === "RESOLVIDA" ? "v1/admin/payment-reviews?status=RESOLVIDA" : null);
  const nAbertos = abertos.dados?.length ?? 0;
  // O caso convertido sai da aba Em análise: o pedido novo aparece aqui em cima.
  const [novoPedido, setNovoPedido] = useState<{ id: string; numero: number } | null>(null);
  const casos = aba === "ABERTA" ? abertos : resolvidos;
  const atualizar = () => { void abertos.recarregar(); void resolvidos.recarregar(); };

  return (
    <Casca kicker="PAGAMENTOS" titulo="Pagamentos"
      sub="Todos os pagamentos pelo Mercado Pago, dos mais novos aos mais antigos. Em análise ficam os aprovados depois do prazo da reserva: eles nunca confirmam sozinhos, e a loja estorna ou converte em um novo pedido.">
      <Abas rotulo="Escolher a lista" valor={aba} aoMudar={setAba}
        opcoes={[{ valor: "HISTORICO", texto: "Todos os pagamentos" }, { valor: "ABERTA", texto: "Em análise", n: nAbertos }, { valor: "RESOLVIDA", texto: "Análises resolvidas" }]} />
      {aba === "HISTORICO" && nAbertos > 0 && (
        <div className="mb">
          <Aviso tipo="yellow" titulo={`${nAbertos} ${nAbertos === 1 ? "pagamento espera" : "pagamentos esperam"} a decisão da loja.`}>
            <p><button type="button" className="btn-link" onClick={() => setAba("ABERTA")}>Ver em análise</button></p>
          </Aviso>
        </div>
      )}
      {novoPedido && (
        <div className="mb">
          <Aviso tipo="green" titulo={`Pedido #${novoPedido.numero} criado em Pagamento confirmado.`}>
            <p>A cliente recebe o aviso no WhatsApp. <Link className="btn-link" href={`/reservas/${novoPedido.id}`}>Abrir o pedido #{novoPedido.numero}</Link></p>
          </Aviso>
        </div>
      )}
      {aba === "HISTORICO" ? <ListaDePagamentos /> : !casos.dados ? <Carregando erro={casos.erro} /> : casos.dados.length === 0 ? (
        <p className="muted loading">{aba === "ABERTA" ? "Nenhum pagamento esperando decisão." : "Nenhum caso resolvido."}</p>
      ) : (
        <div className="list">{casos.dados.map((c) => <CartaoCaso key={c.id} caso={c} aoResolver={atualizar} aoConverter={setNovoPedido} />)}</div>
      )}
      <p className="field-help mt">Cada reserva é paga com uma única forma, PIX ou cartão, escolhida na primeira cobrança; o valor da cobrança é sempre o total exato da reserva.</p>
    </Casca>
  );
}

function ListaDePagamentos() {
  const [grupo, setGrupo] = useState<Grupo | "TODOS">("TODOS");
  const { dados, erro } = useDados<Historico>(`v1/admin/payments?grupo=${grupo}`);
  const total = dados ? Object.values(dados.totais).reduce((s, n) => s + (n ?? 0), 0) : 0;

  return (
    <>
      <div className="board-filters pag-filtros" role="group" aria-label="Filtrar pagamentos">
        {GRUPOS.map((g) => {
          const n = g.valor === "TODOS" ? total : dados?.totais[g.valor] ?? 0;
          return (
            <button key={g.valor} type="button" aria-pressed={grupo === g.valor} className={`filter-chip${grupo === g.valor ? " active" : ""}`} onClick={() => setGrupo(g.valor)}>
              {g.texto}{dados ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
      {!dados ? <Carregando erro={erro} /> : dados.itens.length === 0 ? (
        <p className="muted loading">{grupo === "TODOS" ? "Nenhum pagamento ainda." : "Nenhum pagamento neste grupo."}</p>
      ) : (
        <ul className="list pag-lista" aria-label="Pagamentos">
          {dados.itens.map((p) => (
            <li key={p.id}>
              <Link className="reservation" href={`/reservas/${p.reserva.id}`}>
                <div className={`res-id pag-${p.grupo.toLowerCase()}`}>#{p.reserva.numero}</div>
                <div className="res-main">
                  <b>{p.reserva.nome}</b>
                  <div className="meta">
                    {p.forma === "PIX" ? "PIX" : "Cartão"}{p.finalidade === "FRETE" ? " · frete" : ""} · {telefone(p.reserva.telefone)}
                    {p.idProvedor ? ` · Mercado Pago nº ${p.idProvedor}` : ""}
                  </div>
                  <div className="pag-selos">
                    <Selo tom={TOM[p.grupo]}>{STATUS[p.status] ?? p.status}</Selo>
                    {p.motivoAnalise && <Selo tom="issue">{MOTIVO_ANALISE[p.motivoAnalise] ?? p.motivoAnalise}</Selo>}
                  </div>
                  {(p.aprovadoEm || p.estornadoEm) && (
                    <div className="meta">
                      {p.aprovadoEm ? `Aprovado em ${dataHora(p.aprovadoEm)}` : ""}{p.aprovadoEm && p.estornadoEm ? " · " : ""}{p.estornadoEm ? `Estornado em ${dataHora(p.estornadoEm)}` : ""}
                    </div>
                  )}
                </div>
                <div className="res-side">
                  <div className="amount">{formatarReais(p.valorCentavos)}</div>
                  <div className="date">{dataHora(p.criadoEm)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {dados && dados.itens.length >= 100 && <p className="field-help">Mostrando os 100 mais recentes. Os anteriores estão na tela de cada reserva.</p>}
    </>
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
