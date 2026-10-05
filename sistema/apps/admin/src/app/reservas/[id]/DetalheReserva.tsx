"use client";

import Link from "next/link";
import { useState } from "react";
import { ROTULO_FORMA, formatarReais, linkWhatsApp, textoDaFila, type FormaPagamento } from "@tshirtclub/domain";
import { chamarApi, dataHora, telefone } from "@/lib/api";
import { urlFoto } from "@/lib/catalogo";
import { MODALIDADE, MOTIVO_ENCERRAMENTO, STATUS_PAGAMENTO, STATUS_RESERVA, SUBSTATUS } from "@/lib/rotulos";
import { AcoesEntrega, DecisaoCancelamento, FormFrete } from "../../_painel/acoes";
import { Casca, Icone } from "../../_painel/Casca";
import { CamposEndereco, lerEndereco, linhasDoEndereco, type Endereco } from "../../_painel/Endereco";
import { Aviso, Botao, Campo, Carregando, Escolha, Selo, tomDoStatus } from "../../_painel/ui";
import { useDados } from "../../_painel/useDados";
import { useEnvio } from "../../_painel/useEnvio";
import { pedirConversa } from "../../whatsapp/_wa/abrirConversa";
import { MOTIVO, NAO_REENVIA, STATUS_CHAMADO, STATUS_ENVIO, nomeDoModelo, tomDoEnvio, type Chamado, type StatusEnvio } from "../../whatsapp/_wa/rotulos";
import { TextoWhatsApp } from "../../whatsapp/_wa/TextoWhatsApp";

// Detalhe da reserva v2 (0580, pedido da loja: "analise esse cartão de reserva"), como a tela do
// pedido nos grandes sistemas (Shopify, Nuvemshop, Bling): um status só, nas etapas do topo; o
// próximo passo com um botão; as peças com foto e o preço cheio riscado; a cliente com atalhos
// para a conversa e as outras compras; e uma linha do tempo com tudo: etapas, pagamento, entrega,
// frete, as mensagens de WhatsApp (com o texto e "Tentar de novo") e os chamados.

interface Mensagem {
  id: string; modelo: string; params: Record<string, unknown>; status: StatusEnvio; tentativas: number;
  criadaEm: string; enviadaEm?: string; entregueEm?: string; erro?: string; proximaTentativa?: string; naoReenvia?: string;
}
interface Detalhe {
  id: string; numero: number; status: string; motivoEncerramento?: string | null; nome: string; telefone: string; entrega?: string; canal?: string;
  subtotalCentavos: number; descontoCentavos: number; totalCentavos: number; cupom?: string | null;
  criadaEm: string; expiraEm: string; pagaEm?: string | null; expiradaEm?: string | null; entregueEm?: string | null; entreguePor?: string | null;
  itens?: {
    produtoId: string; varianteId?: string; nome: string; tamanho?: string; rotuloTamanho?: string; qtd: number;
    precoTabelaCentavos?: number; totalCentavos: number; capa?: { caminho: string; alt?: string | null } | null;
  }[];
  descontos?: { tipo: string; valorCentavos: number; rotulo: string | null }[];
  logistica?: {
    modalidade?: string; substatus?: string; confirmadaEm?: string; endereco?: Endereco; codigoRetirada?: string; rastreio?: string;
    frete?: { valorCentavos: number; prazoDias?: number; observacao?: string; pagarAte?: string; status?: string; pagoEm?: string };
  } | null;
  pagamentos: { id: string; finalidade: string; forma: string; status: string; valorCentavos: number; criadoEm: string; aprovadoEm?: string; idProvedor?: string; provedor?: string }[];
  cancelamentos: { id: string; status: string; observacao?: string; solicitadoEm: string; decididoEm?: string; motivoDecisao?: string; decididoPor?: string }[];
  transicoes: { evento: string; para?: string; ator: string; atorNome?: string; motivo?: string; em: string }[];
  auditoria?: { id: number; em: string; ator: string; atorNome?: string; acao: string; dados?: Record<string, unknown> }[];
  mensagens?: Mensagem[];
  cliente: {
    bloqueado: boolean; reservas: number; expiracoes30Dias: number; compras?: number; comprasCentavos?: number; chat?: string | null;
    outras?: { id: string; numero: number; status: string; totalCentavos: number; criadaEm: string }[];
    chamados?: Chamado[];
  };
  /** Reserva do painel pelo link (0620): o endereço que a loja guardou até a cliente pagar. */
  enderecoPrevio?: Endereco | null;
  /** Reserva manual pelo painel (0470): forma da venda já paga, quem cadastrou e o motivo do desconto. */
  forma?: FormaPagamento | null;
  manual?: { criadaPor?: string; motivoDesconto?: string } | null;
}

