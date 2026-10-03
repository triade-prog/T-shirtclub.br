"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { textoDaFila, type FiltroEnvio } from "@tshirtclub/domain";
import { chamarApi, dataHora, telefone } from "@/lib/api";
import { Abas, Botao, Campo, Carregando, Marcar, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { useRepetir } from "../_painel/useRepetir";
import { CascaWhatsapp, useWhatsapp, type ConfigWhatsapp } from "./_wa/CascaWhatsapp";
import { NAO_REENVIA, STATUS_ENVIO, nomeDoModelo, tomDoEnvio, type StatusEnvio } from "./_wa/rotulos";
import { TextoWhatsApp } from "./_wa/TextoWhatsApp";

// Envios (0570): o histórico da fila, como nos sistemas de disparo. Cada mensagem com o status
// (na fila, enviada, entregue, lida, falhou, não enviada), o texto que saiu, o motivo da falha e
// "Tentar de novo" na que pode voltar. Em cima, os envios dos últimos 7 dias; embaixo, o ritmo.

interface Mensagem {
  id: string; telefone: string; modelo: string; params: Record<string, unknown>; status: StatusEnvio; tentativas: number;
  criadaEm: string; enviadaEm: string | null; entregueEm: string | null; proximaTentativa: string | null; erro: string | null;
  nome: string | null; reserva: { id: string; numero: number } | null; naoReenvia: string | null;
}
interface Historico { mensagens: Mensagem[]; dias: { dia: string; enviadas: number; falhas: number; descartadas: number }[] }

type Filtro = "TODAS" | FiltroEnvio;
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "TODAS", texto: "Todas" }, { valor: "FILA", texto: "Na fila" }, { valor: "ENVIADA", texto: "Enviadas" },
  { valor: "FALHOU", texto: "Falharam" }, { valor: "DESCARTADA", texto: "Não enviadas" },
];
const ehFiltro = (s: string | null): s is Filtro => FILTROS.some((f) => f.valor === s);

export function Envios() {
  return (
    <CascaWhatsapp sub="Tudo o que a fila mandou, o que espera para sair e o que falhou.">
      <Historico />
      <FormRitmo />
    </CascaWhatsapp>
  );
}

function Historico() {
  const inicial = useSearchParams().get("status");
  const [filtro, setFiltro] = useState<Filtro>(ehFiltro(inicial) ? inicial : "TODAS");
  const [dias, setDias] = useState<"1" | "7" | "30">("7");
  const [busca, setBusca] = useState("");
  // A confirmação fica acima da lista: a mensagem que volta para a fila sai do filtro "Falharam"
  const [aviso, setAviso] = useState<string | null>(null);
  const { recarregarConfig } = useWhatsapp();
  const caminho = `v1/admin/whatsapp/envios?dias=${dias}${filtro === "TODAS" ? "" : `&status=${filtro}`}`;
  const { dados, erro, recarregar } = useDados<Historico>(caminho);
  useRepetir(() => void recarregar(), 30_000, true);

  const b = busca.trim().toLowerCase();
  const digitos = b.replace(/\D/g, "");
  const lista = (dados?.mensagens ?? []).filter((m) => !b || (m.nome ?? "").toLowerCase().includes(b) || nomeDoModelo(m.modelo).toLowerCase().includes(b)
    || (digitos.length >= 3 && m.telefone.includes(digitos)) || (m.reserva && `#${m.reserva.numero}`.includes(b)));

  return (
    <>
      {dados && <GraficoSemana dias={dados.dias} />}
      <section className="card" aria-labelledby="historico-titulo">
        <h2 id="historico-titulo">Histórico da fila</h2>
        <div className="wa-envios-filtros">
          <Abas rotulo="Filtrar por situação" valor={filtro} aoMudar={setFiltro} opcoes={FILTROS} />
          <Abas rotulo="Período" valor={dias} aoMudar={setDias} opcoes={[{ valor: "1", texto: "Hoje" }, { valor: "7", texto: "7 dias" }, { valor: "30", texto: "30 dias" }]} />
          <label className="board-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <span className="sr-only">Buscar mensagem</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, telefone, mensagem ou #reserva" />
          </label>
        </div>
        {aviso && <p className="notice green wa-aviso" role="status">{aviso}</p>}
        {!dados ? <Carregando erro={erro} /> : lista.length === 0
          ? <p className="empty-slot">Nenhuma mensagem {filtro === "TODAS" ? "" : `“${FILTROS.find((f) => f.valor === filtro)!.texto.toLowerCase()}” `}neste período.</p>
          : (
            <ul className="wa-envios" aria-label="Mensagens da fila">
              {lista.map((m) => <ItemEnvio key={m.id} m={m} aoVoltar={(texto) => { setAviso(texto); void recarregar(); recarregarConfig(); }} />)}
            </ul>
          )}
        {dados && dados.mensagens.length >= 300 && <p className="field-help">Mostrando as 300 mais recentes. Use os filtros para achar as outras.</p>}
      </section>
    </>
  );
}

