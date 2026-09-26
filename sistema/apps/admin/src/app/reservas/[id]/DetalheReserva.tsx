"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { formatarReais, linkWhatsApp } from "@tshirtclub/domain";
import { Aviso, Selo } from "@tshirtclub/ui";
import { dataHora, telefone } from "@/lib/api";
import { MODALIDADE, MOTIVO_ENCERRAMENTO, STATUS_PAGAMENTO, STATUS_RESERVA, SUBSTATUS } from "@/lib/rotulos";
import { AcoesEntrega, DecisaoCancelamento, FormFrete } from "../../_painel/acoes";
import { Caixa, Casca } from "../../_painel/Casca";
import { useDados } from "../../_painel/useDados";

interface Detalhe {
  id: string; numero: number; status: string; motivoEncerramento?: string | null; nome: string; telefone: string; entrega?: string;
  subtotalCentavos: number; descontoCentavos: number; totalCentavos: number; cupom?: string | null;
  criadaEm: string; expiraEm: string; pagaEm?: string | null; expiradaEm?: string | null; entregueEm?: string | null; entreguePor?: string | null;
  itens?: { produtoId: string; nome: string; qtd: number; totalCentavos: number }[];
  descontos?: { tipo: string; valorCentavos: number; rotulo: string | null }[];
  logistica?: {
    modalidade?: string; substatus?: string; endereco?: Record<string, string>; codigoRetirada?: string; rastreio?: string;
    frete?: { valorCentavos: number; prazoDias?: number; observacao?: string; pagarAte?: string; status?: string; pagoEm?: string };
  } | null;
  pagamentos: { id: string; finalidade: string; forma: string; status: string; valorCentavos: number; criadoEm: string; aprovadoEm?: string; statusProvedor?: string }[];
  cancelamentos: { id: string; status: string; observacao?: string; solicitadoEm: string; decididoEm?: string; motivoDecisao?: string; decididoPor?: string }[];
  transicoes: { evento: string; de?: string; para?: string; ator: string; atorNome?: string; motivo?: string; em: string }[];
  cliente: { bloqueado: boolean; reservas: number; expiracoes30Dias: number };
}

