"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { dataHora, horario, telefone } from "@/lib/api";
import { MODALIDADE } from "@/lib/rotulos";
import { AcoesEntrega, FormFrete } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Carregando } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useRepetir } from "../_painel/useRepetir";

// Entregas e frete em Kanban (03/10, pedido da loja; no estilo do quadro da Operação): uma
// coluna por etapa, da escolha da entrega até o pedido a caminho. Sem arrastar: cada etapa tem
// regra própria (o frete precisa do valor, o envio do rastreio, a entrega da confirmação), então
// o pedido anda de coluna pelo botão do cartão. Busca, filtro por modalidade e atualização a
// cada 30 segundos. ?substatus= (vindo da Operação) rola até a coluna da etapa. A coluna Entregue
// (0560) mostra os pedidos entregues nos últimos 7 dias, os mais recentes primeiro.

interface Item {
  modalidade?: string; substatus: string; endereco?: Record<string, string>; codigoRetirada?: string; rastreio?: string;
  frete?: { valorCentavos: number; pagarAte?: string; pagoEm?: string };
  reserva: { id: string; numero: number; status?: string; nome: string; telefone: string; totalCentavos: number; pagaEm: string; entregueEm?: string | null };
  disputaAberta?: boolean;
}

type Coluna = "ESCOLHA" | "FRETE" | "PAGAR" | "PREPARO" | "RETIRADA" | "CAMINHO" | "ENTREGUE";
const COLUNAS: { id: Coluna; kicker: string; titulo: string; nota: string; etapas: string[] }[] = [
  { id: "ESCOLHA", kicker: "1 · Cliente", titulo: "Escolha da entrega", nota: "Pago, falta a cliente escolher no site como recebe.", etapas: ["AGUARDANDO_MODALIDADE"] },
  { id: "FRETE", kicker: "2 · Loja", titulo: "Calcular o frete", nota: "Informe o valor: a cliente recebe no WhatsApp e tem 2 horas para pagar.", etapas: ["AGUARDANDO_CALCULO_FRETE", "FRETE_VENCIDO"] },
  { id: "PAGAR", kicker: "3 · Cliente", titulo: "Frete a pagar", nota: "Esperando a cliente pagar o frete pelo site.", etapas: ["AGUARDANDO_PAGAMENTO_FRETE"] },
  { id: "PREPARO", kicker: "4 · Loja", titulo: "Em preparação", nota: "Separe as peças e marque o próximo passo: a cliente é avisada.", etapas: ["EM_PREPARACAO"] },
  { id: "RETIRADA", kicker: "5 · Retirada", titulo: "Pronto para retirada", nota: "Esperando a cliente buscar com o código.", etapas: ["PRONTO_PARA_RETIRADA"] },
  { id: "CAMINHO", kicker: "5 · Entrega", titulo: "A caminho", nota: "Com o motoboy ou enviado. Marque como entregue ao concluir.", etapas: ["SAIU_PARA_ENTREGA", "ENVIADO"] },
  { id: "ENTREGUE", kicker: "6 · Concluído", titulo: "Entregue", nota: "Entregues nos últimos 7 dias. Os mais antigos ficam na tela da reserva.", etapas: [] },
];
const colunaDa = (substatus: string) => COLUNAS.find((c) => c.etapas.includes(substatus))?.id;
const foiEntregue = (f: Item) => !!f.reserva.entregueEm;
const naColuna = (f: Item, col: (typeof COLUNAS)[number]) => (col.id === "ENTREGUE" ? foiEntregue(f) : !foiEntregue(f) && col.etapas.includes(f.substatus));
const maisRecente = (a: Item, b: Item) => (b.reserva.entregueEm ?? "").localeCompare(a.reserva.entregueEm ?? "");

type Filtro = "TODAS" | "RETIRADA" | "MOTOBOY" | "ENVIO";
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "TODAS", texto: "Todas" }, { id: "RETIRADA", texto: "Retirada" }, { id: "MOTOBOY", texto: "Motoboy" }, { id: "ENVIO", texto: "Envio" },
];

