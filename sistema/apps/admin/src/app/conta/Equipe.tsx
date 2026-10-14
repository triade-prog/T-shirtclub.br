"use client";

import { useEffect, useId, useRef, useState } from "react";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { iniciais, tomDoNome } from "../_painel/pessoa";
import { Botao, Campo, Carregando } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";

// Equipe do painel (0630), no topo de Minha conta: uma tabela com quem entra no painel (pessoa,
// função, situação e último acesso). Só a dona da conta vê "Adicionar pessoa" e, em cada linha,
// "Gerenciar", que abre as ações daquela pessoa. Adicionar abre uma janela que termina com os
// dados de acesso prontos para copiar e mandar pelo WhatsApp dela.

interface Pessoa {
  id: string; nome: string; email?: string; ativo: boolean; dona: boolean; voce: boolean;
  criadoEm: string; ultimoAcesso?: string; autenticador: boolean;
}
interface DadosEquipe { podeGerenciar: boolean; pessoas: Pessoa[] }
interface Acesso { nome: string; email: string; senha: string }


/** "Hoje, 10:10", "Ontem, 18:02" ou "12/10, 09:00". */
function quando(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const dia = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hoje = new Date();
  if (dia(d) === dia(hoje)) return `Hoje, ${hora}`;
  if (dia(d) === dia(new Date(hoje.getTime() - 86_400_000))) return `Ontem, ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}, ${hora}`;
}

/** Senha provisória forte, sem letras que se confundem (l, 1, O, 0): "k7Qm-x2Rp-…". */
function gerarSenha(): string {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const s = Array.from(crypto.getRandomValues(new Uint32Array(16)), (n) => letras[n % letras.length]).join("");
  return s.match(/.{4}/g)!.join("-");
}

function textoDoErro(erro: string): string {
  if (erro === mensagemDeErro("ALREADY_EXISTS")) return "Este e-mail já está na equipe.";
  if (erro === mensagemDeErro("FORBIDDEN")) return "Só a dona da conta cuida da equipe.";
  return erro;
}

function Situacao({ p }: { p: Pessoa }) {
  const [tom, texto] = !p.ativo ? ["off", "Sem acesso"] : p.autenticador ? ["ok", "Ativa"] : ["wait", "Aguardando 1º acesso"];
  return <span className={`eq-situacao ${tom}`}>{texto}</span>;
}

export function Equipe() {
  const { dados, erro, recarregar } = useDados<DadosEquipe>("v1/admin/team");
  const [aberta, setAberta] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const total = dados?.pessoas.length ?? 0;

  return (
    <section className="card eq" id="equipe" aria-labelledby="equipe-titulo">
      <header className="eq-topo">
        <div>
          <h2 id="equipe-titulo">Equipe</h2>
          <p className="eq-sub">{dados ? `${total} ${total === 1 ? "pessoa" : "pessoas"} com acesso ao painel` : "Quem entra no painel"}</p>
        </div>
        {dados?.podeGerenciar && <Botao onClick={() => { setAviso(null); setNovaAberta(true); }}>Adicionar pessoa</Botao>}
      </header>

      {!dados ? <Carregando erro={erro} /> : (
        <>
          <table className="eq-tabela">
            <thead>
              <tr>
                <th scope="col">Pessoa</th>
                <th scope="col">Função</th>
                <th scope="col">Situação</th>
                <th scope="col">Último acesso</th>
                {dados.podeGerenciar && <th scope="col"><span className="sr-only">Ações</span></th>}
              </tr>
            </thead>
            <tbody>
              {dados.pessoas.map((p) => {
                const gerenciavel = dados.podeGerenciar && !p.dona && !p.voce;
                const aberto = aberta === p.id;
                return (
                  <FragmentoPessoa key={p.id} p={p} gerenciavel={gerenciavel} colunas={dados.podeGerenciar ? 5 : 4} aberto={aberto}
                    alternar={() => { setAviso(null); setAberta(aberto ? null : p.id); }}
                    aoMudar={(texto) => { setAviso(texto); void recarregar(); }} />
                );
              })}
            </tbody>
          </table>
          {aviso && <p className="eq-aviso" role="status">{aviso}</p>}
          <p className="eq-nota">Todas da equipe veem e fazem tudo no painel. {dados.podeGerenciar ? "Só você, como dona da conta, adiciona pessoas e cuida dos acessos." : "Só a dona da conta adiciona pessoas e cuida dos acessos."}</p>
        </>
      )}
      {novaAberta && <JanelaNovaPessoa aoFechar={(mudou) => { setNovaAberta(false); if (mudou) void recarregar(); }} />}
    </section>
  );
}

