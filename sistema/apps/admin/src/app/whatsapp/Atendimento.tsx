"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatarReais, textoDaFila } from "@tshirtclub/domain";
import { chamarApi, dataHora, horario, mensagemDeErro, telefone } from "@/lib/api";
import { STATUS_RESERVA, SUBSTATUS } from "@/lib/rotulos";
import { Abas, Botao, Carregando, Selo, tomDoStatus } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { useRepetir } from "../_painel/useRepetir";
import { CascaWhatsapp, useWhatsapp } from "./_wa/CascaWhatsapp";
import { Numeros } from "./_wa/Numeros";
import {
  MOTIVO, STATUS_CHAMADO, STATUS_ENVIO, VIA, haQuanto, linkWhatsapp, nomeDoModelo, tomDaEspera, tomDoEnvio,
  type Chamado, type StatusEnvio,
} from "./_wa/rotulos";
import { TextoWhatsApp } from "./_wa/TextoWhatsApp";

// Atendimento (0570): a caixa de entrada, como nos sistemas de atendimento. À esquerda, as
// conversas (quem precisa de vocês primeiro, a espera mais longa no topo); no meio, a conversa
// inteira em balões (a cliente, a Clubinha, as mensagens automáticas, a equipe pelo celular e os
// passos do chamado); à direita, a ficha com o chamado, as reservas e os chamados anteriores.
// A resposta segue pelo celular da loja (botão "Abrir no WhatsApp"). No celular, uma coisa por vez.

interface ItemConversa {
  chat: string; telefone: string | null; nome: string | null;
  ultima: { em: string; texto: string | null; como: string | null } | null;
  equipeRespondeuEm: string | null; chamado: Chamado | null;
}
type Evento =
  | { tipo: "CLIENTE"; em: string; texto: string | null; como: string | null; resposta: { titulo: string; acao: string; texto: string | null } | null }
  | { tipo: "EQUIPE"; em: string }
  | { tipo: "ENVIO"; em: string; id: string; modelo: string; params: Record<string, unknown>; status: StatusEnvio; erro: string | null; tentativas: number }
  | { tipo: "CHAMADO"; em: string; evento: "ABERTO" | "ASSUMIDO" | "LEMBRETE" | "FINALIZADO" | "NOTA"; numero: number; motivo: Chamado["motivo"]; via: string | null; por: string | null; nota: number | null };
interface Reserva { id: string; numero: number; status: string; totalCentavos: number; criadaEm: string; expiraEm: string | null; entregueEm: string | null; substatus: string | null }
interface Conversa { chat: string; telefone: string | null; nome: string | null; bloqueado: boolean; eventos: Evento[]; reservas: Reserva[]; chamados: Chamado[] }

type Filtro = "PRECISA" | "CLUBINHA" | "TODAS";
const aberto = (c: Chamado | null) => !!c && c.status !== "RESOLVIDO";
const quem = (c: { nome: string | null; telefone: string | null; chat: string }) => c.nome ?? (c.telefone ? telefone(c.telefone) : `Conversa ${c.chat.slice(-4)}`);

export function Atendimento() {
  return (
    <CascaWhatsapp sub="As conversas com a Clubinha e os chamados para a equipe, num lugar só.">
      <CaixaDeEntrada />
      <Numeros />
    </CascaWhatsapp>
  );
}

