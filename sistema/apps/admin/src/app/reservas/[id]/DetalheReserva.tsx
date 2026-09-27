"use client";

import Link from "next/link";
import { formatarReais, linkWhatsApp } from "@tshirtclub/domain";
import { dataHora, telefone } from "@/lib/api";
import { MODALIDADE, MOTIVO_ENCERRAMENTO, STATUS_PAGAMENTO, STATUS_RESERVA, SUBSTATUS } from "@/lib/rotulos";
import { AcoesEntrega, DecisaoCancelamento, FormFrete } from "../../_painel/acoes";
import { Casca, Icone } from "../../_painel/Casca";
import { Aviso, Carregando, Selo, tomDoStatus } from "../../_painel/ui";
import { useDados } from "../../_painel/useDados";

// Detalhe da reserva (telas 05 e 06 da V4): o que pede ação no topo (cancelamento ou
// entrega e frete), peças, pagamentos, cliente, prazos e linha do tempo.

interface Detalhe {
  id: string; numero: number; status: string; motivoEncerramento?: string | null; nome: string; telefone: string; entrega?: string;
  subtotalCentavos: number; descontoCentavos: number; totalCentavos: number; cupom?: string | null;
  criadaEm: string; expiraEm: string; pagaEm?: string | null; expiradaEm?: string | null; entregueEm?: string | null; entreguePor?: string | null;
  itens?: { produtoId: string; varianteId?: string; nome: string; tamanho?: string; rotuloTamanho?: string; qtd: number; totalCentavos: number }[];
  descontos?: { tipo: string; valorCentavos: number; rotulo: string | null }[];
  logistica?: {
    modalidade?: string; substatus?: string; endereco?: Record<string, string>; codigoRetirada?: string; rastreio?: string;
    frete?: { valorCentavos: number; prazoDias?: number; observacao?: string; pagarAte?: string; status?: string; pagoEm?: string };
  } | null;
  pagamentos: { id: string; finalidade: string; forma: string; status: string; valorCentavos: number; criadoEm: string }[];
  cancelamentos: { id: string; status: string; observacao?: string; solicitadoEm: string; decididoEm?: string; motivoDecisao?: string; decididoPor?: string }[];
  transicoes: { evento: string; para?: string; ator: string; atorNome?: string; motivo?: string; em: string }[];
  cliente: { bloqueado: boolean; reservas: number; expiracoes30Dias: number };
}

const CAMISETA = <path d="m8 4 4 2 4-2 5 3-3 5-2-1v9H8v-9l-2 1-3-5Z" />;
const FUNDOS_PECA = ["linear-gradient(135deg,var(--pink-soft),var(--lemon-soft))", "linear-gradient(135deg,var(--green-soft),var(--pink-soft))", "linear-gradient(135deg,var(--blue-soft),var(--lemon-soft))"];
const LOJA_AGE = new Set(["AGUARDANDO_CALCULO_FRETE", "FRETE_VENCIDO", "EM_PREPARACAO", "PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO"]);

function subtitulo(r: Detalhe, pendente: boolean): string {
  if (r.status === "RESERVADO") return pendente ? "Detalhes da reserva, prazo e pedido de cancelamento." : "Detalhes da reserva e prazo para pagar.";
  if (r.status === "EXPIRADO") return `Reserva encerrada${r.motivoEncerramento ? ` por ${MOTIVO_ENCERRAMENTO[r.motivoEncerramento] ?? r.motivoEncerramento}` : ""}.`;
  if (r.status === "ENTREGUE") return "Pedido entregue.";
  const sub = r.logistica?.substatus;
  if (sub === "AGUARDANDO_CALCULO_FRETE") return "Pagamento confirmado. Falta calcular e enviar o frete.";
  if (sub === "AGUARDANDO_MODALIDADE") return "Pagamento confirmado. A cliente ainda vai escolher a entrega.";
  return `Pagamento confirmado${sub ? ` · ${SUBSTATUS[sub] ?? sub}` : ""}.`;
}