const CAMISETA = <path d="m8 4 4 2 4-2 5 3-3 5-2-1v9H8v-9l-2 1-3-5Z" />;
const FRETE_PENDENTE = new Set(["AGUARDANDO_MODALIDADE", "AGUARDANDO_CALCULO_FRETE", "AGUARDANDO_PAGAMENTO_FRETE", "FRETE_VENCIDO"]);
const A_CAMINHO = new Set(["PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO"]);
const AUTOR: Record<string, string> = { CLIENTE: "Cliente", SISTEMA: "Sistema", PROVEDOR: "Mercado Pago", ADMIN: "Equipe" };
const quem = (ator: string, nome?: string | null) => nome ?? AUTOR[ator] ?? ator;
const PRONTA: Record<string, string> = { RETIRADA: "Pronta para retirada", MOTOBOY: "Saiu para entrega", ENVIO: "Enviada" };

// ─── Etapas ────────────────────────────────────────────────────────────────────────────

interface Etapa { rotulo: string; em?: string | null }

/** As etapas da reserva e a alcançada (as anteriores estão feitas). */
function etapas(r: Detalhe): { lista: Etapa[]; atual: number; encerrada: boolean } {
  const log = r.logistica;
  const sub = log?.substatus ?? "";
  if (r.status === "EXPIRADO") {
    const cancelada = r.motivoEncerramento === "CANCELADA_PELA_LOJA" || r.motivoEncerramento === "CANCELAMENTO_APROVADO";
    const lista: Etapa[] = [{ rotulo: "Reservada", em: r.criadaEm }, ...(r.pagaEm ? [{ rotulo: "Paga", em: r.pagaEm }] : []),
      { rotulo: cancelada ? "Cancelada" : "Expirada", em: r.expiradaEm }];
    return { lista, atual: lista.length - 1, encerrada: true };
  }
  const audit = (substatus: string) => r.auditoria?.find((a) => a.acao === "entrega.substatus" && a.dados?.substatus === substatus)?.em;
  const combinada = log?.confirmadaEm ?? log?.frete?.pagoEm;
  const lista: Etapa[] = [
    { rotulo: "Reservada", em: r.criadaEm },
    { rotulo: "Paga", em: r.pagaEm },
    { rotulo: "Entrega combinada", em: FRETE_PENDENTE.has(sub) ? null : combinada },
    { rotulo: "Em preparação", em: FRETE_PENDENTE.has(sub) ? null : combinada },
    { rotulo: PRONTA[log?.modalidade ?? ""] ?? "Pronta", em: audit("PRONTO_PARA_RETIRADA") ?? audit("SAIU_PARA_ENTREGA") ?? audit("ENVIADO") },
    { rotulo: "Entregue", em: r.entregueEm },
  ];
  const atual = r.status === "ENTREGUE" ? 5
    : r.status !== "PAGAMENTO_CONFIRMADO" ? 0
    : A_CAMINHO.has(sub) ? 4 : sub === "EM_PREPARACAO" ? 3 : 1;
  return { lista, atual, encerrada: false };
}