function CaixaDeEntrada() {
  const { recarregarChamados } = useWhatsapp();
  const { dados, erro, recarregar } = useDados<ItemConversa[]>("v1/admin/whatsapp/conversas");
  useRepetir(() => void recarregar(), 30_000, true);
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [busca, setBusca] = useState("");
  const [chat, setChat] = useState<string | null>(null);
  if (!dados) return <section className="card"><Carregando erro={erro} /></section>;

  const precisam = dados.filter((c) => aberto(c.chamado));
  const atual = filtro ?? (precisam.length ? "PRECISA" : "TODAS");
  const b = busca.trim().toLowerCase();
  const digitos = b.replace(/\D/g, "");
  const lista = dados
    .filter((c) => (atual === "PRECISA" ? aberto(c.chamado) : atual === "CLUBINHA" ? !aberto(c.chamado) : true))
    .filter((c) => !b || (c.nome ?? "").toLowerCase().includes(b) || (digitos.length >= 3 && (c.telefone ?? c.chat).includes(digitos))
      || (c.chamado && `#${c.chamado.numero}` === b));
  // Quem espera há mais tempo primeiro (sem dono antes de em atendimento)
  if (atual === "PRECISA") lista.sort((x, y) => (x.chamado!.status === y.chamado!.status ? x.chamado!.abertoEm.localeCompare(y.chamado!.abertoEm) : x.chamado!.status === "ABERTO" ? -1 : 1));
  const selecionada = dados.find((c) => c.chat === chat) ?? null;
  const aoMudar = () => { void recarregar(); recarregarChamados(); };

  return (
    <section className={`inbox${chat ? " com-conversa" : ""}`} aria-label="Caixa de entrada do WhatsApp">
      <div className="inbox-lista">
        <label className="board-search inbox-busca">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <span className="sr-only">Buscar conversa</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, telefone ou #nº" />
        </label>
        <Abas rotulo="Filtrar conversas" valor={atual} aoMudar={setFiltro} opcoes={[
          { valor: "PRECISA", texto: "Precisa de vocês", n: precisam.length },
          { valor: "CLUBINHA", texto: "Com a Clubinha" },
          { valor: "TODAS", texto: "Todas" },
        ]} />
        {lista.length === 0
          ? <p className="empty-slot">{b ? "Nenhuma conversa com essa busca." : atual === "PRECISA" ? "Ninguém esperando a equipe agora. ✦" : "Nenhuma conversa nos últimos 30 dias."}</p>
          : (
            <ul className="inbox-itens" aria-label="Conversas">
              {lista.map((c) => <ItemDaLista key={c.chat} c={c} ativa={c.chat === chat} aoAbrir={() => setChat(c.chat)} />)}
            </ul>
          )}
      </div>
      {selecionada
        ? <Detalhe key={selecionada.chat} item={selecionada} aoVoltar={() => setChat(null)} aoMudar={aoMudar} />
        : <div className="inbox-vazia"><p>Escolha uma conversa para ver tudo o que a cliente escreveu e o que a Clubinha respondeu.</p></div>}
    </section>
  );
}

function ItemDaLista({ c, ativa, aoAbrir }: { c: ItemConversa; ativa: boolean; aoAbrir: () => void }) {
  const ch = c.chamado;
  const espera = ch?.status === "ABERTO" ? tomDaEspera(ch.abertoEm) : "";
  return (
    <li>
      <button type="button" className={`inbox-item${ativa ? " ativa" : ""}`} aria-current={ativa ? "true" : undefined} onClick={aoAbrir}>
        <span className="inbox-item-topo">
          <b>{quem(c)}</b>
          {ch?.status === "ABERTO" && <span className={`wa-espera ${espera}`}>{haQuanto(ch.abertoEm)}</span>}
          {ch?.status === "EM_ATENDIMENTO" && <span className="inbox-dono">{ch.assumidoPor ?? "Equipe"}</span>}
        </span>
        {ch && (
          <span className="inbox-meta">
            Chamado #{ch.numero} · {MOTIVO[ch.motivo]}
            {ch.status === "EM_ATENDIMENTO" ? " · em atendimento" : ch.status === "RESOLVIDO" ? ` · finalizado${ch.nota ? `, nota ${ch.nota}` : ""}` : ""}
          </span>
        )}
        {c.ultima && <span className="inbox-ultima">{c.ultima.texto ? `“${c.ultima.texto}”` : "Mensagem sem texto"} · {haQuanto(c.ultima.em)}</span>}
      </button>
    </li>
  );
}

