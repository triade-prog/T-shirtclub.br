"use client";

import { useState } from "react";
import {
  EXEMPLOS_MENSAGENS, MAX_RESPOSTAS, MAX_RESPOSTAS_ATIVAS, PALAVRA_VALIDA, mensagemWhatsApp, normalizarPalavra, type AcaoResposta,
} from "@tshirtclub/domain";
import { chamarApi } from "@/lib/api";
import { Botao, Campo, Carregando, Marcar, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { CascaWhatsapp } from "./_wa/CascaWhatsapp";
import { TextoWhatsApp, type DadosLoja } from "./_wa/TextoWhatsApp";

// Clubinha (0540, 0550; em aba própria na 0570): o menu da assistente virtual, na ordem em que a
// cliente vê, as palavras que disparam cada resposta, o horário de atendimento, o tempo até o
// lembrete e a pausa. Ao lado, a prévia num celular com o negrito e os dados reais da loja.

interface Resposta { id: string; acao: AcaoResposta; titulo: string; palavras: string[]; texto: string | null; ativa: boolean }
interface Respostas {
  pausaHoras: number; atendimento: { inicioHora: number; fimHora: number; lembreteMinutos: number };
  loja: DadosLoja; respostas: Resposta[];
}

/** O que cada ação faz (as de texto mostram o próprio texto). */
const ACAO: Record<Exclude<AcaoResposta, "TEXTO">, string> = {
  MINHA_RESERVA: "Responde com as reservas recentes do número que escreveu.",
  OFERTAS: "Responde com as promoções e os cupons ativos no painel.",
  TROCAS: "Responde com a política de trocas e abre um chamado. Vale também para quem escreve troca, trocar, devolução ou devolver.",
  EQUIPE: "Responde com o texto abaixo, abre um chamado e avisa vocês no WhatsApp da equipe.",
};

const exemplo = <M extends "minhas_reservas" | "ofertas">(m: M) => EXEMPLOS_MENSAGENS.find((e) => e.modelo === m)!;

/** O que a Clubinha manda quando a cliente escolhe a opção (a prévia do celular). */
function respostaNaPrevia(r: Resposta): string {
  switch (r.acao) {
    case "TEXTO": return mensagemWhatsApp("resposta_rapida", { texto: r.texto ?? "" }, 0);
    case "EQUIPE": return r.texto ?? "";
    case "TROCAS": return mensagemWhatsApp("trocas", { menu: true }, 0);
    case "MINHA_RESERVA": return mensagemWhatsApp("minhas_reservas", { ...(exemplo("minhas_reservas").p as { reservas: never[] }), menu: true }, 0);
    case "OFERTAS": return mensagemWhatsApp("ofertas", { ...(exemplo("ofertas").p as { promocoes: never[] }), menu: true }, 0);
  }
}

export function Clubinha() {
  return (
    <CascaWhatsapp sub="O menu da assistente virtual, o que ela responde e quando ela passa a conversa para vocês.">
      <MenuDaClubinha />
    </CascaWhatsapp>
  );
}

function MenuDaClubinha() {
  const { dados, erro, recarregar } = useDados<Respostas>("v1/admin/whatsapp/respostas");
  const [editando, setEditando] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const ordem = useEnvio<Respostas>(() => void recarregar());
  if (!dados) return <section className="card"><Carregando erro={erro} /></section>;

  const ativas = dados.respostas.filter((r) => r.ativa);
  const opcoes = ativas.map((r, i) => ({ numero: i + 1, titulo: r.titulo }));
  const aoSalvar = () => { setEditando(null); void recarregar(); };
  const naPrevia = ativas.find((r) => r.id === previa) ?? null;

  function mover(i: number, passo: -1 | 1) {
    const ids = dados!.respostas.map((r) => r.id);
    [ids[i], ids[i + passo]] = [ids[i + passo]!, ids[i]!];
    void ordem.enviar(chamarApi<Respostas>("v1/admin/whatsapp/respostas/ordem", { ids }, "PUT"));
  }

  return (
    <div className="wa-clubinha">
      <div className="stack">
        <section className="card" aria-labelledby="menu-titulo">
          <h2 id="menu-titulo">Menu da Clubinha</h2>
          <ul className="wa-como">
            <li>Quem escreve recebe as boas-vindas com este menu e responde com o número.</li>
            <li>Escrevendo uma palavra da opção (como “frete” ou “pix”), a resposta sai na hora.</li>
            <li>Pedir a equipe, falar em troca ou mandar uma dúvida que ela não sabe abre um chamado em Atendimento.</li>
          </ul>
          <ol className="respostas mt" aria-label="Opções do menu">
            {dados.respostas.map((r, i) => {
              const numero = r.ativa ? ativas.indexOf(r) + 1 : null;
              return (
                <li key={r.id} className={`resposta${previa === r.id ? " na-previa" : ""}`}>
                  <div className="resposta-topo">
                    <span className={`resposta-num${numero ? "" : " off"}`} aria-hidden="true">{numero ?? "–"}</span>
                    <div>
                      <b>{r.titulo}</b> {!r.ativa && <Selo tom="expired">Desligada</Selo>}
                      {r.acao === "TEXTO" ? r.texto && <TextoWhatsApp texto={r.texto} loja={dados.loja} className="resposta-texto" /> : <p>{ACAO[r.acao]}</p>}
                      {r.palavras.length > 0 && <p className="muted">Palavras: {r.palavras.join(", ")}</p>}
                    </div>
                    <div className="resposta-acoes">
                      {r.ativa && (
                        <Botao variante="ghost" aria-pressed={previa === r.id} onClick={() => setPrevia(previa === r.id ? null : r.id)}>
                          Ver no celular<span className="sr-only"> “{r.titulo}”</span>
                        </Botao>
                      )}
                      <Botao variante="ghost" aria-label={`Subir “${r.titulo}”`} disabled={i === 0 || ordem.ocupado} onClick={() => mover(i, -1)}>↑</Botao>
                      <Botao variante="ghost" aria-label={`Descer “${r.titulo}”`} disabled={i === dados.respostas.length - 1 || ordem.ocupado} onClick={() => mover(i, 1)}>↓</Botao>
                      <Botao variante="ghost" aria-expanded={editando === r.id} onClick={() => setEditando(editando === r.id ? null : r.id)}>
                        {editando === r.id ? "Fechar" : "Editar"}<span className="sr-only"> “{r.titulo}”</span>
                      </Botao>
                    </div>
                  </div>
                  {editando === r.id && <FormResposta resposta={r} ativas={ativas.length} aoSalvar={aoSalvar} />}
                </li>
              );
            })}
          </ol>
          {ordem.erro && <p className="field-error" role="alert">{ordem.erro}</p>}
          {editando === "nova"
            ? <FormResposta ativas={ativas.length} aoSalvar={aoSalvar} aoCancelar={() => setEditando(null)} />
            : dados.respostas.length < MAX_RESPOSTAS && <div className="actions mt"><Botao variante="ghost" onClick={() => setEditando("nova")}>Nova resposta</Botao></div>}
        </section>

        <FormHorario dados={dados} aoSalvar={() => void recarregar()} />
      </div>

      <aside className="wa-celular-coluna" aria-labelledby="previa-titulo">
        <h2 id="previa-titulo" className="wa-celular-titulo">Como a cliente vê</h2>
        <div className="wa-celular">
          <div className="wa-celular-topo"><b>T-shirt Club</b><span>Clubinha · assistente virtual</span></div>
          <div className="wa-celular-tela">
            <div className="bolha cliente"><p>Oi! Vocês têm a Limone no Plus?</p></div>
            <div className="bolha loja">
              <TextoWhatsApp texto={mensagemWhatsApp("boas_vindas", { opcoes, nome: "Ana Paula" }, 0)} loja={dados.loja} />
            </div>
            {naPrevia && (
              <>
                <div className="bolha cliente"><p>{ativas.indexOf(naPrevia) + 1}</p></div>
                <div className="bolha loja"><TextoWhatsApp texto={respostaNaPrevia(naPrevia)} loja={dados.loja} /></div>
              </>
            )}
          </div>
        </div>
        <p className="field-help">{naPrevia ? `Mostrando a resposta de “${naPrevia.titulo}”.` : "Toque em “Ver no celular” numa opção para ver a resposta dela."} Nome e reservas são de exemplo.</p>
      </aside>
    </div>
  );
}

function FormResposta({ resposta, ativas, aoSalvar, aoCancelar }: { resposta?: Resposta; ativas: number; aoSalvar: () => void; aoCancelar?: () => void }) {
  const salvar = useEnvio<Respostas>(aoSalvar);
  const excluir = useEnvio<Respostas>(aoSalvar);
  const comTexto = !resposta || resposta.acao === "TEXTO" || resposta.acao === "EQUIPE";
  const caminho = resposta ? `v1/admin/whatsapp/respostas/${resposta.id}` : "v1/admin/whatsapp/respostas";

  function gravar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const titulo = String(f.get("titulo") ?? "").trim();
    const palavras = [...new Set(String(f.get("palavras") ?? "").split(",").map(normalizarPalavra).filter(Boolean))];
    const texto = String(f.get("texto") ?? "").trim();
    const ativa = f.get("ativa") === "on";
    if (titulo.length < 2) return salvar.setErro("Escreva o nome da opção, como aparece no menu.");
    const ruim = palavras.find((p) => !PALAVRA_VALIDA.test(p));
    if (ruim) return salvar.setErro(`“${ruim}” não serve: cada palavra precisa de 2 a 40 letras, em até 4 palavras.`);
    if (palavras.length > 15) return salvar.setErro("Use até 15 palavras por resposta.");
    if (comTexto && texto.length < 2) return salvar.setErro("Escreva o texto da resposta.");
    if (ativa && !resposta?.ativa && ativas >= MAX_RESPOSTAS_ATIVAS) return salvar.setErro(`O menu tem até ${MAX_RESPOSTAS_ATIVAS} opções: desligue outra antes.`);
    void salvar.enviar(chamarApi<Respostas>(caminho, { titulo, palavras, ...(comTexto ? { texto } : {}), ativa }, resposta ? "PUT" : "POST"));
  }

  return (
    <form className="resposta-form" onSubmit={gravar} noValidate aria-label={resposta ? `Editar “${resposta.titulo}”` : "Nova resposta"}>
      <Campo name="titulo" rotulo="Nome no menu" maxLength={40} defaultValue={resposta?.titulo} />
      {resposta?.acao !== "TROCAS" && (
        <Campo name="palavras" rotulo="Palavras que disparam a resposta" maxLength={600} defaultValue={resposta?.palavras.join(", ")}
          ajuda="Separadas por vírgula, com ou sem acento. A resposta sai quando a mensagem tem a palavra inteira, no máximo 1 vez a cada 12 horas para a mesma pessoa." />
      )}
      {comTexto && (
        <Campo name="texto" multilinha rotulo="Texto da resposta" maxLength={1000} defaultValue={resposta?.texto ?? ""}
          ajuda="Em primeira pessoa, próxima e animada, com 💖 e ✦. *Asteriscos* deixam em negrito. {site}, {endereco} e {horario} viram o site, o endereço e o horário da loja." />
      )}
      <Marcar name="ativa" rotulo="Ativa no menu" defaultChecked={resposta?.ativa ?? true} />
      {salvar.erro && <p className="field-error" role="alert">{salvar.erro}</p>}
      {excluir.erro && <p className="field-error" role="alert">{excluir.erro}</p>}
      <div className="actions">
        <Botao type="submit" carregando={salvar.ocupado}>{resposta ? "Salvar" : "Criar resposta"}</Botao>
        {aoCancelar && <Botao variante="link" onClick={aoCancelar}>Cancelar</Botao>}
        {resposta?.acao === "TEXTO" && (
          <Botao variante="danger" carregando={excluir.ocupado}
            onClick={() => { if (confirm(`Excluir “${resposta.titulo}”?`)) void excluir.enviar(chamarApi<Respostas>(caminho, undefined, "DELETE")); }}>
            Excluir
          </Botao>
        )}
      </div>
    </form>
  );
}

