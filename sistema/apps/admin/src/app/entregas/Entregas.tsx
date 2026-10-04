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

// Entregas e frete em Kanban (03/10). v3, pedido da loja ("quero que use o mesmo formato do Kanban
// do dia"): o mesmo quadro da Operação, com 5 colunas do mesmo tamanho e as mesmas cores (Etapa 01,
// Prioridade, Etapa 02, Etapa 03, Final), o resumo em pílulas, a busca com os filtros e a nota do
// rodapé. Etapa 01 é o que espera a cliente (escolher a entrega ou pagar o frete); Prioridade é o
// frete a calcular (ou vencido); Etapa 02, a preparação; Etapa 03, a retirada e o que está a
// caminho; Final, os entregues da semana. O cartão mostra as peças, o próximo passo, há quanto
// tempo o pedido está na etapa (amarelo depois de 1 dia, vermelho depois de 2 nas etapas da loja),
// o endereço com "Copiar", o WhatsApp da cliente e "Ver pedido". Sem arrastar: cada etapa tem
// regra própria, o pedido anda pelo botão do cartão. ?substatus= (vindo da Operação) destaca a coluna.

interface Item {
  modalidade?: string; substatus: string; endereco?: Endereco; codigoRetirada?: string; rastreio?: string;
  frete?: { valorCentavos: number; pagarAte?: string; pagoEm?: string };
  reserva: { id: string; numero: number; status?: string; nome: string; telefone: string; totalCentavos: number; pagaEm: string; entregueEm?: string | null };
  disputaAberta?: boolean;
  desde?: string;
  pecas?: { nome: string; tamanho?: string; qtd: number }[];
}

// Os ids são os da Operação: as colunas ganham as mesmas cores (data-lane)
type Coluna = "AGUARDANDO" | "ACAO" | "PAGO" | "ENTREGA" | "CONCLUIDO";
const COLUNAS: { id: Coluna; kicker: string; titulo: string; nota: string; etapas: string[] }[] = [
  { id: "AGUARDANDO", kicker: "Etapa 01", titulo: "Com a cliente", nota: "Falta a cliente escolher a entrega ou pagar o frete. Se ela respondeu pelo WhatsApp, preencha na reserva.", etapas: ["AGUARDANDO_MODALIDADE", "AGUARDANDO_PAGAMENTO_FRETE"] },
  { id: "ACAO", kicker: "Prioridade", titulo: "Calcular o frete", nota: "Informe o valor: a cliente recebe no WhatsApp e tem 2 horas para pagar.", etapas: ["AGUARDANDO_CALCULO_FRETE", "FRETE_VENCIDO"] },
  { id: "PAGO", kicker: "Etapa 02", titulo: "Em preparação", nota: "Separe as peças e marque o próximo passo: a cliente é avisada.", etapas: ["EM_PREPARACAO"] },
  { id: "ENTREGA", kicker: "Etapa 03", titulo: "Retirada e a caminho", nota: "Esperando a retirada, com o motoboy ou enviado. Marque como entregue ao concluir.", etapas: ["PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO"] },
  { id: "CONCLUIDO", kicker: "Final", titulo: "Entregues", nota: "Nos últimos 7 dias. Os mais antigos ficam na tela da reserva.", etapas: [] },
];
/** Quem dá o próximo passo em cada etapa. */
const COM_A_CLIENTE = ["AGUARDANDO_MODALIDADE", "AGUARDANDO_PAGAMENTO_FRETE", "PRONTO_PARA_RETIRADA"];
/** O próximo passo, em palavras da loja (como na Operação). */
const PASSO: Record<string, string> = {
  AGUARDANDO_MODALIDADE: "Cliente escolher a entrega",
  AGUARDANDO_CALCULO_FRETE: "Calcular o frete",
  FRETE_VENCIDO: "Mandar novo frete",
  AGUARDANDO_PAGAMENTO_FRETE: "Cliente pagar o frete",
  EM_PREPARACAO: "Preparar o pedido",
  PRONTO_PARA_RETIRADA: "Cliente buscar",
  SAIU_PARA_ENTREGA: "Confirmar a entrega",
  ENVIADO: "Confirmar a entrega",
};
const colunaDa = (substatus: string) => COLUNAS.find((c) => c.etapas.includes(substatus))?.id;
const foiEntregue = (f: Item) => !!f.reserva.entregueEm;
const comALoja = (f: Item) => !foiEntregue(f) && !COM_A_CLIENTE.includes(f.substatus);
const naColuna = (f: Item, col: (typeof COLUNAS)[number]) => (col.id === "CONCLUIDO" ? foiEntregue(f) : !foiEntregue(f) && col.etapas.includes(f.substatus));
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
  if (!f.desde || !comALoja(f)) return "";
  const h = (agora - new Date(f.desde).getTime()) / HORA;
  return h >= 48 ? "atrasado" : h >= 24 ? "atencao" : "";
}

type Filtro = "TODAS" | "LOJA" | "RETIRADA" | "MOTOBOY" | "ENVIO";
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "TODAS", texto: "Todas" }, { id: "LOJA", texto: "Com a loja" }, { id: "RETIRADA", texto: "Retirada" }, { id: "MOTOBOY", texto: "Motoboy" }, { id: "ENVIO", texto: "Envio" },
];