function useConversa(chat: string) {
  const [dados, setDados] = useState<Conversa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    // POST: o número vai no corpo, fora do endereço e dos registros de acesso
    const r = await chamarApi<Conversa>("v1/admin/whatsapp/conversa", { chat });
    if (r.ok) { setDados(r.dados); setErro(null); } else setErro(mensagemDeErro(r.codigo, r.detalhes));
  }, [chat]);
  useEffect(() => { void (async () => { await recarregar(); })(); }, [recarregar]);
  useRepetir(() => void recarregar(), 30_000, true);
  return { dados, erro, recarregar };
}

function Detalhe({ item, aoVoltar, aoMudar }: { item: ItemConversa; aoVoltar: () => void; aoMudar: () => void }) {
  const { dados, erro, recarregar } = useConversa(item.chat);
  const titulo = useRef<HTMLHeadingElement>(null);
  const bolhas = useRef<HTMLOListElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);
  const n = dados?.eventos.length ?? 0;
  // A conversa abre na mensagem mais recente (só a caixa da conversa rola, não a página)
  useEffect(() => { const el = bolhas.current; if (n && el) el.scrollTop = el.scrollHeight; }, [n]);
  const mudou = () => { void recarregar(); aoMudar(); };
  const nome = quem(item);
  const tel = dados?.telefone ?? item.telefone;

  return (
    <>
      <div className="inbox-conversa">
        <div className="inbox-cabeca">
          <button type="button" className="btn-link inbox-voltar" onClick={aoVoltar}>← Conversas</button>
          <h2 ref={titulo} tabIndex={-1}>{nome}</h2>
          {tel && <span className="muted">{telefone(tel)}</span>}
        </div>
        {!dados ? <Carregando erro={erro} /> : (
          <ol ref={bolhas} className="bolhas" aria-label={`Conversa com ${nome}`} tabIndex={0}>
            {dados.eventos.map((e, i) => {
              const dia = new Date(e.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
              const anterior = i > 0 ? new Date(dados.eventos[i - 1]!.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
              return (
                <li key={i} className="bolha-linha">
                  {dia !== anterior && <span className="bolha-dia">{rotuloDoDia(e.em)}</span>}
                  <EventoNaConversa e={e} abriuChamado={abriuChamado(e, dados.eventos)} />
                </li>
              );
            })}
            {dados.eventos.length === 0 && <li className="bolha-sistema">Sem mensagens nos últimos 90 dias.</li>}
          </ol>
        )}
        <div className="inbox-responder">
          <p>Para responder, use o celular da loja. Depois, assuma ou finalize o chamado na ficha.</p>
          {tel && <a className="btn btn-dark" href={linkWhatsapp(tel)} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp<span className="sr-only"> (abre em outra aba)</span></a>}
        </div>
      </div>
      {dados && <Ficha c={dados} aoMudar={mudou} />}
    </>
  );
}

function rotuloDoDia(iso: string): string {
  const fuso = { timeZone: "America/Sao_Paulo" } as const;
  const d = new Date(iso).toLocaleDateString("pt-BR", fuso);
  const hoje = new Date().toLocaleDateString("pt-BR", fuso);
  const ontem = new Date(Date.now() - 86_400_000).toLocaleDateString("pt-BR", fuso);
  return d === hoje ? "Hoje" : d === ontem ? "Ontem" : d.slice(0, 5);
}

// O que a Clubinha fez com a mensagem (o texto da resposta só existe na resposta rápida)
const CLUBINHA: Record<string, string> = {
  BOAS_VINDAS: "Mandou as boas-vindas com o menu", MENU: "Mostrou o menu", MINHA_RESERVA: "Mandou as reservas deste número",
  OFERTAS: "Mandou as promoções e os cupons", TROCAS: "Mandou a política de trocas e chamou a equipe", CODIGO_ENVIADO: "Mandou o código de verificação",
  CHAMADO: "Disse que a equipe já responde e chamou vocês", AVALIACAO: "Agradeceu a nota", EQUIPE: "Chamou a equipe",
  NUMERO_DIFERENTE: "Não mandou o código: o pedido era de outro número", REFERENCIA_INVALIDA: "Não mandou o código: referência errada",
  BLOQUEADO: "Não mandou o código: muitas tentativas", AGUARDE: "Pediu para esperar o código anterior", SEM_NUMERO: "Não conseguiu ver o número de quem escreveu",
  FALHA_ENVIO: "Tentou responder, mas o envio falhou",
};

// A Clubinha só responde a mensagem que abriu o chamado; as seguintes entram no mesmo chamado.
function abriuChamado(e: Evento, eventos: Evento[]): boolean {
  if (e.tipo !== "CLIENTE" || e.como !== "CHAMADO") return false;
  const t = new Date(e.em).getTime();
  return eventos.some((x) => x.tipo === "CHAMADO" && x.evento === "ABERTO" && Math.abs(new Date(x.em).getTime() - t) < 60_000);
}

function EventoNaConversa({ e, abriuChamado }: { e: Evento; abriuChamado: boolean }) {
  const hora = horario(e.em);
  if (e.tipo === "CLIENTE") {
    const fez = e.resposta && (e.como === "RESPOSTA" || e.como === "EQUIPE")
      ? (e.como === "RESPOSTA" ? `Respondeu: ${e.resposta.titulo}` : CLUBINHA.EQUIPE)
      : e.como === "CHAMADO" && !abriuChamado ? undefined : e.como ? CLUBINHA[e.como] : undefined;
    return (
      <>
        <div className="bolha cliente">
          {e.texto ? <TextoWhatsApp texto={e.texto} /> : <p className="muted">Sem texto (foto, áudio, figurinha ou mensagem com mais de 90 dias)</p>}
          <span className="bolha-meta">{hora}</span>
        </div>
        {fez && (
          <div className="bolha clubinha">
            <span className="bolha-autor">Clubinha</span>
            <p>{fez}</p>
            {e.resposta?.texto && <TextoWhatsApp texto={e.resposta.texto} className="bolha-citacao" />}
          </div>
        )}
      </>
    );
  }
  if (e.tipo === "EQUIPE") {
    return (
      <div className="bolha equipe">
        <span className="bolha-autor">Equipe</span>
        <p>Respondeu pelo celular da loja. O texto fica só no celular.</p>
        <span className="bolha-meta">{hora}</span>
      </div>
    );
  }
  if (e.tipo === "ENVIO") {
    const texto = textoDaFila(e.modelo, e.params, e.id);
    return (
      <div className={`bolha automatica${e.status === "FALHOU" ? " falhou" : ""}`}>
        <span className="bolha-autor">Mensagem automática · {nomeDoModelo(e.modelo)}</span>
        {texto ? <TextoWhatsApp texto={texto} /> : <p className="muted">Texto indisponível.</p>}
        <span className="bolha-meta">
          {hora} · <Selo tom={tomDoEnvio(e.status)}>{STATUS_ENVIO[e.status]}</Selo>
          {e.status === "FALHOU" && <> <Link className="btn-link" href="/whatsapp/envios?status=FALHOU">ver em Envios</Link></>}
        </span>
      </div>
    );
  }
  const via = e.via ? ` ${VIA[e.via] ?? ""}` : "";
  const texto = {
    ABERTO: `Chamado #${e.numero} aberto · ${MOTIVO[e.motivo]}. A equipe recebeu o aviso.`,
    ASSUMIDO: `Chamado #${e.numero} assumido${e.por ? ` por ${e.por}` : ""}${via}.`,
    LEMBRETE: "Ninguém assumiu a tempo: a Clubinha avisou a cliente que vocês já respondem e mandou o aviso de novo.",
    FINALIZADO: `Chamado #${e.numero} finalizado${e.por ? ` por ${e.por}` : ""}${via}.`,
    NOTA: `A cliente deu nota ${e.nota} de 5 ao atendimento.`,
  }[e.evento];
  return <p className="bolha-sistema">{texto} <span className="bolha-meta">{hora}</span></p>;
}

function Ficha({ c, aoMudar }: { c: Conversa; aoMudar: () => void }) {
  const atual = c.chamados.find((x) => x.status !== "RESOLVIDO") ?? null;
  const anteriores = c.chamados.filter((x) => x !== atual);
  return (
    <aside className="inbox-ficha" aria-label="Ficha da cliente">
      <h3>{c.nome ?? "Cliente sem nome"}</h3>
      {c.telefone && <p className="muted">{telefone(c.telefone)}</p>}
      {c.bloqueado && <p><Selo tom="issue">Telefone bloqueado</Selo></p>}

      <h4>Chamado</h4>
      {atual ? <ChamadoAtual ch={atual} aoMudar={aoMudar} /> : <p className="field-help">Nenhum chamado aberto. A Clubinha está cuidando da conversa.</p>}

      <h4>Reservas</h4>
      {c.reservas.length === 0 ? <p className="field-help">Nenhuma reserva deste número.</p> : (
        <ul className="ficha-lista">
          {c.reservas.map((r) => (
            <li key={r.id}>
              <Link href={`/reservas/${r.id}`}><b>#{r.numero}</b></Link> <Selo tom={tomDoStatus(r.status)}>{STATUS_RESERVA[r.status] ?? r.status}</Selo>
              <span className="muted">{formatarReais(r.totalCentavos)} · {dataHora(r.criadaEm)}{r.substatus ? ` · ${SUBSTATUS[r.substatus] ?? r.substatus}` : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {anteriores.length > 0 && (
        <>
          <h4>Chamados anteriores</h4>
          <ul className="ficha-lista">
            {anteriores.map((x) => (
              <li key={x.numero}>
                <b>#{x.numero}</b> {MOTIVO[x.motivo]}
                <span className="muted">{x.resolvidoEm ? `finalizado ${dataHora(x.resolvidoEm)}` : `aberto ${dataHora(x.abertoEm)}`}{x.nota ? ` · nota ${x.nota} de 5` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function ChamadoAtual({ ch, aoMudar }: { ch: Chamado; aoMudar: () => void }) {
  const acao = useEnvio(aoMudar);
  const caminho = (o: "assumir" | "finalizar") => `v1/admin/whatsapp/chamados/${ch.numero}/${o}`;
  return (
    <div className="ficha-chamado">
      <p><b>#{ch.numero}</b> {MOTIVO[ch.motivo]} <Selo tom={ch.status === "ABERTO" ? "issue" : "reserved"}>{STATUS_CHAMADO[ch.status]}</Selo></p>
      <p className="muted">
        Aberto há {haQuanto(ch.abertoEm)}
        {ch.assumidoEm ? ` · assumido${ch.assumidoPor ? ` por ${ch.assumidoPor}` : ""} ${VIA[ch.assumidoVia ?? ""] ?? ""}` : ""}
      </p>
      <div className="actions">
        {ch.status === "ABERTO" && (
          <Botao variante="ghost" carregando={acao.ocupado} onClick={() => void acao.enviar(chamarApi(caminho("assumir"), {}))}>
            Assumir<span className="sr-only"> o chamado #{ch.numero}</span>
          </Botao>
        )}
        <Botao carregando={acao.ocupado} onClick={() => void acao.enviar(chamarApi(caminho("finalizar"), {}))}>
          Finalizar<span className="sr-only"> o chamado #{ch.numero}</span>
        </Botao>
      </div>
      <p className="field-help">Ao finalizar, a Clubinha agradece e pede uma nota de 1 a 5.</p>
      {acao.erro && <p className="field-error" role="alert">{acao.erro}</p>}
    </div>
  );
}