export function DetalheReserva({ id }: { id: string }) {
  const { dados: r, erro, recarregar } = useDados<Detalhe>(`v1/admin/reservations/${id}`);
  const atualizar = () => void recarregar();

  if (!r) return <Casca kicker="RESERVAS" titulo="Reserva"><Carregando erro={erro} /></Casca>;

  const pendente = r.cancelamentos.find((c) => c.status === "PENDENTE");
  const log = r.logistica ?? null;
  const e = log?.endereco;
  const pago = r.status === "PAGAMENTO_CONFIRMADO";
  const corNumero = r.status === "RESERVADO" ? "var(--pink-dark)" : r.status === "EXPIRADO" ? "var(--muted)" : "var(--green)";
  const eventos = [...r.transicoes];

  return (
    <Casca
      kicker="RESERVAS"
      topo={`Reserva #${r.numero}`}
      titulo={<>Reserva <em style={{ color: corNumero }}>#{r.numero}</em></>}
      sub={subtitulo(r, Boolean(pendente))}
      acoes={<><Link className="btn btn-ghost" href="/reservas">← Todas as reservas</Link><Selo tom={tomDoStatus(r.status)}>{STATUS_RESERVA[r.status] ?? r.status}</Selo></>}
    >
      {erro && <div style={{ marginBottom: 16 }}><Aviso tipo="error" titulo={erro} /></div>}

      {pendente && (
        <Aviso tag="AÇÃO PENDENTE" titulo="Pedido de cancelamento">
          <p>Pedido em {dataHora(pendente.solicitadoEm)}{pendente.observacao ? `: “${pendente.observacao}”` : ", sem motivo."}</p>
          <p style={{ marginTop: 4 }}>O prazo da reserva continua correndo enquanto a loja decide.</p>
          <DecisaoCancelamento pedidoId={pendente.id} aoDecidir={atualizar} />
        </Aviso>
      )}

      {log && (pago || r.status === "ENTREGUE") && (
        <Aviso tipo="green" tag="ENTREGA" titulo={`${MODALIDADE[log.modalidade ?? ""] ?? "Entrega ainda não escolhida"}${log.substatus && pago ? ` · ${SUBSTATUS[log.substatus] ?? log.substatus}` : ""}`}>
          {e && <p>{e.rua}, {e.numero}{e.complemento ? `, ${e.complemento}` : ""} · {e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep}</p>}
          {log.codigoRetirada && <p>Código de retirada: <b className="pop" style={{ fontSize: 16, letterSpacing: ".08em" }}>{log.codigoRetirada}</b></p>}
          {log.rastreio && <p>Rastreio: <b style={{ userSelect: "all" }}>{log.rastreio}</b></p>}
          {log.frete && (
            <p>
              Frete {formatarReais(log.frete.valorCentavos)}
              {log.frete.prazoDias !== undefined ? ` · ${log.frete.prazoDias} ${log.frete.prazoDias === 1 ? "dia útil" : "dias úteis"}` : ""}
              {log.frete.pagoEm ? ` · pago em ${dataHora(log.frete.pagoEm)}` : log.frete.pagarAte ? ` · pagar até ${dataHora(log.frete.pagarAte)}` : ""}
            </p>
          )}
          {pago && log.substatus === "FRETE_VENCIDO" && <p style={{ marginTop: 6 }}><b>O prazo do frete venceu.</b> Combine com a cliente e envie um valor novo.</p>}
          {pago && (log.substatus === "AGUARDANDO_CALCULO_FRETE" || log.substatus === "FRETE_VENCIDO") && <FormFrete reservaId={r.id} aoSalvar={atualizar} />}
          {pago && <AcoesEntrega reservaId={r.id} modalidade={log.modalidade} substatus={log.substatus} aoMudar={atualizar} />}
          {r.entregueEm && <p style={{ marginTop: 6 }}>Entregue em {dataHora(r.entregueEm)}{r.entreguePor ? ` por ${r.entreguePor}` : ""}.</p>}
        </Aviso>
      )}

      <section className="grid split" style={{ marginTop: 18 }}>
        <div className="grid">
          <article className="card">
            <h2>Peças</h2>
            <div className="pieces">
              {(r.itens ?? []).map((i, n) => (
                <div className="piece" key={i.produtoId}>
                  <div className="piece-img" style={{ background: FUNDOS_PECA[n % FUNDOS_PECA.length] }}><Icone>{CAMISETA}</Icone></div>
                  <div><b>{i.nome} × {i.qtd}</b><small>{i.rotuloTamanho ? `Tamanho ${i.rotuloTamanho}` : "Tamanho único"}</small></div>
                  <span className="piece-price">{formatarReais(i.totalCentavos)}</span>
                </div>
              ))}
            </div>
            <div className="kv" style={{ marginTop: 10 }}>
              <div className="kv-row"><span>Subtotal</span><b>{formatarReais(r.subtotalCentavos)}</b></div>
              {(r.descontos ?? []).map((d, n) => <div key={n} className="kv-row discount"><span>{d.rotulo ?? d.tipo}</span><b>− {formatarReais(d.valorCentavos)}</b></div>)}
              {r.cupom && <div className="kv-row"><span>Cupom</span><b>{r.cupom}</b></div>}
              <div className="kv-row"><span>Total</span><b className="price-total">{formatarReais(r.totalCentavos)}</b></div>
            </div>
          </article>
          <article className="card">
            <h2>Pagamentos</h2>
            {r.pagamentos.length === 0 ? <p className="muted" style={{ fontSize: 11, margin: 0 }}>Nenhuma cobrança criada.</p> : (
              <div className="list">
                {r.pagamentos.map((p) => (
                  <div className="alert-row" key={p.id}>
                    <div className="copy">
                      <div className="alert-icon" style={{ background: p.status === "APROVADO" ? "var(--green-soft)" : "var(--lemon-soft)" }}>
                        <Icone><path d="M4 7a3 3 0 0 1 3-3h10v4h3v10H6a2 2 0 0 1-2-2Z" /><path d="M16 12h4" /></Icone>
                      </div>
                      <div>
                        <b>{p.finalidade === "FRETE" ? "Frete" : "Produtos"} · {p.forma === "PIX" ? "PIX" : "Cartão"} · {dataHora(p.criadoEm)}</b>
                        <p>{STATUS_PAGAMENTO[p.status] ?? p.status} · {formatarReais(p.valorCentavos)}</p>
                      </div>
                    </div>
                    <Selo tom={p.status === "APROVADO" ? "paid" : ["RECUSADO", "CANCELADO", "FALHOU", "ESTORNADO"].includes(p.status) ? "expired" : "reserved"}>
                      {STATUS_PAGAMENTO[p.status] ?? p.status}
                    </Selo>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>

        <aside className="grid" aria-label="Cliente e prazos">
          <article className="card">
            <h2>Cliente</h2>
            <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{r.nome}</p>
            <a href={linkWhatsApp(r.telefone, `Oi, ${r.nome.split(" ")[0]}! Sobre a reserva #${r.numero}`)} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: "var(--pink-dark)", fontWeight: 700, display: "inline-flex", minHeight: 44, alignItems: "center" }}>
              {telefone(r.telefone)} · WhatsApp
            </a>
            <p className="muted" style={{ fontSize: 10 }}>
              {r.cliente.reservas} {r.cliente.reservas === 1 ? "reserva" : "reservas"} · {r.cliente.expiracoes30Dias} expiradas em 30 dias{r.cliente.bloqueado ? " · telefone bloqueado" : ""}
            </p>
          </article>
          <article className="card">
            <h2>Prazos</h2>
            <div className="kv">
              <div className="kv-row"><span>Criada</span><b>{dataHora(r.criadaEm)}</b></div>
              {r.status === "RESERVADO" && <div className="kv-row"><span>Pagar até</span><b style={{ color: "var(--pink-dark)" }}>{dataHora(r.expiraEm)}</b></div>}
              {r.pagaEm && <div className="kv-row"><span>Paga</span><b>{dataHora(r.pagaEm)}</b></div>}
              {r.expiradaEm && <div className="kv-row"><span>Expirada</span><b>{dataHora(r.expiradaEm)}</b></div>}
              {r.entrega && <div className="kv-row"><span>Entrega pretendida</span><b>{MODALIDADE[r.entrega]}</b></div>}
            </div>
          </article>
          <article className="card">
            <h2>Linha do tempo</h2>
            <ol className="timeline" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {eventos.map((t, n) => (
                <li className="event" key={n}>
                  <span className="event-dot" aria-hidden="true" />
                  <div>
                    <b>{t.para ? STATUS_RESERVA[t.para] ?? t.para : t.evento}</b>
                    <span>{dataHora(t.em)} · {t.atorNome ?? (t.ator === "CLIENTE" ? "Cliente" : t.ator === "SISTEMA" ? "Sistema" : t.ator)}{t.motivo ? ` · ${t.motivo}` : ""}</span>
                  </div>
                </li>
              ))}
              {r.cancelamentos.filter((c) => c.status !== "PENDENTE").map((c) => (
                <li className="event" key={c.id}>
                  <span className="event-dot" aria-hidden="true" />
                  <div>
                    <b>Cancelamento {c.status === "APROVADA" ? "aprovado" : c.status === "RECUSADA" ? "recusado" : "sem efeito"}</b>
                    <span>{c.decididoEm ? dataHora(c.decididoEm) : ""}{c.decididoPor ? ` · ${c.decididoPor}` : ""}{c.motivoDecisao ? ` · ${c.motivoDecisao}` : ""}</span>
                  </div>
                </li>
              ))}
              {r.status === "RESERVADO" && (
                <li className="event"><span className="event-dot muted" aria-hidden="true" /><div><b>Aguardando próximo passo</b><span>O prazo continua correndo.</span></div></li>
              )}
              {pago && log?.substatus && LOJA_AGE.has(log.substatus) && (
                <li className="event"><span className="event-dot muted" aria-hidden="true" /><div><b>{SUBSTATUS[log.substatus]}</b><span>Aguardando ação da loja.</span></div></li>
              )}
            </ol>
          </article>
        </aside>
      </section>
    </Casca>
  );
}