function FragmentoPessoa({ p, gerenciavel, colunas, aberto, alternar, aoMudar }: {
  p: Pessoa; gerenciavel: boolean; colunas: number; aberto: boolean; alternar: () => void; aoMudar: (aviso: string) => void;
}) {
  const painel = useId();
  return (
    <>
      <tr className={`${p.ativo ? "" : "eq-inativa"}${aberto ? " eq-aberta" : ""}`}>
        <td>
          <div className="eq-pessoa">
            <span className={`pessoa-av ${tomDoNome(p.nome)}`} aria-hidden="true">{iniciais(p.nome)}</span>
            <div>
              <b>{p.nome}{p.voce && <span className="eq-voce">você</span>}</b>
              <span className="eq-email">{p.email ?? "sem e-mail"}</span>
            </div>
          </div>
        </td>
        <td data-rotulo="Função"><span className={`eq-funcao${p.dona ? " dona" : ""}`}>{p.dona ? "Dona" : "Equipe"}</span></td>
        <td data-rotulo="Situação"><Situacao p={p} /></td>
        <td data-rotulo="Último acesso" className="eq-quando">{p.ultimoAcesso ? quando(p.ultimoAcesso) : "Nunca entrou"}</td>
        {colunas === 5 && (
          <td className="eq-acao">
            {gerenciavel && (
              <Botao variante="ghost" aria-expanded={aberto} aria-controls={painel} onClick={alternar} aria-label={`Gerenciar ${p.nome}`}>
                Gerenciar
              </Botao>
            )}
          </td>
        )}
      </tr>
      {aberto && (
        <tr className="eq-painel-linha">
          <td colSpan={colunas}>
            <PainelPessoa id={painel} p={p} aoMudar={aoMudar} />
          </td>
        </tr>
      )}
    </>
  );
}

