"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatarReais, linkWhatsApp } from "@tshirtclub/domain";
import { dataHora, horario, telefone } from "@/lib/api";
import { MODALIDADE } from "@/lib/rotulos";
import { AcoesEntrega, FormFrete } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { linhasDoEndereco, type Endereco } from "../_painel/Endereco";
import { Carregando } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useRepetir } from "../_painel/useRepetir";

// Entregas e frete em Kanban (03/10). v2, pedido da loja ("temos que melhorar isso também"):
// sem rolar para o lado no computador, como nos quadros do Trello e do Linear: as colunas com
// pedidos dividem a largura e as vazias viram uma faixa fina com o nome e o 0. No celular, uma
// coluna embaixo da outra. No topo, o resumo (com a loja, esperando a cliente, parados, entregues)
// e o filtro "Só o que é com a loja". O cartão mostra as peças, há quanto tempo o pedido está na
// etapa (amarelo depois de 1 dia, vermelho depois de 2 nas etapas da loja), o endereço com
// "Copiar", o WhatsApp da cliente e "Ver pedido". Sem arrastar: cada etapa tem regra própria, o
// pedido anda pelo botão do cartão. ?substatus= (vindo da Operação) destaca a coluna.

interface Item {
  modalidade?: string; substatus: string; endereco?: Endereco; codigoRetirada?: string; rastreio?: string;
  frete?: { valorCentavos: number; pagarAte?: string; pagoEm?: string };
  reserva: { id: string; numero: number; status?: string; nome: string; telefone: string; totalCentavos: number; pagaEm: string; entregueEm?: string | null };
  disputaAberta?: boolean;
  desde?: string;
  pecas?: { nome: string; tamanho?: string; qtd: number }[];
}

type Coluna = "ESCOLHA" | "FRETE" | "PAGAR" | "PREPARO" | "RETIRADA" | "CAMINHO" | "ENTREGUE";
type Dono = "LOJA" | "CLIENTE" | "FIM";
const COLUNAS: { id: Coluna; dono: Dono; titulo: string; nota: string; etapas: string[] }[] = [
  { id: "ESCOLHA", dono: "CLIENTE", titulo: "Escolha da entrega", nota: "Pago, falta a cliente escolher como recebe. Se ela respondeu pelo WhatsApp, preencha na reserva.", etapas: ["AGUARDANDO_MODALIDADE"] },
  { id: "FRETE", dono: "LOJA", titulo: "Calcular o frete", nota: "Informe o valor: a cliente recebe no WhatsApp e tem 2 horas para pagar.", etapas: ["AGUARDANDO_CALCULO_FRETE", "FRETE_VENCIDO"] },
  { id: "PAGAR", dono: "CLIENTE", titulo: "Frete a pagar", nota: "Esperando a cliente pagar o frete pelo site.", etapas: ["AGUARDANDO_PAGAMENTO_FRETE"] },
  { id: "PREPARO", dono: "LOJA", titulo: "Em preparação", nota: "Separe as peças e marque o próximo passo: a cliente é avisada.", etapas: ["EM_PREPARACAO"] },
  { id: "RETIRADA", dono: "CLIENTE", titulo: "Pronto para retirada", nota: "Esperando a cliente buscar com o código.", etapas: ["PRONTO_PARA_RETIRADA"] },
  { id: "CAMINHO", dono: "LOJA", titulo: "A caminho", nota: "Com o motoboy ou enviado. Marque como entregue ao concluir.", etapas: ["SAIU_PARA_ENTREGA", "ENVIADO"] },
  { id: "ENTREGUE", dono: "FIM", titulo: "Entregue", nota: "Nos últimos 7 dias. Os mais antigos ficam na tela da reserva.", etapas: [] },
];
const DONO: Record<Dono, string> = { LOJA: "Com a loja", CLIENTE: "Com a cliente", FIM: "Concluído" };
const colunaDa = (substatus: string) => COLUNAS.find((c) => c.etapas.includes(substatus))?.id;
const foiEntregue = (f: Item) => !!f.reserva.entregueEm;
const naColuna = (f: Item, col: (typeof COLUNAS)[number]) => (col.id === "ENTREGUE" ? foiEntregue(f) : !foiEntregue(f) && col.etapas.includes(f.substatus));
const maisRecente = (a: Item, b: Item) => (b.reserva.entregueEm ?? "").localeCompare(a.reserva.entregueEm ?? "");