const numeroDe = (f: FormData, nome: string) => Number(String(f.get(nome) ?? "").trim());

// Horário de atendimento (0570): os acompanhamentos (lembrete do chamado e pós-venda) só saem
// dentro dele; os minutos até o lembrete e a pausa do robô depois que a equipe responde.
function FormHorario({ dados, aoSalvar }: { dados: Respostas; aoSalvar: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio<Respostas>(aoSalvar);
  const [salvo, setSalvo] = useState(false);
  const a = dados.atendimento;
  function gravar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvo(false);
    const f = new FormData(e.currentTarget);
    const v = { inicioHora: numeroDe(f, "inicio"), fimHora: numeroDe(f, "fim"), lembreteMinutos: numeroDe(f, "lembrete"), pausaHoras: numeroDe(f, "pausa") };
    if (!Number.isInteger(v.inicioHora) || v.inicioHora < 0 || v.inicioHora > 23) return setErro("O início vai de 0 a 23 horas.");
    if (!Number.isInteger(v.fimHora) || v.fimHora < 1 || v.fimHora > 24 || v.fimHora <= v.inicioHora) return setErro("O fim vai até 24 horas e vem depois do início.");
    if (!Number.isInteger(v.lembreteMinutos) || v.lembreteMinutos < 5 || v.lembreteMinutos > 240) return setErro("O lembrete vai de 5 a 240 minutos.");
    if (!Number.isInteger(v.pausaHoras) || v.pausaHoras < 1 || v.pausaHoras > 48) return setErro("A pausa vai de 1 a 48 horas.");
    void enviar(chamarApi<Respostas>("v1/admin/whatsapp/respostas/pausa", v, "PUT")).then((ok) => setSalvo(ok));
  }
  return (
    <form className="card" onSubmit={gravar} noValidate aria-labelledby="horario-titulo" key={`${a.inicioHora}-${a.fimHora}-${a.lembreteMinutos}-${dados.pausaHoras}`}>
      <h2 id="horario-titulo">Horário de atendimento</h2>
      <p className="field-help">
        Das {a.inicioHora}h às {a.fimHora}h, se ninguém assumir um chamado em {a.lembreteMinutos} minutos, a Clubinha avisa a cliente que vocês já respondem e manda o
        aviso de novo. O pós-venda também só sai nesse horário. A Clubinha responde a qualquer hora.
      </p>
      <div className="form-grid mt">
        <Campo name="inicio" rotulo="Começa às (hora)" inputMode="numeric" maxLength={2} defaultValue={a.inicioHora} />
        <Campo name="fim" rotulo="Termina às (hora)" inputMode="numeric" maxLength={2} defaultValue={a.fimHora} />
        <Campo name="lembrete" rotulo="Minutos até o lembrete" inputMode="numeric" maxLength={3} defaultValue={a.lembreteMinutos} />
        <Campo name="pausa" rotulo="Horas de silêncio da Clubinha" inputMode="numeric" maxLength={2} defaultValue={dados.pausaHoras}
          ajuda="Depois que a equipe responde pelo celular ou a cliente pede a equipe. Código, “minha reserva”, “ofertas” e “menu” seguem respondidos." />
      </div>
      {erro && <p className="field-error" role="alert">{erro}</p>}
      <div className="actions mt"><Botao type="submit" carregando={ocupado}>Salvar horário</Botao></div>
      {salvo && <p className="field-help" role="status">Horário salvo.</p>}
    </form>
  );
}
