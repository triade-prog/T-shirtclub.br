"use client";

import { useState } from "react";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { Aviso, Botao, Campo, Carregando, Marcar } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { useRepetir } from "../_painel/useRepetir";
import { CascaWhatsapp, useWhatsapp } from "./_wa/CascaWhatsapp";

// Configurações (0570): a conexão do número da loja (Z-API ou Wafly) com o QR code, os avisos
// para o WhatsApp da equipe (0510) e um teste só, que já vem com o número da equipe.

interface Avisos { telefone: string | null; avisos: { id: string; nome: string; quando: string; ligado: boolean }[] }

/** +5577998887777 → (77) 99888-7777 */
function telefoneNaTela(e164: string | null): string {
  const d = (e164 ?? "").replace(/^\+55/, "");
  return /^\d{10,11}$/.test(d) ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : "";
}
const soNumero = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");

export function Configuracoes() {
  return (
    <CascaWhatsapp sub="O número da loja conectado ao sistema e o WhatsApp da equipe que recebe os avisos.">
      <ConfiguracoesDoCanal />
    </CascaWhatsapp>
  );
}

function ConfiguracoesDoCanal() {
  const { config, erroConfig, recarregarConfig } = useWhatsapp();
  const avisos = useDados<Avisos>("v1/admin/whatsapp/avisos");
  if (!config) return <section className="card"><Carregando erro={erroConfig} /></section>;
  return (
    <div className="grid split wa-config">
      <div className="stack">
        <Conexao conectado={config.conectado} aoConectar={recarregarConfig} />
        <AvisosEquipe a={avisos.dados} erro={avisos.erro} recarregar={() => void avisos.recarregar()} />
      </div>
      <div className="stack">
        <Teste telefoneEquipe={avisos.dados?.telefone ?? null} />
      </div>
    </div>
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
      <Aviso tipo="green" titulo="Número da loja conectado." tag="ONLINE">
        <p>Os códigos saem na hora e a fila envia no ritmo da aba Envios.</p>
      </Aviso>
    );
  }
  return (
    <Aviso tipo="error" titulo="O WhatsApp da loja está desconectado.">
      <p>Sem ele, as clientes não recebem o código e as mensagens esperam na fila. No celular da loja, abra o WhatsApp, vá em Aparelhos conectados e leia o QR code.</p>
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

// Avisos da loja (0510): o WhatsApp pessoal da equipe recebe nova reserva, pagamento aprovado,
// inscrição na lista VIP, os chamados e o que pede ação. Sai pela mesma fila, depois das clientes.
function AvisosEquipe({ a, erro: erroDados, recarregar }: { a: Avisos | null; erro: string | null; recarregar: () => void }) {
  const salvar = useEnvio<Avisos>(recarregar);
  if (!a) return <section className="card"><h2>Avisos para a equipe</h2><Carregando erro={erroDados} /></section>;
  const desligados = a.avisos.filter((x) => !x.ligado).map((x) => x.id);

  function gravar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = soNumero(new FormData(e.currentTarget).get("telefoneAvisos"));
    if (!/^\d{10,11}$/.test(d)) return salvar.setErro("Digite o número com DDD, como (77) 99815-5772.");
    void salvar.enviar(chamarApi<Avisos>("v1/admin/whatsapp/avisos", { telefone: `+55${d}` }, "PUT"));
  }

  return (
    <section className="card" aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo">Avisos para a equipe</h2>
      <p className="field-help">
        O WhatsApp da equipe recebe cada nova reserva, pagamento aprovado, chamado e o que precisa de ação. Use um número diferente do WhatsApp da loja.
        Respondendo o aviso com “assumi 12” ou “resolvido 12”, o chamado muda sozinho.
      </p>
      <form className="mt" onSubmit={gravar} noValidate key={a.telefone ?? "sem"}>
        <Campo name="telefoneAvisos" rotulo="WhatsApp que recebe os avisos" inputMode="tel" autoComplete="off" placeholder="(77) 99815-5772" maxLength={20}
          defaultValue={telefoneNaTela(a.telefone)} erro={salvar.erro ?? undefined} />
        <div className="actions mt">
          <Botao type="submit" carregando={salvar.ocupado}>{a.telefone ? "Trocar número" : "Ligar os avisos"}</Botao>
          {a.telefone && <Botao variante="link" disabled={salvar.ocupado} onClick={() => void salvar.enviar(chamarApi<Avisos>("v1/admin/whatsapp/avisos", { telefone: null }, "PUT"))}>Parar os avisos</Botao>}
        </div>
      </form>
      <p className="field-help" role="status">{a.telefone ? `Ligados para ${telefoneNaTela(a.telefone)}.` : "Desligados: grave um número para começar."}</p>
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

// Um teste só: a mensagem de teste pela fila, para o número da equipe (já preenchido).
function Teste({ telefoneEquipe }: { telefoneEquipe: string | null }) {
  const [enviado, setEnviado] = useState(false);
  const { ocupado, erro, setErro, enviar } = useEnvio(() => setEnviado(true));
  function mandar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviado(false);
    const d = soNumero(new FormData(e.currentTarget).get("telefone"));
    if (!/^\d{10,11}$/.test(d)) return setErro("Digite o número com DDD, como (77) 99815-5772.");
    void enviar(chamarApi("v1/admin/whatsapp/test", { telefone: `+55${d}` }));
  }
  return (
    <form className="card" onSubmit={mandar} noValidate key={telefoneEquipe ?? "sem"} aria-labelledby="teste-titulo">
      <h2 id="teste-titulo">Testar o envio</h2>
      <p className="field-help">Manda uma mensagem de teste pela fila, para conferir a conexão. Use só números da equipe: mensagem para quem nunca falou com a loja aumenta o risco de bloqueio.</p>
      <Campo name="telefone" rotulo="WhatsApp da equipe" inputMode="tel" autoComplete="off" placeholder="(77) 99815-5772" maxLength={20}
        defaultValue={telefoneNaTela(telefoneEquipe)} erro={erro ?? undefined} />
      <div className="actions mt"><Botao type="submit" carregando={ocupado}>Enviar teste</Botao></div>
      {enviado && <p className="field-help" role="status">Mensagem na fila. Ela sai no próximo envio; acompanhe em Envios.</p>}
    </form>
  );
}