function Etapas({ r }: { r: Detalhe }) {
  const { lista, atual, encerrada } = etapas(r);
  return (
    <section className="etapas-caixa" aria-label="Etapas da reserva">
      <ol className="etapas">
        {lista.map((e, i) => {
          const classe = i < atual ? "feita" : i === atual ? (encerrada ? "encerrada" : "atual") : "";
          return (
            <li key={e.rotulo} className={`etapa ${classe}`} aria-current={i === atual ? "step" : undefined}>
              <span className="etapa-marca" aria-hidden="true">{encerrada && i === atual ? "✕" : i <= atual ? "✓" : i + 1}</span>
              <span className="etapa-texto">
                <b>{e.rotulo}</b>
                {i <= atual && e.em ? <small>{dataHora(e.em)}</small> : i === atual + 1 && !encerrada ? <small>próxima etapa</small> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ─── Próximo passo ─────────────────────────────────────────────────────────────────────

function proximoPasso(modalidade: string | undefined, sub: string | undefined): string {
  switch (sub) {
    case "AGUARDANDO_MODALIDADE": return "A cliente ainda vai escolher a entrega";
    case "AGUARDANDO_CALCULO_FRETE": return "Calcular e enviar o frete";
    case "AGUARDANDO_PAGAMENTO_FRETE": return "Esperando a cliente pagar o frete";
    case "FRETE_VENCIDO": return "O prazo do frete venceu";
    case "EM_PREPARACAO":
      return modalidade === "RETIRADA" ? "Separar as peças e avisar que está pronta"
        : modalidade === "MOTOBOY" ? "Separar as peças e mandar pelo motoboy" : "Separar, enviar e informar o rastreio";
    case "PRONTO_PARA_RETIRADA": return "Esperando a cliente retirar";
    case "SAIU_PARA_ENTREGA": return "A caminho da cliente";
    case "ENVIADO": return "Enviado: confirme quando chegar";
    default: return "Entrega";
  }
}

function ProximoPasso({ r, atualizar }: { r: Detalhe; atualizar: () => void }) {
  const log = r.logistica;
  const pago = r.status === "PAGAMENTO_CONFIRMADO";
  if (r.status === "RESERVADO") {
    return (
      <Aviso tipo="yellow" tag="AGUARDANDO PAGAMENTO" titulo={`A cliente tem até ${dataHora(r.expiraEm)} para pagar`}>
        <p>Depois disso a reserva expira e as peças voltam para a vitrine.{r.entrega ? ` Entrega pretendida: ${MODALIDADE[r.entrega] ?? r.entrega}.` : ""}</p>
      </Aviso>
    );
  }
  if (!log || !(pago || r.status === "ENTREGUE")) return null;
  const e = log.endereco;
  return (
    <Aviso tipo="green" tag={pago ? "PRÓXIMO PASSO" : "ENTREGA"}
      titulo={pago ? proximoPasso(log.modalidade, log.substatus) : `Entregue${r.entregueEm ? ` em ${dataHora(r.entregueEm)}` : ""}${r.entreguePor ? ` por ${r.entreguePor}` : ""}`}>
      <p>
        <b>{MODALIDADE[log.modalidade ?? ""] ?? "Entrega ainda não escolhida"}</b>
        {log.codigoRetirada && <> · Código de retirada: <b className="pop codigo-retirada">{log.codigoRetirada}</b></>}
      </p>
      {e && <p>{linhasDoEndereco(e).join(" · ")}</p>}
      {log.rastreio && <p>Rastreio: <b className="selecionavel">{log.rastreio}</b></p>}
      {log.frete && (
        <p>
          Frete {formatarReais(log.frete.valorCentavos)}
          {log.frete.prazoDias !== undefined ? ` · ${log.frete.prazoDias} ${log.frete.prazoDias === 1 ? "dia útil" : "dias úteis"}` : ""}
          {log.frete.pagoEm ? ` · pago em ${dataHora(log.frete.pagoEm)}` : log.frete.pagarAte ? ` · pagar até ${dataHora(log.frete.pagarAte)}` : ""}
        </p>
      )}
      {pago && log.substatus === "FRETE_VENCIDO" && <p>Combine com a cliente e envie um valor novo.</p>}
      {pago && (log.substatus === "AGUARDANDO_CALCULO_FRETE" || log.substatus === "FRETE_VENCIDO") && <FormFrete reservaId={r.id} aoSalvar={atualizar} />}
      {pago && <AcoesEntrega reservaId={r.id} modalidade={log.modalidade} substatus={log.substatus} aoMudar={atualizar} />}
    </Aviso>
  );
}

// ─── Peças, valores e pagamentos ───────────────────────────────────────────────────────

function Pecas({ r }: { r: Detalhe }) {
  const frete = r.logistica?.frete;
  return (
    <article className="card r-pecas" aria-labelledby="pecas-titulo">
      <h2 id="pecas-titulo">Peças</h2>
      <ul className="pieces">
        {(r.itens ?? []).map((i, n) => {
          const cheio = (i.precoTabelaCentavos ?? 0) * i.qtd;
          return (
            <li className="piece" key={`${i.produtoId}-${i.varianteId ?? n}`}>
              <div className={`piece-img fundo-${n % 3}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- foto do catálogo no Storage, já em WebP */}
                {i.capa ? <img src={urlFoto(i.capa.caminho)} alt="" loading="lazy" /> : <Icone>{CAMISETA}</Icone>}
              </div>
              <div><b>{i.nome}{i.qtd > 1 ? ` × ${i.qtd}` : ""}</b><small>{i.rotuloTamanho ? `Tamanho ${i.rotuloTamanho}` : "Tamanho único"}{i.qtd === 1 ? " · 1 peça" : ""}</small></div>
              <span className="piece-valor">
                {cheio > i.totalCentavos && <s><span className="sr-only">De </span>{formatarReais(cheio)}</s>}
                <b className="piece-price">{cheio > i.totalCentavos && <span className="sr-only">por </span>}{formatarReais(i.totalCentavos)}</b>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="kv mt">
        <div className="kv-row"><span>Subtotal</span><b>{formatarReais(r.subtotalCentavos)}</b></div>
        {(r.descontos ?? []).map((d, n) => (
          <div key={n} className="kv-row discount">
            <span>{d.rotulo ?? d.tipo}{d.tipo === "MANUAL" && r.manual?.motivoDesconto ? <small className="kv-nota">Motivo: {r.manual.motivoDesconto}</small> : null}</span>
            <b>− {formatarReais(d.valorCentavos)}</b>
          </div>
        ))}
        {r.cupom && <div className="kv-row"><span>Cupom</span><b>{r.cupom}</b></div>}
        <div className="kv-row"><span>Total das peças</span><b className="price-total">{formatarReais(r.totalCentavos)}</b></div>
        {frete && <div className="kv-row"><span>Frete, cobrado à parte</span><b>{formatarReais(frete.valorCentavos)}{frete.pagoEm ? " · pago" : ""}</b></div>}
        {r.forma && <div className="kv-row"><span>Forma de pagamento</span><b>{ROTULO_FORMA[r.forma] ?? r.forma}</b></div>}
      </div>
    </article>
  );
}

function Pagamentos({ r }: { r: Detalhe }) {
  return (
    <article className="card r-pag" aria-labelledby="pagamentos-titulo">
      <h2 id="pagamentos-titulo">Pagamentos</h2>
      {r.pagamentos.length === 0 ? <p className="muted">{r.forma ? "Venda registrada no painel, sem cobrança pelo site." : "Nenhuma cobrança criada."}</p> : (
        <ul className="list">
          {r.pagamentos.map((p) => (
            <li className="alert-row" key={p.id}>
              <div className="copy">
                <div className={`alert-icon ${p.status === "APROVADO" ? "fundo-verde" : "fundo-limao"}`}>
                  <Icone><path d="M4 7a3 3 0 0 1 3-3h10v4h3v10H6a2 2 0 0 1-2-2Z" /><path d="M16 12h4" /></Icone>
                </div>
                <div>
                  <b>{p.finalidade === "FRETE" ? "Frete" : "Peças"} · {p.forma === "PIX" ? "PIX" : "Cartão"} · {formatarReais(p.valorCentavos)}</b>
                  <p>
                    {p.aprovadoEm ? `Aprovado em ${dataHora(p.aprovadoEm)}` : `Criado em ${dataHora(p.criadoEm)}`}
                    {p.idProvedor && <> · {p.provedor === "mercadopago" || !p.provedor ? "Mercado Pago" : p.provedor} nº <span className="selecionavel">{p.idProvedor}</span></>}
                  </p>
                </div>
              </div>
              <Selo tom={p.status === "APROVADO" ? "paid" : ["RECUSADO", "CANCELADO", "FALHOU", "ESTORNADO"].includes(p.status) ? "expired" : "reserved"}>
                {STATUS_PAGAMENTO[p.status] ?? p.status}
              </Selo>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ─── Cliente ───────────────────────────────────────────────────────────────────────────

function Cliente({ r }: { r: Detalhe }) {
  const c = r.cliente;
  const primeiro = r.nome.split(" ")[0];
  return (
    <article className="card" aria-labelledby="cliente-titulo">
      <h2 id="cliente-titulo">Cliente</h2>
      <p className="cli-nome">{r.nome}</p>
      <p className="muted cli-tel">{telefone(r.telefone)}{c.bloqueado ? " · telefone bloqueado" : ""}</p>
      <div className="actions cli-acoes">
        {c.chat && <Link className="btn btn-ghost" href="/whatsapp" onClick={() => pedirConversa(c.chat!)}>Ver conversa</Link>}
        <a className="btn btn-ghost" href={linkWhatsApp(r.telefone, `Oi, ${primeiro}! Sobre a reserva #${r.numero}`)} target="_blank" rel="noopener noreferrer">
          Abrir no WhatsApp<span className="sr-only"> (abre em outra aba)</span>
        </a>
      </div>
      <dl className="cli-numeros">
        <div><dt>Compras</dt><dd>{c.compras ?? 0}</dd></div>
        <div><dt>Já comprou</dt><dd>{formatarReais(c.comprasCentavos ?? 0)}</dd></div>
        <div><dt>Expiradas em 30 dias</dt><dd>{c.expiracoes30Dias}</dd></div>
      </dl>
      {(c.outras?.length ?? 0) > 0 && (
        <>
          <h3 className="cli-sub">Outras reservas</h3>
          <ul className="cli-lista">
            {c.outras!.map((o) => (
              <li key={o.id}>
                <Link href={`/reservas/${o.id}`}>#{o.numero}</Link>
                <span>{STATUS_RESERVA[o.status] ?? o.status} · {formatarReais(o.totalCentavos)} · {dataHora(o.criadaEm)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(c.chamados?.length ?? 0) > 0 && (
        <>
          <h3 className="cli-sub">Chamados</h3>
          <ul className="cli-lista">
            {c.chamados!.map((ch) => (
              <li key={ch.numero}>
                <b>#{ch.numero}</b>
                <span>{MOTIVO[ch.motivo]} · {STATUS_CHAMADO[ch.status]}{ch.nota ? ` · nota ${ch.nota}` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

// ─── Entrega (0590): o endereço completo, copiar e editar ─────────────────────────────

const A_CAMINHO_OU_FORA = new Set(["SAIU_PARA_ENTREGA", "ENVIADO"]);

function Entrega({ r, atualizar }: { r: Detalhe; atualizar: () => void }) {
  const log = r.logistica;
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [modo, setModo] = useState(log?.modalidade ?? r.entrega ?? "RETIRADA");
  const { ocupado, erro, setErro, enviar } = useEnvio<Detalhe>(() => { setEditando(false); atualizar(); });
  const pago = r.status === "PAGAMENTO_CONFIRMADO";
  const pode = pago && !!log && !A_CAMINHO_OU_FORA.has(log.substatus ?? "");
  const e = log?.endereco;
  const precisaEndereco = !!log && log.modalidade !== "RETIRADA" && !e;

  function salvar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (modo === "RETIRADA") return void enviar(chamarApi<Detalhe>(`v1/admin/reservations/${r.id}/fulfillment`, { modalidade: "RETIRADA" }, "PUT"));
    const lido = lerEndereco(new FormData(ev.currentTarget));
    if ("erro" in lido) return setErro(lido.erro);
    void enviar(chamarApi<Detalhe>(`v1/admin/reservations/${r.id}/fulfillment`, { modalidade: modo, endereco: lido.endereco }, "PUT"));
  }
  async function copiar() {
    if (!e) return;
    try { await navigator.clipboard.writeText(`${r.nome}\n${linhasDoEndereco(e).join("\n")}`); setCopiado(true); } catch { setCopiado(false); }
  }

  return (
    <article className="card" aria-labelledby="entrega-titulo">
      <h2 id="entrega-titulo">Entrega</h2>
      {r.status === "RESERVADO" && r.enderecoPrevio ? (
        <>
          <p className="ent-modo"><b>{MODALIDADE[r.entrega ?? ""] ?? "A escolher"}</b> · quando ela pagar, a entrega fica combinada neste endereço</p>
          <address className="ent-endereco">
            <span>{r.nome}</span>
            {linhasDoEndereco(r.enderecoPrevio).map((l) => <span key={l}>{l}</span>)}
          </address>
        </>
      ) : r.status === "RESERVADO" ? (
        <p className="muted">{MODALIDADE[r.entrega ?? ""] ?? "A escolher"}. A entrega e o endereço são combinados depois do pagamento.</p>
      ) : !log ? (
        <p className="muted">Sem entrega: a reserva foi encerrada antes do pagamento.</p>
      ) : (
        <>
          <p className="ent-modo"><b>{MODALIDADE[log.modalidade ?? ""] ?? "A escolher"}</b>
            {log.modalidade === "RETIRADA" && " · a cliente mostra o código de retirada na loja"}</p>
          {e ? (
            <address className="ent-endereco">
              <span>{r.nome}</span>
              {linhasDoEndereco(e).map((l) => <span key={l}>{l}</span>)}
            </address>
          ) : log.modalidade !== "RETIRADA" && (
            <p className="ent-falta">{log.substatus === "AGUARDANDO_MODALIDADE" ? "A cliente ainda não informou o endereço no site." : "Sem endereço."}{pode ? " Se ela passou pelo WhatsApp, preencha aqui." : ""}</p>
          )}
          {log.rastreio && <p className="muted">Rastreio: <b className="selecionavel">{log.rastreio}</b></p>}
          {!editando && (
            <div className="actions mt">
              {e && <Botao variante="ghost" onClick={() => void copiar()}>Copiar endereço</Botao>}
              {pode && <Botao variante={precisaEndereco ? "dark" : "ghost"} onClick={() => { setModo(log.modalidade ?? "RETIRADA"); setEditando(true); setCopiado(false); }}>
                {precisaEndereco ? "Informar endereço" : "Mudar entrega"}
              </Botao>}
            </div>
          )}
          {copiado && <p role="status" className="field-help">Endereço copiado, com o nome da cliente.</p>}
          {editando && (
            <form className="mt" onSubmit={salvar} noValidate aria-label="Mudar a entrega">
              <Escolha rotulo="Modalidade" value={modo} onChange={(ev) => setModo(ev.target.value)}
                opcoes={[["RETIRADA", "Retirada na loja"], ["MOTOBOY", "Motoboy"], ["ENVIO", "Envio"]]}
                ajuda="Trocar a modalidade vale até o frete ser pago; corrigir o endereço, até o pedido sair. A cliente recebe a confirmação no WhatsApp." />
              {modo !== "RETIRADA" && <CamposEndereco key={modo} inicial={e} />}
              {erro && <p className="field-error" role="alert">{erro}</p>}
              <div className="actions mt">
                <Botao type="submit" carregando={ocupado}>Salvar entrega</Botao>
                <Botao variante="link" onClick={() => { setEditando(false); setErro(null); }}>Voltar</Botao>
              </div>
            </form>
          )}
        </>
      )}
    </article>
  );
}

// ─── Cancelar pela loja (0590) ─────────────────────────────────────────────────────────

interface Previa {
  pode: boolean; bloqueio?: "ENCERRADA" | "CONTESTACAO" | "FRETE_EM_PAGAMENTO"; pago: boolean; pecas: number;
  estornar: { id: string; finalidade: string; forma: string; valorCentavos: number }[]; devolverPorForaCentavos?: number;
}
const BLOQUEIO: Record<string, string> = {
  ENCERRADA: "Esta reserva já foi entregue ou encerrada.",
  CONTESTACAO: "Há uma contestação aberta neste pedido. Resolva em Contestações antes de cancelar.",
  FRETE_EM_PAGAMENTO: "Há um PIX do frete em aberto. Espere ele ser pago ou vencer (até 30 minutos) e tente de novo.",
};

function CancelarReserva({ r, aoFechar, aoCancelar }: { r: Detalhe; aoFechar: () => void; aoCancelar: () => void }) {
  const { dados: previa, erro: erroPrevia } = useDados<Previa>(`v1/admin/reservations/${r.id}/cancel`);
  const { ocupado, erro, setErro, enviar } = useEnvio<Detalhe>(aoCancelar);
  const oque = r.status === "PAGAMENTO_CONFIRMADO" ? "o pedido" : "a reserva";

  function confirmar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const motivo = String(new FormData(ev.currentTarget).get("motivo") ?? "").trim();
    if (motivo.length < 3) return setErro("Escreva o motivo do cancelamento: ele fica na auditoria.");
    void enviar(chamarApi<Detalhe>(`v1/admin/reservations/${r.id}/cancel`, { motivo }));
  }

  return (
    <section className="notice cancelar-caixa" aria-labelledby="cancelar-titulo">
      <span className="club-tag"><span className="dot" />CANCELAR</span>
      <h2 id="cancelar-titulo">Cancelar {oque} #{r.numero}?</h2>
      {!previa ? <Carregando erro={erroPrevia} /> : previa.bloqueio ? (
        <>
          <p>{BLOQUEIO[previa.bloqueio]}</p>
          <div className="actions mt"><Botao variante="ghost" onClick={aoFechar}>Voltar</Botao></div>
        </>
      ) : (
        <form onSubmit={confirmar} noValidate>
          <ul className="cancelar-efeitos">
            <li>{previa.pecas === 1 ? "A peça volta" : `As ${previa.pecas} peças voltam`} para o estoque e para a vitrine.</li>
            {previa.estornar.map((p) => (
              <li key={p.id}>Estorno de <b>{formatarReais(p.valorCentavos)}</b> ({p.finalidade === "FRETE" ? "frete" : "peças"}, {p.forma === "CARTAO" ? "cartão" : "PIX"}) pelo Mercado Pago, na hora.</li>
            ))}
            {previa.devolverPorForaCentavos !== undefined && (
              <li>Esta venda foi paga fora do site: devolva <b>{formatarReais(previa.devolverPorForaCentavos)}</b> à cliente por fora. O faturamento desconta hoje.</li>
            )}
            <li>A cliente recebe o aviso no WhatsApp{previa.pago ? ", com o que acontece com o dinheiro" : ""}.</li>
          </ul>
          <Campo name="motivo" rotulo="Motivo do cancelamento" maxLength={500} autoComplete="off" ajuda="Fica na auditoria; a cliente não vê." erro={erro ?? undefined} />
          <div className="actions mt">
            <Botao type="submit" variante="danger" carregando={ocupado}>{previa.estornar.length ? "Cancelar e estornar" : `Cancelar ${oque}`}</Botao>
            <Botao variante="link" onClick={aoFechar}>Voltar</Botao>
          </div>
        </form>
      )}
    </section>
  );
}

// ─── Linha do tempo ────────────────────────────────────────────────────────────────────

interface Evento { em: string; chave: string; titulo: string; quem?: string; tom?: "whats" | "falhou" | "chamado" | "muted"; mensagem?: Mensagem }

const TRANSICAO: Record<string, string> = {
  RESERVADO: "Reserva criada", PAGAMENTO_CONFIRMADO: "Pagamento aprovado", ENTREGUE: "Pedido entregue", EXPIRADO: "Reserva encerrada",
};

function eventos(r: Detalhe): Evento[] {
  const lista: Evento[] = [];
  for (const [n, t] of r.transicoes.entries()) {
    const titulo = t.para === "EXPIRADO" && r.motivoEncerramento
      ? `Reserva encerrada por ${MOTIVO_ENCERRAMENTO[r.motivoEncerramento] ?? r.motivoEncerramento}`
      : t.para ? TRANSICAO[t.para] ?? STATUS_RESERVA[t.para] ?? t.para : t.evento;
    lista.push({ em: t.em, chave: `t${n}`, titulo, quem: [quem(t.ator, t.atorNome), t.motivo].filter(Boolean).join(" · ") });
  }
  let escolha = false;
  for (const a of r.auditoria ?? []) {
    const d = a.dados ?? {};
    const titulo = a.acao === "entrega.confirmada" ? `Entrega escolhida: ${MODALIDADE[String(d.modalidade)] ?? d.modalidade}`
      : a.acao === "entrega.substatus" ? `${SUBSTATUS[String(d.substatus)] ?? d.substatus}`
      : a.acao === "frete.calculado" ? `Frete calculado: ${formatarReais(Number(d.valor_cents))}${d.prazo_dias !== undefined && d.prazo_dias !== null ? `, ${d.prazo_dias} ${d.prazo_dias === 1 ? "dia útil" : "dias úteis"}` : ""}`
      : a.acao === "frete.pago" ? `Frete pago: ${formatarReais(Number(d.valor_cents))}`
      : a.acao === "frete.vencido" ? "O prazo para pagar o frete venceu"
      : a.acao === "entrega.endereco" ? "Endereço de entrega corrigido"
      : a.acao === "pagamento.estornado" ? (d.valor_cents ? `Estorno no Mercado Pago: ${formatarReais(Number(d.valor_cents))}` : "Pagamento estornado")
      : null;
    if (a.acao === "entrega.confirmada") escolha = true;
    if (titulo) lista.push({ em: a.em, chave: `a${a.id}`, titulo, quem: quem(a.ator, a.atorNome) });
  }
  // Venda do painel com retirada (0530): a entrega é combinada sozinha, no pagamento
  if (!escolha && r.logistica?.confirmadaEm) {
    lista.push({ em: r.logistica.confirmadaEm, chave: "combinada", titulo: `Entrega combinada: ${MODALIDADE[r.logistica.modalidade ?? ""] ?? "a escolher"}`, quem: "Sistema" });
  }
  for (const c of r.cancelamentos) {
    lista.push({ em: c.solicitadoEm, chave: `cs${c.id}`, titulo: "Cancelamento pedido", quem: c.observacao ? `Cliente · “${c.observacao}”` : "Cliente" });
    if (c.decididoEm && c.status !== "PENDENTE") {
      lista.push({ em: c.decididoEm, chave: `cd${c.id}`, titulo: `Cancelamento ${c.status === "APROVADA" ? "aprovado" : c.status === "RECUSADA" ? "recusado" : "sem efeito"}`,
        quem: [c.decididoPor ?? "Equipe", c.motivoDecisao].filter(Boolean).join(" · ") });
    }
  }
  for (const m of r.mensagens ?? []) {
    lista.push({ em: m.enviadaEm ?? m.criadaEm, chave: `m${m.id}`, titulo: `WhatsApp: ${nomeDoModelo(m.modelo)}`, tom: m.status === "FALHOU" ? "falhou" : "whats", mensagem: m });
  }
  for (const ch of r.cliente.chamados ?? []) {
    lista.push({ em: ch.abertoEm, chave: `ca${ch.numero}`, titulo: `Chamado #${ch.numero} aberto`, quem: MOTIVO[ch.motivo], tom: "chamado" });
    if (ch.resolvidoEm) {
      lista.push({ em: ch.resolvidoEm, chave: `cf${ch.numero}`, titulo: `Chamado #${ch.numero} finalizado`, quem: [ch.resolvidoPor, ch.nota ? `nota ${ch.nota}` : null].filter(Boolean).join(" · ") || undefined, tom: "chamado" });
    }
  }
  return lista.sort((x, y) => x.em.localeCompare(y.em));
}

function MensagemNaLinha({ m, aoVoltar }: { m: Mensagem; aoVoltar: () => void }) {
  const [resultado, setResultado] = useState<string | null>(null);
  const tentar = useEnvio<{ ok: boolean; motivo?: string }>((r) => {
    if (r.ok) { setResultado("De volta na fila. Ela sai no próximo envio."); aoVoltar(); }
    else setResultado(NAO_REENVIA[r.motivo ?? ""] ?? "Ela já não pode voltar para a fila.");
  });
  const texto = textoDaFila(m.modelo, m.params, m.id);
  const incerto = m.erro?.includes("EnvioIncerto");
  return (
    <>
      <span className="evento-linha">
        {dataHora(m.enviadaEm ?? m.criadaEm)} · <Selo tom={tomDoEnvio(m.status)}>{STATUS_ENVIO[m.status]}</Selo>
      </span>
      {m.status === "FALHOU" && (
        <div className="wa-envio-falha">
          <p>
            {incerto ? "A ferramenta do WhatsApp não respondeu a tempo: a mensagem pode ter saído. Confira no celular da loja antes de tentar de novo."
              : `Falhou${m.tentativas > 1 ? ` depois de ${m.tentativas} tentativas` : ""}${m.erro ? `: ${m.erro}` : "."}`}
          </p>
          {m.naoReenvia
            ? <p className="muted">{NAO_REENVIA[m.naoReenvia] ?? ""}</p>
            : !resultado && <Botao variante="ghost" carregando={tentar.ocupado} onClick={() => void tentar.enviar(chamarApi(`v1/admin/whatsapp/envios/${m.id}/reenviar`, {}))}>
                Tentar de novo<span className="sr-only">: {nomeDoModelo(m.modelo)}</span>
              </Botao>}
          {resultado && <p role="status" className="field-help">{resultado}</p>}
          {tentar.erro && <p className="field-error" role="alert">{tentar.erro}</p>}
        </div>
      )}
      {m.status === "PENDENTE" && m.proximaTentativa && m.tentativas > 0 && (
        <span className="evento-linha">Tentativa {m.tentativas + 1} a partir de {dataHora(m.proximaTentativa)}.</span>
      )}
      <details className="wa-previa">
        <summary>Ver o texto<span className="sr-only">: {nomeDoModelo(m.modelo)}</span></summary>
        {texto ? <div className="bolha loja"><TextoWhatsApp texto={texto} /></div> : <p className="muted">Texto indisponível.</p>}
      </details>
    </>
  );
}

function LinhaDoTempo({ r, atualizar }: { r: Detalhe; atualizar: () => void }) {
  const lista = eventos(r);
  const sub = r.logistica?.substatus;
  return (
    <article className="card r-linha" aria-labelledby="linha-titulo">
      <h2 id="linha-titulo">Linha do tempo</h2>
      <p className="field-help">Tudo o que aconteceu com a reserva, inclusive as mensagens que a cliente recebeu no WhatsApp.</p>
      <ol className="timeline mt">
        {lista.map((e) => (
          <li className="event" key={e.chave}>
            <span className={`event-dot${e.tom ? ` ${e.tom}` : ""}`} aria-hidden="true" />
            <div className="evento-corpo">
              <b>{e.titulo}</b>
              {e.mensagem
                ? <MensagemNaLinha m={e.mensagem} aoVoltar={atualizar} />
                : <span className="evento-linha">{dataHora(e.em)}{e.quem ? ` · ${e.quem}` : ""}</span>}
            </div>
          </li>
        ))}
        {r.status === "RESERVADO" && (
          <li className="event"><span className="event-dot muted" aria-hidden="true" /><div className="evento-corpo"><b>Aguardando o pagamento</b><span className="evento-linha">Até {dataHora(r.expiraEm)}.</span></div></li>
        )}
        {r.status === "PAGAMENTO_CONFIRMADO" && sub && (
          <li className="event"><span className="event-dot muted" aria-hidden="true" /><div className="evento-corpo"><b>Agora: {proximoPasso(r.logistica?.modalidade, sub)}</b><span className="evento-linha">{SUBSTATUS[sub] ?? sub}.</span></div></li>
        )}
      </ol>
    </article>
  );
}

// ─── Tela ──────────────────────────────────────────────────────────────────────────────

export function DetalheReserva({ id }: { id: string }) {
  const { dados: r, erro, recarregar } = useDados<Detalhe>(`v1/admin/reservations/${id}`);
  const atualizar = () => void recarregar();
  const [cancelando, setCancelando] = useState(false);
  const [cancelada, setCancelada] = useState(false);

  if (!r) return <Casca kicker="RESERVAS" titulo="Reserva" compacto><Carregando erro={erro} /></Casca>;

  const pendente = r.cancelamentos.find((c) => c.status === "PENDENTE");
  const sub = [r.nome, formatarReais(r.totalCentavos), r.canal === "PAINEL" ? `venda pelo painel${r.manual?.criadaPor ? `, por ${r.manual.criadaPor}` : ""}` : "pelo site"].join(" · ");

  return (
    <Casca
      kicker="RESERVAS"
      compacto
      topo={`Reserva #${r.numero}`}
      titulo={<>Reserva <em className={`titulo-num ${tomDoStatus(r.status)}`}>#{r.numero}</em></>}
      sub={sub}
      acoes={<>
        <Link className="btn btn-ghost" href="/reservas">← Todas as reservas</Link>
        {(r.status === "RESERVADO" || r.status === "PAGAMENTO_CONFIRMADO") && !cancelando && (
          <Botao variante="danger" onClick={() => { setCancelando(true); setCancelada(false); }}>
            Cancelar {r.status === "PAGAMENTO_CONFIRMADO" ? "pedido" : "reserva"}
          </Botao>
        )}
      </>}
    >
      {erro && <div className="mb"><Aviso tipo="error" titulo={erro} /></div>}
      <Etapas r={r} />
      <p role="status" className={cancelada && r.status === "EXPIRADO" ? "notice green mb" : "sr-only"}>
        {cancelada && r.status === "EXPIRADO" ? "Cancelamento feito. A cliente recebe o aviso no WhatsApp." : ""}
      </p>
      {cancelando && <CancelarReserva r={r} aoFechar={() => setCancelando(false)} aoCancelar={() => { setCancelando(false); setCancelada(true); atualizar(); }} />}

      {pendente && (
        <Aviso tag="AÇÃO PENDENTE" titulo="Pedido de cancelamento">
          <p>Pedido em {dataHora(pendente.solicitadoEm)}{pendente.observacao ? `: “${pendente.observacao}”` : ", sem motivo."}</p>
          <p>O prazo da reserva continua correndo enquanto a loja decide.</p>
          <DecisaoCancelamento pedidoId={pendente.id} aoDecidir={atualizar} />
        </Aviso>
      )}
      <ProximoPasso r={r} atualizar={atualizar} />

      {/* No computador, a cliente fica ao lado; no celular, antes da linha do tempo */}
      <div className="reserva-corpo">
        <Pecas r={r} />
        <Pagamentos r={r} />
        <aside className="reserva-lado grid" aria-label="Entrega e cliente">
          <Entrega r={r} atualizar={atualizar} />
          <Cliente r={r} />
        </aside>
        <LinhaDoTempo r={r} atualizar={atualizar} />
      </div>
    </Casca>
  );
}