const HORA = 3_600_000;
/** Há quanto tempo, curto: "agora", "40 min", "5 h", "2 dias". */
function haQuanto(iso: string, agora: number): string {
  const ms = Math.max(0, agora - new Date(iso).getTime());
  if (ms < 60_000) return "agora";
  if (ms < HORA) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 24 * HORA) return `${Math.floor(ms / HORA)} h`;
  const d = Math.floor(ms / (24 * HORA));
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}
/** Parado na etapa da loja: amarelo depois de 1 dia, vermelho depois de 2. */
function tomDaEspera(f: Item, agora: number): "" | "atencao" | "atrasado" {
  if (!f.desde || foiEntregue(f) || COLUNAS.find((c) => c.etapas.includes(f.substatus))?.dono !== "LOJA") return "";
  const h = (agora - new Date(f.desde).getTime()) / HORA;
  return h >= 48 ? "atrasado" : h >= 24 ? "atencao" : "";
}

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
  // Uma busca só (todos os pedidos pagos em aberto e os entregues da semana); as colunas separam aqui.
  const { dados, erro, recarregar } = useDados<Item[]>("v1/admin/fulfillments");
  const [agora, setAgora] = useState(() => Date.now());
  useRepetir(() => { void recarregar(); setAgora(Date.now()); }, 30_000, true);
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [soLoja, setSoLoja] = useState(false);
  const [busca, setBusca] = useState("");
  const atualizar = () => void recarregar();

  // Vindo da Operação com a etapa: a coluna dela aparece na tela
  const alvo = colunaDa(etapa);
  const carregado = !!dados;
  useEffect(() => {
    if (carregado && alvo) document.getElementById(`coluna-${alvo}`)?.scrollIntoView({ block: "nearest", inline: "start" });
  }, [carregado, alvo]);

  const abertos = (dados ?? []).filter((f) => !foiEntregue(f));
  const comLoja = abertos.filter((f) => COLUNAS.find((c) => c.etapas.includes(f.substatus))?.dono === "LOJA");
  const parados = abertos.filter((f) => tomDaEspera(f, agora) !== "");
  const entregues = (dados ?? []).filter(foiEntregue).length;
  const colunas = COLUNAS.filter((c) => !soLoja || c.dono === "LOJA");

  return (
    <Casca kicker="LOGÍSTICA" compacto titulo={<>Entregas <em className="kanban-em">e frete</em></>}
      sub="Cada pedido pago numa coluna, da escolha da entrega até chegar na cliente.">
      {!dados ? <Carregando erro={erro} /> : (
        <>
          <section className="ent-resumo" aria-label="Resumo das entregas">
            <button type="button" className={`ent-kpi${soLoja ? " ativo" : ""}${comLoja.length ? " destaque" : ""}`} aria-pressed={soLoja} onClick={() => setSoLoja(!soLoja)}>
              <b>{comLoja.length}</b> com a loja<span className="ent-kpi-dica">{soLoja ? "mostrando só estes" : "ver só estes"}</span>
            </button>
            <div className="ent-kpi"><b>{abertos.length - comLoja.length}</b> esperando a cliente</div>
            <div className={`ent-kpi${parados.length ? " atrasado" : ""}`}><b>{parados.length}</b> {parados.length === 1 ? "parado" : "parados"} há mais de 1 dia</div>
            <div className="ent-kpi"><b>{entregues}</b> {entregues === 1 ? "entregue" : "entregues"} em 7 dias</div>
          </section>

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

          <div className="board-wrap" tabIndex={0} role="region" aria-label="Quadro das entregas">
            <div className="kanban entregas">
              {colunas.map((col) => {
                const todos = dados.filter((f) => naColuna(f, col));
                if (col.id === "ENTREGUE") todos.sort(maisRecente);
                const cartoes = todos.filter((f) => passa(f, filtro, busca));
                const vazia = todos.length === 0 && alvo !== col.id;
                return (
                  <section key={col.id} className={`lane${vazia ? " vazia" : ""}${alvo === col.id ? " destaque" : ""}`} data-lane={col.id} aria-labelledby={`coluna-${col.id}`}>
                    <div className="lane-head">
                      <div>
                        <div className="lane-kicker">{COLUNAS.indexOf(col) + 1} · {DONO[col.dono]}</div>
                        <h2 className="lane-title" id={`coluna-${col.id}`}>{col.titulo}</h2>
                      </div>
                      <span className="lane-count" aria-label={`${todos.length} ${todos.length === 1 ? "pedido" : "pedidos"}`}>{todos.length}</span>
                    </div>
                    {!vazia && (
                      <>
                        <p className="lane-note">{col.nota}</p>
                        <div className="cards-stack">
                          {cartoes.map((f) => <CartaoEntrega key={f.reserva.id} f={f} agora={agora} aoMudar={atualizar} />)}
                          {cartoes.length === 0 && <div className="empty-slot">{todos.length > 0 ? "Nada com este filtro." : "Nada por aqui agora."}</div>}
                        </div>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          </div>

          <details className="kanban-ajuda">
            <summary>Como funciona o quadro</summary>
            <p>Sem arrastar cartões: cada etapa tem uma regra (o frete precisa do valor, o envio do rastreio, a entrega da confirmação), então o pedido muda de coluna pelo botão do cartão e a cliente recebe o aviso no WhatsApp. O quadro se atualiza sozinho a cada 30 segundos. Colunas vazias ficam fininhas; entregue, o pedido fica 7 dias na última coluna.</p>
          </details>
        </>
      )}
    </Casca>
  );
}

function CartaoEntrega({ f, agora, aoMudar }: { f: Item; agora: number; aoMudar: () => void }) {
  const [calculando, setCalculando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const entregue = foiEntregue(f);
  const vencido = !entregue && f.substatus === "FRETE_VENCIDO";
  const calcular = f.substatus === "AGUARDANDO_CALCULO_FRETE" || vencido;
  const espera = tomDaEspera(f, agora);
  const urgente = calcular || (!entregue && !!f.disputaAberta) || espera === "atrasado";
  const id = `cartao-${f.reserva.id}`;
  const pecas = f.pecas ?? [];
  const nPecas = pecas.reduce((s, p) => s + p.qtd, 0);

  let tempo = f.desde ? `há ${haQuanto(f.desde, agora)}` : `pago ${dataHora(f.reserva.pagaEm)}`;
  if (f.substatus === "AGUARDANDO_PAGAMENTO_FRETE" && f.frete?.pagarAte) tempo = `frete até ${horario(f.frete.pagarAte)}`;
  if (vencido) tempo = f.frete?.pagarAte ? `venceu ${horario(f.frete.pagarAte)}` : "frete vencido";
  if (entregue && f.reserva.entregueEm) tempo = `entregue ${dataHora(f.reserva.entregueEm)}`;

  async function copiar() {
    if (!f.endereco) return;
    try { await navigator.clipboard.writeText(`${f.reserva.nome}\n${linhasDoEndereco(f.endereco).join("\n")}`); setCopiado(true); } catch { setCopiado(false); }
  }

  return (
    <article className={`k-card${urgente ? " urgent" : ""}${entregue ? " done" : ""}`} aria-labelledby={id}>
      <div className="k-card-head">
        <div>
          <h3 className="order-no" id={id}><Link href={`/reservas/${f.reserva.id}`}>#{f.reserva.numero}</Link></h3>
          <div className="order-name">{f.reserva.nome}</div>
        </div>
        <span className={`k-time${urgente ? " urgent" : ""}${espera ? ` ${espera}` : ""}`} title={f.desde ? `Nesta etapa desde ${dataHora(f.desde)}` : undefined}>{tempo}</span>
      </div>

      {nPecas > 0 && (
        <p className="k-pecas">
          <b>{nPecas} {nPecas === 1 ? "peça" : "peças"}:</b> {pecas.map((p) => `${p.nome}${p.tamanho && !/^Único/.test(p.tamanho) ? ` (${p.tamanho.split(" · ")[0]})` : ""}${p.qtd > 1 ? ` × ${p.qtd}` : ""}`).join(", ")}
        </p>
      )}

      <div className="k-tags">
        <span className="k-tag blue">{MODALIDADE[f.modalidade ?? ""] ?? "Sem entrega escolhida"}</span>
        {vencido && <span className="k-tag yellow">Frete vencido</span>}
        {entregue && <span className="k-tag green">Entregue</span>}
        {f.disputaAberta && <span className="k-tag pink">Contestação aberta</span>}
      </div>

      {f.disputaAberta && !entregue && <div className="k-alert">Contestação aberta: não entregue antes de resolver.</div>}

      <dl className="k-meta">
        <dt>Total</dt><dd>{formatarReais(f.reserva.totalCentavos)}</dd>
        {f.codigoRetirada && f.modalidade === "RETIRADA" && <><dt>Código de retirada</dt><dd>{f.codigoRetirada}</dd></>}
        {f.frete && <><dt>Frete</dt><dd>{formatarReais(f.frete.valorCentavos)}{f.frete.pagoEm ? " · pago" : ""}</dd></>}
        {f.rastreio && <><dt>Rastreio</dt><dd>{f.rastreio}</dd></>}
      </dl>
      {f.endereco && (
        <div className="k-endereco">
          <address>{linhasDoEndereco(f.endereco).map((l) => <span key={l}>{l}</span>)}</address>
          {!entregue && <button type="button" className="k-link" onClick={() => void copiar()}>{copiado ? "Copiado ✓" : "Copiar"}<span className="sr-only"> o endereço do pedido #{f.reserva.numero}</span></button>}
        </div>
      )}

      {calcular && (calculando
        ? <FormFrete reservaId={f.reserva.id} aoSalvar={aoMudar} />
        : <div className="k-actions"><button type="button" className="k-btn primary" onClick={() => setCalculando(true)}>{vencido ? "Mandar novo frete" : "Calcular o frete"}</button></div>)}
      {!entregue && <AcoesEntrega reservaId={f.reserva.id} modalidade={f.modalidade} substatus={f.substatus} aoMudar={aoMudar} />}

      <div className="k-rodape">
        <a className="k-link" href={linkWhatsApp(f.reserva.telefone, `Oi, ${f.reserva.nome.split(" ")[0]}! Sobre o pedido #${f.reserva.numero}`)} target="_blank" rel="noopener noreferrer">
          WhatsApp<span className="sr-only"> de {f.reserva.nome}, {telefone(f.reserva.telefone)} (abre em outra aba)</span>
        </a>
        <Link className="k-link" href={`/reservas/${f.reserva.id}`}>Ver pedido<span className="sr-only"> #{f.reserva.numero}</span></Link>
      </div>
    </article>
  );
}