/** As ações de uma pessoa: cada uma explica para que serve e pede confirmação. */
function PainelPessoa({ id, p, aoMudar }: { id: string; p: Pessoa; aoMudar: (aviso: string) => void }) {
  const [modo, setModo] = useState<null | "senha" | "autenticador" | "acesso">(null);
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const zerar = useEnvio(() => { setModo(null); aoMudar(`Autenticador de ${p.nome} zerado. No próximo login, o painel mostra o QR code para ela cadastrar de novo.`); });
  const mudarAcesso = useEnvio(() => { setModo(null); aoMudar(p.ativo ? `${p.nome} saiu do painel e não entra mais até você devolver o acesso.` : `${p.nome} pode entrar no painel de novo.`); });

  if (acesso) return <div id={id} className="eq-painel"><DadosDeAcesso acesso={acesso} titulo={`Senha provisória nova de ${p.nome}`} aoConcluir={() => setAcesso(null)} /></div>;

  if (!p.ativo) {
    return (
      <div id={id} className="eq-painel">
        <div className="eq-opcao">
          <div><b>Devolver acesso</b><p>{p.nome} volta a entrar no painel com a senha e o autenticador de antes.</p></div>
          <Botao carregando={mudarAcesso.ocupado} onClick={() => void mudarAcesso.enviar(chamarApi(`v1/admin/team/${p.id}/active`, { ativo: true }, "PUT"))}>Devolver acesso</Botao>
        </div>
        {mudarAcesso.erro && <p className="field-error" role="alert">{textoDoErro(mudarAcesso.erro)}</p>}
      </div>
    );
  }

  return (
    <div id={id} className="eq-painel" role="group" aria-label={`Ações para ${p.nome}`}>
      <div className="eq-opcao">
        <div><b>Senha provisória nova</b><p>Para quando ela esqueceu a senha. Ela troca por uma só dela no próximo acesso.</p></div>
        {modo !== "senha" && <Botao variante="ghost" onClick={() => setModo("senha")}>Criar senha</Botao>}
      </div>
      {modo === "senha" && (
        <FormSenha alvo={p} aoCancelar={() => setModo(null)} aoSalvar={(senha) => { setModo(null); setAcesso({ nome: p.nome, email: p.email ?? "", senha }); aoMudar(""); }} />
      )}

      {p.autenticador && (
        <>
          <div className="eq-opcao">
            <div><b>Zerar autenticador</b><p>Para quando ela perdeu ou trocou de celular. No próximo login, o painel mostra o QR code de novo.</p></div>
            {modo !== "autenticador" && <Botao variante="ghost" onClick={() => setModo("autenticador")}>Zerar</Botao>}
          </div>
          {modo === "autenticador" && (
            <Confirmar texto={`Zerar o autenticador de ${p.nome}?`} botao="Zerar autenticador" envio={zerar}
              acao={() => zerar.enviar(chamarApi(`v1/admin/team/${p.id}/reset-mfa`, {}))} aoCancelar={() => setModo(null)} />
          )}
        </>
      )}

      <div className="eq-opcao">
        <div><b>Tirar acesso</b><p>Ela sai do painel na hora e não entra mais até você devolver. Nada do que ela fez é apagado.</p></div>
        {modo !== "acesso" && <Botao variante="ghost" className="eq-perigo" onClick={() => setModo("acesso")}>Tirar acesso</Botao>}
      </div>
      {modo === "acesso" && (
        <Confirmar texto={`Tirar o acesso de ${p.nome} ao painel?`} botao="Tirar acesso" envio={mudarAcesso}
          acao={() => mudarAcesso.enviar(chamarApi(`v1/admin/team/${p.id}/active`, { ativo: false }, "PUT"))} aoCancelar={() => setModo(null)} />
      )}
    </div>
  );
}