const soDigitos = (s: string) => s.replace(/\D/g, "");
function passa(f: Item, filtro: Filtro, busca: string): boolean {
  if (filtro !== "TODAS" && f.modalidade !== filtro) return false;
  const b = busca.trim().toLowerCase().replace(/^#/, "");
  if (!b) return true;
  return String(f.reserva.numero).includes(b) || f.reserva.nome.toLowerCase().includes(b)
    || (soDigitos(b).length >= 4 && soDigitos(f.reserva.telefone).includes(soDigitos(b)));
}

export function Entregas() {
  const etapa = useSearchParams().get("substatus") ?? "";
  // Uma busca só (todos os pedidos pagos em aberto); as colunas separam aqui.
  const { dados, erro, recarregar } = useDados<Item[]>("v1/admin/fulfillments");
  useRepetir(() => void recarregar(), 30_000, true);
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [busca, setBusca] = useState("");
  const atualizar = () => void recarregar();

  // Vindo da Operação com a etapa: a coluna dela aparece na tela
  const alvo = colunaDa(etapa);
  const carregado = !!dados;
  useEffect(() => {
    if (carregado && alvo) document.getElementById(`coluna-${alvo}`)?.scrollIntoView({ block: "nearest", inline: "start" });
  }, [carregado, alvo]);

  return (
    <Casca kicker="LOGÍSTICA" titulo={<>Entregas <em className="kanban-em">e frete</em></>}
      sub="Cada pedido pago numa coluna, da escolha da entrega até chegar na cliente.">
      {!dados ? <Carregando erro={erro} /> : (
        <>
          <div className="board-toolbar">
            <label className="board-search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <span className="sr-only">Buscar pedido</span>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, nome ou telefone" />
            </label>
            <div className="board-filters" role="group" aria-label="Filtrar por entrega">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filtro === f.id} className={`filter-chip${filtro === f.id ? " active" : ""}`} onClick={() => setFiltro(f.id)}>
                  {f.texto}
                </button>
              ))}
            </div>
          </div>

          <div className="board-wrap" tabIndex={0} role="region" aria-label="Quadro das entregas: role para os lados para ver todas as colunas">
            <div className="kanban entregas">
              {COLUNAS.map((col) => {
                const todos = dados.filter((f) => naColuna(f, col));
                if (col.id === "ENTREGUE") todos.sort(maisRecente);
                const cartoes = todos.filter((f) => passa(f, filtro, busca));
                return (
                  <section key={col.id} className={`lane${alvo === col.id ? " destaque" : ""}`} data-lane={col.id} aria-labelledby={`coluna-${col.id}`}>
                    <div className="lane-head">
                      <div><div className="lane-kicker">{col.kicker}</div><h2 className="lane-title" id={`coluna-${col.id}`}>{col.titulo}</h2></div>
                      <span className="lane-count" aria-label={`${todos.length} ${todos.length === 1 ? "pedido" : "pedidos"}`}>{todos.length}</span>
                    </div>
                    <p className="lane-note">{col.nota}</p>
                    <div className="cards-stack">
                      {cartoes.map((f) => <CartaoEntrega key={f.reserva.id} f={f} aoMudar={atualizar} />)}
                      {cartoes.length === 0 && <div className="empty-slot">{todos.length > 0 ? "Nada com este filtro." : "Nada por aqui agora."}</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="kanban-footnote">
            <span className="star-mark" aria-hidden="true">✦</span>
            <p><strong>Kanban das entregas, sem arrastar cartões.</strong> Cada etapa tem uma regra (o frete precisa do valor, o envio do rastreio, a entrega da confirmação): o pedido muda de coluna pelo botão do cartão, a cliente recebe o aviso no WhatsApp e o quadro se atualiza sozinho a cada 30 segundos. Entregue, o pedido vai para a última coluna e fica lá por 7 dias.</p>
          </div>
        </>
      )}
    </Casca>
  );
}

function CartaoEntrega({ f, aoMudar }: { f: Item; aoMudar: () => void }) {
  const [calculando, setCalculando] = useState(false);
  const entregue = foiEntregue(f);
  const vencido = !entregue && f.substatus === "FRETE_VENCIDO";
  const calcular = f.substatus === "AGUARDANDO_CALCULO_FRETE" || vencido;
  const urgente = calcular || (!entregue && !!f.disputaAberta);
  const id = `cartao-${f.reserva.id}`;

  let tempo = `pago ${dataHora(f.reserva.pagaEm)}`;
  if (f.substatus === "AGUARDANDO_PAGAMENTO_FRETE" && f.frete?.pagarAte) tempo = `frete até ${horario(f.frete.pagarAte)}`;
  if (vencido) tempo = f.frete?.pagarAte ? `venceu ${horario(f.frete.pagarAte)}` : "frete vencido";
  if (entregue && f.reserva.entregueEm) tempo = `entregue ${dataHora(f.reserva.entregueEm)}`;

  return (
    <article className={`k-card${urgente ? " urgent" : ""}${entregue ? " done" : ""}`} aria-labelledby={id}>
      <div className="k-card-head">
        <div>
          <h3 className="order-no" id={id}><Link href={`/reservas/${f.reserva.id}`}>#{f.reserva.numero}</Link></h3>
          <div className="order-name">{f.reserva.nome}</div>
        </div>
        <span className={`k-time${urgente ? " urgent" : ""}`}>{tempo}</span>
      </div>

      <div className="k-tags">
        <span className="k-tag blue">{MODALIDADE[f.modalidade ?? ""] ?? "Sem entrega escolhida"}</span>
        {vencido && <span className="k-tag yellow">Frete vencido</span>}
        {entregue && <span className="k-tag green">Entregue</span>}
        {f.disputaAberta && <span className="k-tag pink">Contestação aberta</span>}
      </div>

      {f.disputaAberta && !entregue && <div className="k-alert">Contestação aberta: não entregue antes de resolver.</div>}

      <dl className="k-meta">
        <dt>Total</dt><dd>{formatarReais(f.reserva.totalCentavos)}</dd>
        <dt>WhatsApp</dt><dd>{telefone(f.reserva.telefone)}</dd>
        {f.codigoRetirada && <><dt>Código de retirada</dt><dd>{f.codigoRetirada}</dd></>}
        {f.frete && <><dt>Frete</dt><dd>{formatarReais(f.frete.valorCentavos)}{f.frete.pagoEm ? " · pago" : ""}</dd></>}
        {f.rastreio && <><dt>Rastreio</dt><dd>{f.rastreio}</dd></>}
      </dl>
      {f.endereco && <p className="k-endereco">{f.endereco.rua}, {f.endereco.numero} · {f.endereco.bairro} · {f.endereco.cidade}/{f.endereco.uf}</p>}

      {calcular && (calculando
        ? <FormFrete reservaId={f.reserva.id} aoSalvar={aoMudar} />
        : <div className="k-actions"><button type="button" className="k-btn primary" onClick={() => setCalculando(true)}>{vencido ? "Mandar novo frete" : "Calcular o frete"}</button></div>)}
      {!entregue && <AcoesEntrega reservaId={f.reserva.id} modalidade={f.modalidade} substatus={f.substatus} aoMudar={aoMudar} />}
    </article>
  );
}
