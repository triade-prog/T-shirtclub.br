"use client";

import { useState } from "react";
import { MAX_RESPOSTAS, MAX_RESPOSTAS_ATIVAS, PALAVRA_VALIDA, mensagemWhatsApp, normalizarPalavra, type AcaoResposta } from "@tshirtclub/domain";
import { chamarApi } from "@/lib/api";
import { Botao, Campo, Carregando, Marcar, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";

// Atendimento automático (0540): as respostas rápidas do menu do WhatsApp da loja, na ordem do
// menu, com as palavras que disparam cada uma, e a pausa do robô quando a equipe responde.

interface Resposta { id: string; acao: AcaoResposta; titulo: string; palavras: string[]; texto: string | null; ativa: boolean }
interface Respostas { pausaHoras: number; respostas: Resposta[] }

/** O que cada ação faz (as de texto mostram o próprio texto). */
const ACAO: Record<Exclude<AcaoResposta, "TEXTO">, string> = {
  MINHA_RESERVA: "Responde com as reservas recentes do número que escreveu.",
  OFERTAS: "Responde com as promoções e os cupons ativos no painel.",
  TROCAS: "Responde com a política de trocas. Também vale para quem escreve troca, trocar, devolução ou devolver.",
  EQUIPE: "Responde com o texto abaixo, avisa vocês no WhatsApp da equipe e deixa o robô quieto nessa conversa.",
};

export function AtendimentoAutomatico() {
  const { dados, erro, recarregar } = useDados<Respostas>("v1/admin/whatsapp/respostas");
  const [editando, setEditando] = useState<string | null>(null);
  const ordem = useEnvio<Respostas>(() => void recarregar());
  if (!dados) return <section className="card"><h2>Atendimento automático</h2><Carregando erro={erro} /></section>;

  const ativas = dados.respostas.filter((r) => r.ativa);
  const opcoes = ativas.map((r, i) => ({ numero: i + 1, titulo: r.titulo }));
  const aoSalvar = () => { setEditando(null); void recarregar(); };

  function mover(i: number, passo: -1 | 1) {
    const ids = dados!.respostas.map((r) => r.id);
    [ids[i], ids[i + passo]] = [ids[i + passo]!, ids[i]!];
    void ordem.enviar(chamarApi<Respostas>("v1/admin/whatsapp/respostas/ordem", { ids }, "PUT"));
  }

  return (
    <section className="card" aria-labelledby="respostas-titulo">
      <h2 id="respostas-titulo">Atendimento automático</h2>
      <p className="field-help">
        Quem responde é a Clubinha, a assistente virtual da loja: quem escreve recebe as boas-vindas dela com este menu. A cliente responde com o número, ou escreve uma das palavras de uma resposta
        (como “frete” ou “pix”) e recebe o texto na hora. Enviando “menu”, ela vê as opções de novo. Quando vocês respondem pelo celular da loja,
        o robô fica quieto nessa conversa por {dados.pausaHoras} {dados.pausaHoras === 1 ? "hora" : "horas"}. Se a cliente pede a equipe e ninguém
        responde em 20 minutos (das 8h às 20h), a Clubinha avisa a cliente que vocês já respondem e o aviso chega de novo para vocês.
      </p>

      <h3 className="mt">Como a cliente vê o menu</h3>
      {opcoes.length
        ? <p className="previa-menu">{mensagemWhatsApp("menu", { opcoes })}</p>
        : <p className="field-help">Sem opções ativas: as boas-vindas saem sem o menu.</p>}

      <ol className="respostas mt" aria-label="Opções do menu">
        {dados.respostas.map((r, i) => {
          const numero = r.ativa ? ativas.indexOf(r) + 1 : null;
          return (
            <li key={r.id} className="resposta">
              <div className="resposta-topo">
                <span className={`resposta-num${numero ? "" : " off"}`} aria-hidden="true">{numero ?? "–"}</span>
                <div>
                  <b>{r.titulo}</b> {!r.ativa && <Selo tom="expired">Desligada</Selo>}
                  <p>{r.acao === "TEXTO" ? r.texto : ACAO[r.acao]}</p>
                  {r.palavras.length > 0 && <p>Palavras: {r.palavras.join(", ")}</p>}
                </div>
                <div className="resposta-acoes">
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

      <FormPausa pausaHoras={dados.pausaHoras} aoSalvar={() => void recarregar()} />
    </section>
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
          ajuda="Separadas por vírgula, sem acento ou com, tanto faz. A resposta sai quando a mensagem tem a palavra inteira, no máximo 1 vez a cada 12 horas para a mesma pessoa." />
      )}
      {comTexto && (
        <Campo name="texto" multilinha rotulo="Texto da resposta" maxLength={1000} defaultValue={resposta?.texto ?? ""}
          ajuda="Escreva como a Clubinha fala: em primeira pessoa, próxima e animada, com 💖 e ✦. Use *asteriscos* para negrito. {site}, {endereco} e {horario} viram o site e o endereço e o horário de retirada da loja." />
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

function FormPausa({ pausaHoras, aoSalvar }: { pausaHoras: number; aoSalvar: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio<Respostas>(aoSalvar);
  function gravar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const horas = Number(String(new FormData(e.currentTarget).get("pausa") ?? "").trim());
    if (!Number.isInteger(horas) || horas < 1 || horas > 48) return setErro("A pausa vai de 1 a 48 horas.");
    void enviar(chamarApi<Respostas>("v1/admin/whatsapp/respostas/pausa", { pausaHoras: horas }, "PUT"));
  }
  return (
    <form className="mt" onSubmit={gravar} noValidate key={pausaHoras}>
      <Campo name="pausa" rotulo="Horas de silêncio do robô depois que a equipe responde" inputMode="numeric" maxLength={2} defaultValue={pausaHoras}
        erro={erro ?? undefined} ajuda="Também vale quando a cliente escolhe falar com a equipe. O pedido de código, “minha reserva”, “ofertas” e “menu” seguem respondidos." />
      <div className="actions mt"><Botao type="submit" variante="ghost" carregando={ocupado}>Salvar pausa</Botao></div>
    </form>
  );
}