export function DetalheReserva({ id }: { id: string }) {
  const { dados: r, erro, recarregar } = useDados<Detalhe>(`v1/admin/reservations/${id}`);
  const atualizar = () => void recarregar();

  if (!r) {
    return <Casca titulo="Reserva">{erro ? <Aviso tipo="erro" titulo={erro} /> : <p role="status" className="m-0 text-tinta-suave">Carregando…</p>}</Casca>;
  }
  const pendente = r.cancelamentos.find((c) => c.status === "PENDENTE");
  const log = r.logistica ?? null;
  const e = log?.endereco;

  return (
    <Casca titulo={`Reserva #${r.numero}`} acoes={<Selo fundo={r.status === "RESERVADO" ? "citrino" : r.status === "EXPIRADO" ? "papel" : "rosa"} brilho={false}>{STATUS_RESERVA[r.status] ?? r.status}</Selo>}>
      <Link href="/reservas" className="justify-self-start text-sm font-semibold underline decoration-rosa decoration-2 underline-offset-2">← Todas as reservas</Link>
      {erro && <Aviso tipo="erro" titulo={erro} />}

      <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4">
          {pendente && (
            <Caixa titulo="Pedido de cancelamento" className="border-erro">
              <p className="m-0 text-[15px]">Pedido em {dataHora(pendente.solicitadoEm)}{pendente.observacao ? `: “${pendente.observacao}”` : ", sem motivo."}</p>
              <p className="m-0 text-sm text-tinta-suave">O prazo da reserva continua correndo enquanto a loja decide.</p>
              <DecisaoCancelamento pedidoId={pendente.id} aoDecidir={atualizar} />
            </Caixa>
          )}

          {log && (
            <Caixa titulo="Entrega">
              <p className="m-0 text-[15px]"><b>{MODALIDADE[log.modalidade ?? ""] ?? "Ainda não escolhida"}</b>{log.substatus ? ` · ${SUBSTATUS[log.substatus] ?? log.substatus}` : ""}</p>
              {e && <p className="m-0 text-[15px]">{e.rua}, {e.numero}{e.complemento ? `, ${e.complemento}` : ""} · {e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep}</p>}
              {log.codigoRetirada && <p className="m-0 text-[15px]">Código de retirada: <b className="font-display tracking-[0.08em]">{log.codigoRetirada}</b></p>}
              {log.rastreio && <p className="m-0 text-[15px]">Rastreio: <b className="select-all">{log.rastreio}</b></p>}
              {log.frete && (
                <p className="m-0 text-[15px]">
                  Frete {formatarReais(log.frete.valorCentavos)}{log.frete.prazoDias !== undefined ? ` · ${log.frete.prazoDias} ${log.frete.prazoDias === 1 ? "dia útil" : "dias úteis"}` : ""}
                  {log.frete.pagoEm ? ` · pago em ${dataHora(log.frete.pagoEm)}` : log.frete.pagarAte ? ` · pagar até ${dataHora(log.frete.pagarAte)}` : ""}
                </p>
              )}
              {(log.substatus === "AGUARDANDO_CALCULO_FRETE" || log.substatus === "FRETE_VENCIDO") && (
                <>
                  {log.substatus === "FRETE_VENCIDO" && <Aviso tipo="atencao" titulo="O prazo do frete venceu. Combine com a cliente e envie um valor novo." />}
                  <FormFrete reservaId={r.id} aoSalvar={atualizar} />
                </>
              )}
              {r.status === "PAGAMENTO_CONFIRMADO" && <AcoesEntrega reservaId={r.id} modalidade={log.modalidade} substatus={log.substatus} aoMudar={atualizar} />}
              {r.entregueEm && <p className="m-0 text-sm text-tinta-suave">Entregue em {dataHora(r.entregueEm)}{r.entreguePor ? ` por ${r.entreguePor}` : ""}.</p>}
            </Caixa>
          )}

          <Caixa titulo="Peças">
            <ul className="m-0 grid list-none gap-1 p-0 text-[15px]">
              {(r.itens ?? []).map((i) => <li key={i.produtoId} className="flex justify-between gap-3"><span>{i.nome} × {i.qtd}</span><span>{formatarReais(i.totalCentavos)}</span></li>)}
            </ul>
            <dl className="m-0 border-t border-linha pt-2 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="m-0">{formatarReais(r.subtotalCentavos)}</dd></div>
              {(r.descontos ?? []).map((d, i) => <div key={i} className="flex justify-between text-verde-escuro"><dt>{d.rotulo ?? d.tipo}</dt><dd className="m-0">− {formatarReais(d.valorCentavos)}</dd></div>)}
              {r.cupom && <div className="flex justify-between"><dt>Cupom</dt><dd className="m-0">{r.cupom}</dd></div>}
              <div className="flex justify-between font-bold"><dt>Total</dt><dd className="m-0">{formatarReais(r.totalCentavos)}</dd></div>
            </dl>
          </Caixa>

          <Caixa titulo="Pagamentos">
            {r.pagamentos.length === 0 ? <p className="m-0 text-sm text-tinta-suave">Nenhuma cobrança criada.</p> : (
              <ul className="m-0 grid list-none gap-1 p-0 text-sm">
                {r.pagamentos.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2">
                    <span>{p.finalidade === "FRETE" ? "Frete" : "Produtos"} · {p.forma === "PIX" ? "PIX" : "Cartão"} · {dataHora(p.criadoEm)}</span>
                    <span><b>{STATUS_PAGAMENTO[p.status] ?? p.status}</b> · {formatarReais(p.valorCentavos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Caixa>
        </div>

        <div className="grid gap-4">
          <Caixa titulo="Cliente">
            <p className="m-0 text-[15px]"><b>{r.nome}</b></p>
            <a href={linkWhatsApp(r.telefone, `Oi, ${r.nome.split(" ")[0]}! Sobre a reserva #${r.numero}`)} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline decoration-rosa decoration-2 underline-offset-2">
              <MessageCircle aria-hidden="true" className="size-4" /> {telefone(r.telefone)}
            </a>
            <p className="m-0 text-sm text-tinta-suave">
              {r.cliente.reservas} {r.cliente.reservas === 1 ? "reserva" : "reservas"} · {r.cliente.expiracoes30Dias} expiradas em 30 dias
              {r.cliente.bloqueado ? " · telefone bloqueado" : ""}
            </p>
          </Caixa>
          <Caixa titulo="Prazos">
            <dl className="m-0 grid gap-1 text-sm">
              <div className="flex justify-between gap-3"><dt>Criada</dt><dd className="m-0">{dataHora(r.criadaEm)}</dd></div>
              {r.status === "RESERVADO" && <div className="flex justify-between gap-3"><dt>Pagar até</dt><dd className="m-0">{dataHora(r.expiraEm)}</dd></div>}
              {r.pagaEm && <div className="flex justify-between gap-3"><dt>Paga</dt><dd className="m-0">{dataHora(r.pagaEm)}</dd></div>}
              {r.expiradaEm && <div className="flex justify-between gap-3"><dt>Expirada</dt><dd className="m-0">{dataHora(r.expiradaEm)}{r.motivoEncerramento ? ` (${MOTIVO_ENCERRAMENTO[r.motivoEncerramento] ?? r.motivoEncerramento})` : ""}</dd></div>}
              {r.entrega && <div className="flex justify-between gap-3"><dt>Entrega pretendida</dt><dd className="m-0">{MODALIDADE[r.entrega]}</dd></div>}
            </dl>
          </Caixa>
          <Caixa titulo="Linha do tempo">
            <ol className="m-0 grid list-none gap-2 p-0 text-sm">
              {[...r.transicoes].reverse().map((t, i) => (
                <li key={i} className="border-l-2 border-rosa pl-3">
                  <b>{t.para ? STATUS_RESERVA[t.para] ?? t.para : t.evento}</b> · {dataHora(t.em)}
                  <span className="block text-tinta-suave">{t.atorNome ?? (t.ator === "CLIENTE" ? "Cliente" : t.ator === "SISTEMA" ? "Sistema" : t.ator)}{t.motivo ? ` · ${t.motivo}` : ""}</span>
                </li>
              ))}
            </ol>
            {r.cancelamentos.filter((c) => c.status !== "PENDENTE").map((c) => (
              <p key={c.id} className="m-0 text-sm text-tinta-suave">
                Cancelamento {c.status === "APROVADA" ? "aprovado" : c.status === "RECUSADA" ? "recusado" : "sem efeito"}{c.decididoPor ? ` por ${c.decididoPor}` : ""}{c.motivoDecisao ? `: ${c.motivoDecisao}` : ""}.
              </p>
            ))}
          </Caixa>
        </div>
      </div>
    </Casca>
  );
}
