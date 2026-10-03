"use client";

import { useState } from "react";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { Casca } from "../_painel/Casca";
import { FilaHoje, type FilaWhatsApp } from "../_painel/FilaHoje";
import { Aviso, Botao, Campo, Carregando, Marcar, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { useRepetir } from "../_painel/useRepetir";

// WhatsApp (tela 18 do protótipo; sem referência V4, no estilo do painel V4): conexão do
// número da loja (ferramenta no formato da Z-API: Z-API ou Wafly) com o QR code para
// reconectar, fila, ritmo, modo lançamento, notificações que a loja liga e desliga,
// mensagem de teste e os avisos da loja para o WhatsApp da equipe (0510). Tudo vai para a
// auditoria.

interface Ritmo { intervaloMinS: number; intervaloMaxS: number; tetoHora: number }
interface Config {
  conectado: boolean; modoLancamento: boolean; ritmo: Ritmo; ritmoLancamento: Ritmo;
  fila: FilaWhatsApp;
  notificacoes: { id: string; nome: string; quando: string; essencial: boolean; ligada: boolean }[];
}

export function Whatsapp() {
  const { dados: c, erro, recarregar } = useDados<Config>("v1/admin/whatsapp");
  useRepetir(() => void recarregar(), 30_000, true);
  const aoSalvar = () => void recarregar();

  return (
    <Casca kicker="MENSAGENS" titulo="WhatsApp" sub="Conexão do número da loja com o sistema, fila de envio e quais notificações a cliente recebe.">
      {!c ? <Carregando erro={erro} /> : (
        <div className="grid split">
          <div className="stack">
            <Conexao conectado={c.conectado} aoConectar={() => void recarregar()} />
            <FormRitmo config={c} aoSalvar={aoSalvar} />
            <Notificacoes config={c} aoSalvar={aoSalvar} />
          </div>
          <div className="stack">
            <FilaHoje fila={c.fila} />
            <AvisosEquipe />
            <Teste />
          </div>
        </div>
      )}
    </Casca>
  );
}

function Conexao({ conectado, aoConectar }: { conectado: boolean; aoConectar: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function buscarQr() {
    const r = await chamarApi<{ conectado: boolean; qrCode?: string }>("v1/admin/whatsapp/qr");
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    setErro(null);
    if (r.dados.conectado) { setQr(null); aoConectar(); } else setQr(r.dados.qrCode ?? null);
  }
  // A imagem do QR vale poucos segundos: enquanto o QR está na tela, ele se renova.
  useRepetir(() => void buscarQr(), 15_000, qr !== null && !conectado);

  if (conectado) {
    return (
      <Aviso tipo="green" titulo="Número conectado." tag="ONLINE">
        <p>Os códigos saem na hora e a fila envia no ritmo configurado abaixo.</p>
      </Aviso>
    );
  }
  return (
    <Aviso tipo="error" titulo="O WhatsApp da loja está desconectado.">
      <p>Sem ele, as clientes não recebem o código e os avisos esperam na fila. No celular da loja, abra o WhatsApp, vá em Aparelhos conectados e leia o QR code.</p>
      {qr ? (
        <div className="qr mt">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em data: vindo da ferramenta do WhatsApp */}
          <img src={qr} alt="QR code para conectar o WhatsApp da loja" width={200} height={200} />
          <p className="field-help">O código se renova sozinho a cada 15 segundos.</p>
        </div>
      ) : (
        <div className="actions mt"><Botao onClick={() => void buscarQr()}>Mostrar QR code</Botao></div>
      )}
      {erro && <p className="field-error" role="alert">{erro}</p>}
    </Aviso>
  );
}

function numero(f: FormData, nome: string): number {
  return Number(String(f.get(nome) ?? "").trim());
}

function FormRitmo({ config, aoSalvar }: { config: Config; aoSalvar: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio<Config>(aoSalvar);
  const [lancamento, setLancamento] = useState(config.modoLancamento);
  const r = lancamento ? config.ritmoLancamento : config.ritmo;

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ritmo = { intervaloMinS: numero(f, "min"), intervaloMaxS: numero(f, "max"), tetoHora: numero(f, "teto") };
    if (!Number.isInteger(ritmo.intervaloMinS) || ritmo.intervaloMinS < 2 || ritmo.intervaloMinS > 59) return setErro("O intervalo mínimo vai de 2 a 59 segundos.");
    if (!Number.isInteger(ritmo.intervaloMaxS) || ritmo.intervaloMaxS <= ritmo.intervaloMinS || ritmo.intervaloMaxS > 60) return setErro("O intervalo máximo precisa ser maior que o mínimo, até 60 segundos.");
    if (!Number.isInteger(ritmo.tetoHora) || ritmo.tetoHora < 10 || ritmo.tetoHora > 1000) return setErro("O máximo por hora vai de 10 a 1000 mensagens.");
    void enviar(chamarApi<Config>("v1/admin/settings/whatsapp", { modoLancamento: lancamento, [lancamento ? "ritmoLancamento" : "ritmo"]: ritmo }, "PUT"));
  }

  return (
    <form className="card" onSubmit={salvar} noValidate key={`${lancamento}`}>
      <h2>Fila de envio</h2>
      <p className="field-help">
        As mensagens saem uma por vez, com intervalo aleatório, para parecer uso humano e reduzir o risco de bloqueio do número. Reserva criada, lembrete,
        pagamento confirmado e expiração saem primeiro. O código de verificação não entra na fila: sai na hora, como resposta. Se a conexão cair, as mensagens esperam e saem quando ela voltar.
      </p>
      <Marcar rotulo="Modo lançamento" checked={lancamento} onChange={(e) => setLancamento(e.target.checked)} />
      <p className="field-help">
        {lancamento ? "Ligado" : "Desligado"}: {r.intervaloMinS} a {r.intervaloMaxS} s entre mensagens, até {r.tetoHora} por hora.
        {lancamento !== config.modoLancamento && " Salve para valer."}
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

function Notificacoes({ config, aoSalvar }: { config: Config; aoSalvar: () => void }) {
  const { ocupado, erro, enviar } = useEnvio<Config>(aoSalvar);
  return (
    <section className="card" aria-labelledby="notif-titulo">
      <h2 id="notif-titulo">Notificações para a cliente</h2>
      <p className="field-help">As essenciais ficam sempre ligadas. As outras podem ser desligadas para enviar menos mensagens.</p>
      <div className="mt">
        {config.notificacoes.map((n) => (
          <div key={n.id} className="notif">
            <div><b>{n.nome}</b><p>{n.quando}</p></div>
            {n.essencial ? <Selo tom="paid">Essencial</Selo> : (
              <Marcar rotulo={n.ligada ? "Ligada" : "Desligada"} aria-label={`Enviar “${n.nome}”`} checked={n.ligada} disabled={ocupado}
                onChange={(e) => void enviar(chamarApi<Config>("v1/admin/settings/whatsapp", { notificacoes: { [n.id]: e.target.checked } }, "PUT"))} />
            )}
          </div>
        ))}
      </div>
      {erro && <p className="field-error" role="alert">{erro}</p>}
    </section>
  );
}

interface Avisos { telefone: string | null; avisos: { id: string; nome: string; quando: string; ligado: boolean }[] }

/** +5577998887777 → (77) 99888-7777 */
function telefoneNaTela(e164: string | null): string {
  const d = (e164 ?? "").replace(/^\+55/, "");
  return /^\d{10,11}$/.test(d) ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : "";
}

// Avisos da loja (0510): o WhatsApp pessoal da equipe recebe nova reserva, pagamento aprovado,
// inscrição na lista VIP e o que pede ação. Sai pela mesma fila, depois das mensagens das clientes.
function AvisosEquipe() {
  const { dados: a, erro: erroDados, recarregar } = useDados<Avisos>("v1/admin/whatsapp/avisos");
  const [testado, setTestado] = useState(false);
  const salvar = useEnvio<Avisos>(() => void recarregar());
  const teste = useEnvio(() => setTestado(true));
  if (!a) return <section className="card"><h2>Avisos para a equipe</h2><Carregando erro={erroDados} /></section>;
  const desligados = a.avisos.filter((x) => !x.ligado).map((x) => x.id);

  function gravar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTestado(false);
    const d = String(new FormData(e.currentTarget).get("telefoneAvisos") ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (!/^\d{10,11}$/.test(d)) return salvar.setErro("Digite o número com DDD, como (77) 99815-5772.");
    void salvar.enviar(chamarApi<Avisos>("v1/admin/whatsapp/avisos", { telefone: `+55${d}` }, "PUT"));
  }

  return (
    <section className="card" aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo">Avisos para a equipe</h2>
      <p className="field-help">
        A loja manda no seu WhatsApp pessoal cada nova reserva, pagamento aprovado, inscrição na lista VIP e o que precisa de ação. Use um número
        diferente do WhatsApp da loja. Os avisos saem pela mesma fila, depois das mensagens das clientes.
      </p>
      <form className="mt" onSubmit={gravar} noValidate key={a.telefone ?? "sem"}>
        <Campo name="telefoneAvisos" rotulo="WhatsApp que recebe os avisos" inputMode="tel" autoComplete="off" placeholder="(77) 99815-5772" maxLength={20}
          defaultValue={telefoneNaTela(a.telefone)} erro={salvar.erro ?? undefined} />
        <div className="actions mt">
          <Botao type="submit" carregando={salvar.ocupado}>{a.telefone ? "Trocar número" : "Ligar os avisos"}</Botao>
          {a.telefone && <Botao variante="ghost" carregando={teste.ocupado} onClick={() => { setTestado(false); void teste.enviar(chamarApi("v1/admin/whatsapp/avisos/teste", {})); }}>Enviar aviso de teste</Botao>}
          {a.telefone && <Botao variante="link" disabled={salvar.ocupado} onClick={() => void salvar.enviar(chamarApi<Avisos>("v1/admin/whatsapp/avisos", { telefone: null }, "PUT"))}>Parar os avisos</Botao>}
        </div>
      </form>
      {a.telefone
        ? <p className="field-help" role="status">{testado ? "Aviso de teste na fila. Ele sai no próximo envio." : `Ligados para ${telefoneNaTela(a.telefone)}.`}</p>
        : <p className="field-help">Desligados: grave um número para começar.</p>}
      {teste.erro && <p className="field-error" role="alert">{teste.erro}</p>}
      <div className="mt">
        {a.avisos.map((x) => (
          <div key={x.id} className="notif">
            <div><b>{x.nome}</b><p>{x.quando}</p></div>
            <Marcar rotulo={x.ligado ? "Ligado" : "Desligado"} aria-label={`Avisar “${x.nome}”`} checked={x.ligado} disabled={salvar.ocupado || !a.telefone}
              onChange={(e) => void salvar.enviar(chamarApi<Avisos>("v1/admin/whatsapp/avisos",
                { desligados: e.target.checked ? desligados.filter((id) => id !== x.id) : [...desligados, x.id] }, "PUT"))} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Teste() {
  const [enviado, setEnviado] = useState(false);
  const { ocupado, erro, setErro, enviar } = useEnvio(() => setEnviado(true));
  function mandar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviado(false);
    const d = String(new FormData(e.currentTarget).get("telefone") ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (!/^\d{10,11}$/.test(d)) return setErro("Digite o número com DDD, como (77) 99815-5772.");
    void enviar(chamarApi("v1/admin/whatsapp/test", { telefone: `+55${d}` }));
  }
  return (
    <form className="card" onSubmit={mandar} noValidate>
      <h2>Enviar mensagem de teste</h2>
      <Campo name="telefone" rotulo="WhatsApp da equipe" inputMode="tel" autoComplete="off" placeholder="(77) 99815-5772" maxLength={20} erro={erro ?? undefined} />
      <div className="actions mt"><Botao type="submit" carregando={ocupado}>Enviar teste</Botao></div>
      {enviado && <p className="field-help" role="status">Mensagem na fila. Ela sai no próximo envio.</p>}
      <p className="field-help">Mande só para números da equipe. Mensagens para quem nunca falou com a loja aumentam o risco de bloqueio.</p>
    </form>
  );
}