function Confirmar({ texto, botao, envio, acao, aoCancelar }: {
  texto: string; botao: string; envio: { ocupado: boolean; erro: string | null }; acao: () => Promise<boolean>; aoCancelar: () => void;
}) {
  return (
    <div className="eq-confirmar" role="group" aria-label={texto}>
      <p>{texto}</p>
      {envio.erro && <p className="field-error" role="alert">{textoDoErro(envio.erro)}</p>}
      <div className="actions">
        <Botao variante="danger" carregando={envio.ocupado} onClick={() => void acao()}>{botao}</Botao>
        <Botao variante="link" onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

/** Campo da senha provisória com o botão "Gerar" ao lado. */
function CampoSenha({ senha, setSenha }: { senha: string; setSenha: (s: string) => void }) {
  return (
    <div className="eq-senha">
      <Campo name="senha" rotulo="Senha provisória" autoComplete="off" spellCheck={false} maxLength={128} value={senha}
        className="eq-mono" onChange={(e) => setSenha(e.target.value)} ajuda="Pelo menos 12 caracteres. Use “Gerar” para uma senha forte." />
      <Botao variante="ghost" onClick={() => setSenha(gerarSenha())}>Gerar</Botao>
    </div>
  );
}

function FormSenha({ alvo, aoCancelar, aoSalvar }: { alvo: Pessoa; aoCancelar: () => void; aoSalvar: (senha: string) => void }) {
  const [senha, setSenha] = useState(() => gerarSenha());
  const { ocupado, erro, setErro, enviar } = useEnvio(() => aoSalvar(senha));
  return (
    <form className="eq-confirmar" noValidate aria-label={`Senha provisória nova para ${alvo.nome}`} onSubmit={(e) => {
      e.preventDefault();
      if (senha.length < 12) return setErro("A senha provisória precisa ter pelo menos 12 caracteres.");
      void enviar(chamarApi(`v1/admin/team/${alvo.id}/password`, { senha }, "PUT"));
    }}>
      <CampoSenha senha={senha} setSenha={setSenha} />
      {erro && <p className="field-error" role="alert">{textoDoErro(erro)}</p>}
      <div className="actions">
        <Botao type="submit" carregando={ocupado}>Salvar senha</Botao>
        <Botao variante="link" onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </form>
  );
}

/** Depois de criar: os dados de acesso, com a mensagem pronta para o WhatsApp da pessoa. */
function DadosDeAcesso({ acesso, titulo, aoConcluir }: { acesso: Acesso; titulo: string; aoConcluir: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const painel = typeof window === "undefined" ? "" : window.location.host;
  const mensagem = `Oi, ${acesso.nome.split(" ")[0]}! Seu acesso ao painel da T-shirt Club:\n${painel}\nE-mail: ${acesso.email}\nSenha provisória: ${acesso.senha}\n\nNo primeiro acesso, cadastre o aplicativo autenticador e troque a senha em Minha conta.`;
  async function copiar() {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); } catch { setCopiado(false); }
  }
  return (
    <div className="eq-acesso">
      <p className="eq-acesso-titulo" role="status"><span className="eq-check" aria-hidden="true">✓</span>{titulo}</p>
      <dl>
        <div><dt>Painel</dt><dd>{painel}</dd></div>
        <div><dt>E-mail</dt><dd>{acesso.email}</dd></div>
        <div><dt>Senha provisória</dt><dd className="eq-mono selecionavel">{acesso.senha}</dd></div>
      </dl>
      <p className="eq-sub">Mande pelo WhatsApp dela, nunca em grupo. Esta senha não fica guardada: copie agora.</p>
      <div className="actions">
        <Botao onClick={() => void copiar()}>{copiado ? "Mensagem copiada" : "Copiar mensagem"}</Botao>
        <Botao variante="ghost" onClick={aoConcluir}>Concluir</Botao>
      </div>
    </div>
  );
}

function JanelaNovaPessoa({ aoFechar }: { aoFechar: (mudou: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState(() => gerarSenha());
  const [criado, setCriado] = useState<Acesso | null>(null);
  const { ocupado, erro, setErro, enviar } = useEnvio(() => setCriado({ nome: nome.trim(), email: email.trim().toLowerCase(), senha }));

  useEffect(() => { ref.current?.showModal(); }, []);

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro("Escreva o nome da pessoa.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro("Confira o e-mail.");
    if (senha.length < 12) return setErro("A senha provisória precisa ter pelo menos 12 caracteres.");
    void enviar(chamarApi("v1/admin/team", { nome: nome.trim(), email: email.trim(), senha }));
  }

  return (
    <dialog ref={ref} className="eq-janela" aria-labelledby={titulo} onClose={() => aoFechar(!!criado)}>
      {criado ? (
        <>
          <h3 id={titulo}>{criado.nome} entrou na equipe</h3>
          <DadosDeAcesso acesso={criado} titulo="Conta criada" aoConcluir={() => ref.current?.close()} />
        </>
      ) : (
        <form onSubmit={salvar} noValidate>
          <h3 id={titulo}>Adicionar pessoa</h3>
          <p className="eq-sub">Ela entra com o e-mail e a senha provisória, cadastra o autenticador e troca a senha no primeiro acesso.</p>
          <div className="stack mt">
            <Campo name="nome" rotulo="Nome" autoComplete="off" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
            <Campo name="email" type="email" rotulo="E-mail" autoComplete="off" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            <CampoSenha senha={senha} setSenha={setSenha} />
          </div>
          {erro && <p className="field-error" role="alert">{textoDoErro(erro)}</p>}
          <div className="eq-janela-acoes">
            <Botao variante="link" onClick={() => ref.current?.close()}>Cancelar</Botao>
            <Botao type="submit" carregando={ocupado}>Adicionar à equipe</Botao>
          </div>
        </form>
      )}
    </dialog>
  );
}
