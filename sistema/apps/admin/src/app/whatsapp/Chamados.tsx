"use client";

import { chamarApi, dataHora, telefone } from "@/lib/api";
import { Botao, Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";
import { useRepetir } from "../_painel/useRepetir";

// Chamados (0550): o que a Clubinha passou para a equipe (falar com a equipe, troca e a dúvida
// que ela não soube responder). Assumir e finalizar aqui ou respondendo o aviso no WhatsApp
// ("assumi 12", "resolvido 12"); ao finalizar, a Clubinha pede a nota de 1 a 5.

type Status = "ABERTO" | "EM_ATENDIMENTO" | "RESOLVIDO";
interface Chamado {
  numero: number; status: Status; motivo: "EQUIPE" | "TROCA" | "DUVIDA";
  nome: string | null; telefone: string | null; final: string | null;
  pedido: { numero: number; status: string } | null; mensagens: string[];
  abertoEm: string; assumidoEm: string | null; assumidoVia: "PAINEL" | "WHATSAPP" | "CELULAR" | null;
  resolvidoEm: string | null; resolvidoVia: "PAINEL" | "WHATSAPP" | null; notaPedida: boolean; nota: number | null;
}
interface Chamados { abertos: Chamado[]; finalizados: Chamado[]; notas: { media: number | null; total: number } }

const MOTIVO: Record<Chamado["motivo"], string> = { EQUIPE: "Pediu a equipe", TROCA: "Falou em troca", DUVIDA: "Dúvida que a Clubinha não respondeu" };
const VIA: Record<string, string> = { PAINEL: "pelo painel", WHATSAPP: "pelo WhatsApp", CELULAR: "resposta pelo celular da loja" };

export function ChamadosWhatsapp() {
  const { dados, erro, recarregar } = useDados<Chamados>("v1/admin/whatsapp/chamados");
  useRepetir(() => void recarregar(), 30_000, true);
  if (!dados) return <section className="card"><h2>Chamados</h2><Carregando erro={erro} /></section>;

  return (
    <section className="card" aria-labelledby="chamados-titulo">
      <h2 id="chamados-titulo">Chamados</h2>
      <p className="field-help">
        Quando a cliente pede a equipe, fala em troca ou manda uma dúvida que a Clubinha não sabe responder, abre um chamado e vocês
        recebem o aviso. Assuma ao começar e finalize ao terminar, aqui ou respondendo o aviso com “assumi 12” e “resolvido 12”.
        Ao finalizar, a Clubinha agradece, pede uma nota de 1 a 5 e volta a responder na conversa.
      </p>
      {dados.notas.total > 0 && (
        <p className="mt">Nota média nos últimos 30 dias: <b>{String(dados.notas.media).replace(".", ",")}</b> ({dados.notas.total} {dados.notas.total === 1 ? "nota" : "notas"})</p>
      )}

      <h3 className="mt">Abertos</h3>
      {dados.abertos.length === 0
        ? <p className="field-help">Nenhum chamado aberto agora.</p>
        : <ol className="respostas" aria-label="Chamados abertos">{dados.abertos.map((c) => <ItemChamado key={c.numero} chamado={c} aoMudar={() => void recarregar()} />)}</ol>}

      {dados.finalizados.length > 0 && (
        <>
          <h3 className="mt">Finalizados nos últimos 7 dias</h3>
          <ol className="respostas" aria-label="Chamados finalizados">{dados.finalizados.map((c) => <ItemChamado key={c.numero} chamado={c} aoMudar={() => void recarregar()} />)}</ol>
        </>
      )}
    </section>
  );
}

function ItemChamado({ chamado: c, aoMudar }: { chamado: Chamado; aoMudar: () => void }) {
  const acao = useEnvio<Chamados>(aoMudar);
  const quem = c.nome ?? "Cliente sem nome";
  const caminho = (o: "assumir" | "finalizar") => `v1/admin/whatsapp/chamados/${c.numero}/${o}`;
  return (
    <li className="resposta">
      <div className="resposta-topo">
        <span className="resposta-num chamado-num" aria-hidden="true">#{c.numero}</span>
        <div>
          <b><span className="sr-only">Chamado #{c.numero}: </span>{quem}</b>{" "}
          {c.status === "ABERTO" && <Selo tom="issue">Aberto</Selo>}
          {c.status === "EM_ATENDIMENTO" && <Selo tom="reserved">Em atendimento</Selo>}
          {c.status === "RESOLVIDO" && <Selo tom="paid">Finalizado</Selo>}
          <p>
            {MOTIVO[c.motivo]} · aberto {dataHora(c.abertoEm)}
            {c.telefone ? ` · ${telefone(c.telefone)}` : c.final ? ` · final ${c.final}` : ""}
            {c.pedido ? ` · pedido #${c.pedido.numero}` : ""}
          </p>
          {c.mensagens.length > 0 && <p>{c.mensagens.map((m) => `“${m}”`).join("\n")}</p>}
          {c.assumidoEm && c.assumidoVia && <p>Assumido {dataHora(c.assumidoEm)}, {VIA[c.assumidoVia]}</p>}
          {c.resolvidoEm && c.resolvidoVia && (
            <p>
              Finalizado {dataHora(c.resolvidoEm)}, {VIA[c.resolvidoVia]}
              {c.nota !== null ? ` · nota ${c.nota} de 5` : c.notaPedida ? " · nota pedida" : ""}
            </p>
          )}
        </div>
        {c.status !== "RESOLVIDO" && (
          <div className="resposta-acoes">
            {c.status === "ABERTO" && (
              <Botao variante="ghost" carregando={acao.ocupado} onClick={() => void acao.enviar(chamarApi<Chamados>(caminho("assumir"), {}))}>
                Assumir<span className="sr-only"> o chamado #{c.numero}</span>
              </Botao>
            )}
            <Botao carregando={acao.ocupado} onClick={() => void acao.enviar(chamarApi<Chamados>(caminho("finalizar"), {}))}>
              Finalizar<span className="sr-only"> o chamado #{c.numero}</span>
            </Botao>
          </div>
        )}
      </div>
      {acao.erro && <p className="field-error" role="alert">{acao.erro}</p>}
    </li>
  );
}