const soDigitos = (s: string) => s.replace(/\D/g, "");
function passa(f: Item, filtro: Filtro, busca: string): boolean {
  if (filtro === "LOJA" && !comALoja(f)) return false;
  if (filtro !== "TODAS" && filtro !== "LOJA" && f.modalidade !== filtro) return false;
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
  const [busca, setBusca] = useState("");
  const atualizar = () => void recarregar();

  // Vindo da Operação com a etapa: a coluna dela aparece na tela
  const alvo = colunaDa(etapa);
  const carregado = !!dados;
  useEffect(() => {
    if (carregado && alvo) document.getElementById(`coluna-${alvo}`)?.scrollIntoView({ block: "nearest", inline: "start" });
  }, [carregado, alvo]);

  const abertos = (dados ?? []).filter((f) => !foiEntregue(f));
  const comLoja = abertos.filter(comALoja).length;
  const parados = abertos.filter((f) => tomDaEspera(f, agora) !== "").length;
  const entregues = (dados ?? []).filter(foiEntregue).length;

  return (
    <Casca kicker="LOGÍSTICA" titulo={<>Entregas <em className="kanban-em">e frete.</em></>}
      sub="Cada pedido pago pelo próximo passo, da escolha da entrega até chegar na cliente. O botão de cada cartão leva o pedido para a próxima etapa.">
      {!dados ? <Carregando erro={erro} /> : (
        <>
          <section className="quick-summary" aria-label="Resumo das entregas">
            <span className="qs"><span className="qs-dot yellow" /><b>{comLoja}</b> com a loja</span>
            <span className="qs"><span className="qs-dot" /><b>{abertos.length - comLoja}</b> esperando a cliente</span>
            <span className="qs"><span className="qs-dot blue" /><b>{parados}</b> {parados === 1 ? "parado" : "parados"} há mais de 1 dia</span>
            <span className="qs"><span className="qs-dot green" /><b>{entregues}</b> {entregues === 1 ? "entregue" : "entregues"} em 7 dias</span>
          </section>

          <div className="board-toolbar">
            <label className="board-search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <span className="sr-only">Buscar pedido</span>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, telefone ou #pedido" />
            </label>
            <div className="board-filters" role="group" aria-label="Filtrar cartões">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filtro === f.id}
                  className={`filter-chip${filtro === f.id ? " active" : ""}${f.id === "LOJA" ? " attention" : ""}`} onClick={() => setFiltro(f.id)}>
                  {f.texto}
                </button>
              ))}
            </div>
          </div>

          <div className="board-wrap" tabIndex={0} role="region" aria-label="Quadro das entregas: role para os lados para ver todas as colunas">
            <div className="kanban entregas">
              {COLUNAS.map((col) => {
                const todos = dados.filter((f) => naColuna(f, col));
                if (col.id === "CONCLUIDO") todos.sort(maisRecente);
                const cartoes = todos.filter((f) => passa(f, filtro, busca));
                return (
                  <section key={col.id} className={`lane${alvo === col.id ? " destaque" : ""}`} data-lane={col.id} aria-labelledby={`coluna-${col.id}`}>
                    <div className="lane-head">
                      <div><div className="lane-kicker">{col.kicker}</div><h2 className="lane-title" id={`coluna-${col.id}`}>{col.titulo}</h2></div>
                      <span className="lane-count" aria-label={`${todos.length} ${todos.length === 1 ? "pedido" : "pedidos"}`}>{todos.length}</span>
                    </div>
                    <p className="lane-note">{col.nota}</p>
                    <div className="cards-stack">
                      {cartoes.map((f) => <CartaoEntrega key={f.reserva.id} f={f} agora={agora} aoMudar={atualizar} />)}
                      {cartoes.length === 0 && <div className="empty-slot">{todos.length > 0 ? "Nada com este filtro." : "Nada por aqui agora."}</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="kanban-footnote">
            <span className="star-mark" aria-hidden="true">✦</span>
            <p><strong>Kanban das entregas, sem arrastar cartões.</strong> Cada etapa tem uma regra (o frete precisa do valor, o envio do rastreio, a entrega da confirmação): o pedido muda de coluna pelo botão do cartão, a cliente recebe o aviso no WhatsApp e o quadro se atualiza sozinho a cada 30 segundos. Entregue, o pedido fica 7 dias na última coluna.</p>
          </div>
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
          <div className="order-name">{f.reserva.nome}{nPecas ? ` · ${nPecas} ${nPecas === 1 ? "peça" : "peças"}` : ""}</div>
        </div>
        <span className={`k-time${urgente ? " urgent" : ""}${espera ? ` ${espera}` : ""}`} title={f.desde ? `Nesta etapa desde ${dataHora(f.desde)}` : undefined}>{tempo}</span>
      </div>

      {nPecas > 0 && (
        <p className="k-pecas">
          {pecas.map((p) => `${p.nome}${p.tamanho && !/^Único/.test(p.tamanho) ? ` (${p.tamanho.split(" · ")[0]})` : ""}${p.qtd > 1 ? ` × ${p.qtd}` : ""}`).join(", ")}
        </p>
      )}

      <div className="k-tags">
        <span className="k-tag blue">{MODALIDADE[f.modalidade ?? ""] ?? "Sem entrega escolhida"}</span>
        {vencido && <span className="k-tag yellow">Frete vencido</span>}
        {entregue ? <span className="k-tag green">Entregue</span> : <span className={`k-tag${comALoja(f) ? " yellow" : " pink"}`}>{comALoja(f) ? "Com a loja" : "Com a cliente"}</span>}
        {f.disputaAberta && <span className="k-tag pink">Contestação aberta</span>}
      </div>

      {f.disputaAberta && !entregue && <div className="k-alert">Contestação aberta: não entregue antes de resolver.</div>}

      <dl className="k-meta">
        <dt>Total</dt><dd>{formatarReais(f.reserva.totalCentavos)}</dd>
        {!entregue && PASSO[f.substatus] && <><dt>Próximo passo</dt><dd>{PASSO[f.substatus]}</dd></>}
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