function ItemEnvio({ m, aoVoltar }: { m: Mensagem; aoVoltar: (texto: string) => void }) {
  const [resultado, setResultado] = useState<string | null>(null);
  const tentar = useEnvio<{ ok: boolean; motivo?: string }>((r) => {
    if (r.ok) aoVoltar(`${nomeDoModelo(m.modelo)} para ${m.nome ?? telefone(m.telefone)}: de volta na fila. Ela sai no próximo envio.`);
    else setResultado(NAO_REENVIA[r.motivo ?? ""] ?? "Ela já não pode voltar para a fila.");
  });
  const texto = textoDaFila(m.modelo, m.params, m.id);
  const incerto = m.erro?.includes("EnvioIncerto");
  const quando = m.enviadaEm ?? m.criadaEm;
  return (
    <li className={`wa-envio${m.status === "FALHOU" ? " falhou" : ""}`}>
      <div className="wa-envio-topo">
        <div>
          <b>{nomeDoModelo(m.modelo)}</b>
          {m.reserva && <> · <Link className="btn-link" href={`/reservas/${m.reserva.id}`}>#{m.reserva.numero}</Link></>}
          <p className="muted">Para {m.nome ? `${m.nome} · ` : ""}{telefone(m.telefone)} · {dataHora(quando)}</p>
        </div>
        <Selo tom={tomDoEnvio(m.status)}>{STATUS_ENVIO[m.status]}</Selo>
      </div>
      {m.status === "FALHOU" && (
        <div className="wa-envio-falha">
          <p>
            {incerto ? "A ferramenta do WhatsApp não respondeu a tempo: a mensagem pode ter saído. Confira no celular da loja antes de tentar de novo."
              : `Falhou${m.tentativas > 1 ? ` depois de ${m.tentativas} tentativas` : ""}${m.erro ? `: ${m.erro}` : "."}`}
          </p>
          {m.naoReenvia
            ? <p className="muted">{NAO_REENVIA[m.naoReenvia] ?? ""}</p>
            : !resultado && <Botao variante="ghost" carregando={tentar.ocupado} onClick={() => void tentar.enviar(chamarApi(`v1/admin/whatsapp/envios/${m.id}/reenviar`, {}))}>
                Tentar de novo<span className="sr-only">: {nomeDoModelo(m.modelo)} para {m.nome ?? telefone(m.telefone)}</span>
              </Botao>}
          {resultado && <p role="status" className="field-help">{resultado}</p>}
          {tentar.erro && <p className="field-error" role="alert">{tentar.erro}</p>}
        </div>
      )}
      {m.status === "PENDENTE" && m.proximaTentativa && m.tentativas > 0 && (
        <p className="muted">Tentativa {m.tentativas + 1} a partir de {dataHora(m.proximaTentativa)}.</p>
      )}
      <details className="wa-previa">
        <summary>Ver o texto<span className="sr-only">: {nomeDoModelo(m.modelo)}</span></summary>
        {texto ? <div className="bolha loja"><TextoWhatsApp texto={texto} /></div> : <p className="muted">Texto indisponível.</p>}
      </details>
    </li>
  );
}

// Envios por dia (uma série só: as enviadas; as falhas em texto, sem segunda escala). Tabela
// para leitor de tela; a dica de cada barra mostra o número exato.
function GraficoSemana({ dias }: { dias: Historico["dias"] }) {
  const maximo = Math.max(1, ...dias.map((d) => d.enviadas));
  const dia = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", timeZone: "UTC" }).replace(".", "");
  return (
    <section className="card" aria-labelledby="semana-titulo">
      <h2 id="semana-titulo">Enviadas por dia</h2>
      <div className="wa-barras" aria-hidden="true">
        {dias.map((d) => (
          <div key={d.dia} className="wa-barra" title={`${dia(d.dia)}: ${d.enviadas} enviadas, ${d.falhas} com falha, ${d.descartadas} não enviadas`}>
            <span className="wa-barra-valor">{d.enviadas}</span>
            <span className="wa-barra-trilho"><span className={`wa-barra-fill h${Math.round((d.enviadas / maximo) * 20) * 5}`} /></span>
            <span className="wa-barra-dia">{dia(d.dia)}</span>
            <span className={`wa-barra-falhas${d.falhas ? " tem" : ""}`}>{d.falhas ? `${d.falhas} ${d.falhas === 1 ? "falha" : "falhas"}` : "–"}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Mensagens por dia nos últimos 7 dias</caption>
        <thead><tr><th scope="col">Dia</th><th scope="col">Enviadas</th><th scope="col">Com falha</th><th scope="col">Não enviadas</th></tr></thead>
        <tbody>{dias.map((d) => <tr key={d.dia}><th scope="row">{dia(d.dia)}</th><td>{d.enviadas}</td><td>{d.falhas}</td><td>{d.descartadas}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

const numero = (f: FormData, nome: string) => Number(String(f.get(nome) ?? "").trim());

function FormRitmo() {
  const { config, recarregarConfig } = useWhatsapp();
  const { ocupado, erro, setErro, enviar } = useEnvio<ConfigWhatsapp>(recarregarConfig);
  const [lancamento, setLancamento] = useState<boolean | null>(null);
  if (!config) return null;
  const modo = lancamento ?? config.modoLancamento;
  const r = modo ? config.ritmoLancamento : config.ritmo;

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ritmo = { intervaloMinS: numero(f, "min"), intervaloMaxS: numero(f, "max"), tetoHora: numero(f, "teto") };
    if (!Number.isInteger(ritmo.intervaloMinS) || ritmo.intervaloMinS < 2 || ritmo.intervaloMinS > 59) return setErro("O intervalo mínimo vai de 2 a 59 segundos.");
    if (!Number.isInteger(ritmo.intervaloMaxS) || ritmo.intervaloMaxS <= ritmo.intervaloMinS || ritmo.intervaloMaxS > 60) return setErro("O intervalo máximo precisa ser maior que o mínimo, até 60 segundos.");
    if (!Number.isInteger(ritmo.tetoHora) || ritmo.tetoHora < 10 || ritmo.tetoHora > 1000) return setErro("O máximo por hora vai de 10 a 1000 mensagens.");
    void enviar(chamarApi<ConfigWhatsapp>("v1/admin/settings/whatsapp", { modoLancamento: modo, [modo ? "ritmoLancamento" : "ritmo"]: ritmo }, "PUT"))
      .then((ok) => { if (ok) setLancamento(null); });
  }

  return (
    <form className="card" onSubmit={salvar} noValidate key={`${modo}-${r.intervaloMinS}-${r.intervaloMaxS}-${r.tetoHora}`} aria-labelledby="ritmo-titulo">
      <h2 id="ritmo-titulo">Ritmo de envio</h2>
      <p className="field-help">
        Uma mensagem por vez, com intervalo sorteado, para parecer uso humano e proteger o número de bloqueio. Reserva, lembrete, pagamento e expiração saem
        primeiro; o código de verificação não entra na fila. Sem conexão, as mensagens esperam e saem quando ela voltar.
      </p>
      <Marcar rotulo="Modo lançamento (mais rápido, para dias de muita venda)" checked={modo} onChange={(e) => setLancamento(e.target.checked)} />
      <p className="field-help">
        {modo ? "Ligado" : "Desligado"}: {r.intervaloMinS} a {r.intervaloMaxS} s entre mensagens, até {r.tetoHora} por hora.
        {modo !== config.modoLancamento && " Salve para valer."}
      </p>
      <div className="form-grid mt">
        <Campo name="min" rotulo="Intervalo mínimo (segundos)" inputMode="numeric" maxLength={2} defaultValue={r.intervaloMinS} />
        <Campo name="max" rotulo="Intervalo máximo (segundos)" inputMode="numeric" maxLength={2} defaultValue={r.intervaloMaxS} />
        <div className="full"><Campo name="teto" rotulo="Máximo por hora" inputMode="numeric" maxLength={4} defaultValue={r.tetoHora} /></div>
      </div>
      {erro && <p className="field-error" role="alert">{erro}</p>}
      <div className="actions mt"><Botao type="submit" carregando={ocupado}>Salvar ritmo</Botao></div>
    </form>
  );
}
