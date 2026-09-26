"use client";

import Link from "next/link";
import { useState } from "react";
import { Aviso, Botao, cx } from "@tshirtclub/ui";
import { chamarApi, dataHora, mensagemDeErro } from "@/lib/api";
import { Caixa, Casca } from "./Casca";
import { useDados } from "./useDados";
import { useRepetir } from "./useRepetir";

interface Painel {
  reservas: { ativas: number; pagas: number; expiradasHoje: number; entreguesHoje: number };
  acoes: {
    cancelamentosPendentes: number; pagamentosEmAnalise: number; disputasAbertas: number; telefonesBloqueados: number; alertasAbertos: number;
    fretes: { aguardandoCalculo: number; aguardandoPagamento: number; pertoDeVencer: number; vencidos: number };
    aguardandoModalidade: number; emPreparacao: number;
  };
  fila: { pendentes: number; enviadasHoje: number; falhasHoje: number; descartadasHoje: number; maisAntigaPendente: string | null };
  whatsapp: { conectado: boolean };
}
interface Alerta { id: string; tipo: string; mensagem: string; abertoEm: string; ocorrencias?: number }

export function Inicio() {
  const painel = useDados<Painel>("v1/admin/dashboard");
  const alertas = useDados<Alerta[]>("v1/admin/alerts");
  // O painel fica aberto no balcão: atualiza a cada 30 s.
  useRepetir(() => { void painel.recarregar(); void alertas.recarregar(); }, 30_000, true);
  const p = painel.dados;

  return (
    <Casca titulo="Início">
      {painel.erro && <Aviso tipo="erro" titulo={painel.erro} />}
      {!p ? <p role="status" className="m-0 text-tinta-suave">Carregando…</p> : (
        <>
          {!p.whatsapp.conectado && (
            <Aviso tipo="erro" titulo="O WhatsApp da loja está desconectado.">
              <p className="m-0 mt-1 text-sm">Sem ele, as clientes não recebem código nem avisos. Reconecte pelo celular da loja.</p>
            </Aviso>
          )}

          <Caixa titulo="Pede ação agora">
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
              <Acao n={p.acoes.cancelamentosPendentes} texto="pedidos de cancelamento" href="/cancelamentos" urgente />
              <Acao n={p.acoes.fretes.aguardandoCalculo} texto="fretes para calcular" href="/entregas?substatus=AGUARDANDO_CALCULO_FRETE" urgente />
              <Acao n={p.acoes.fretes.pertoDeVencer} texto="fretes perto de vencer" href="/entregas?substatus=AGUARDANDO_PAGAMENTO_FRETE" />
              <Acao n={p.acoes.fretes.vencidos} texto="fretes vencidos" href="/entregas?substatus=FRETE_VENCIDO" urgente />
              <Acao n={p.acoes.emPreparacao} texto="pedidos para preparar" href="/entregas?substatus=EM_PREPARACAO" />
              <Acao n={p.acoes.aguardandoModalidade} texto="pagos sem entrega escolhida" href="/entregas?substatus=AGUARDANDO_MODALIDADE" />
              <Acao n={p.acoes.pagamentosEmAnalise} texto="pagamentos em análise" urgente />
              <Acao n={p.acoes.disputasAbertas} texto="contestações abertas" urgente />
              <Acao n={p.acoes.telefonesBloqueados} texto="telefones bloqueados" />
            </ul>
          </Caixa>

          <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
            {([["Reservas ativas", p.reservas.ativas], ["Pagas, a entregar", p.reservas.pagas], ["Expiradas hoje", p.reservas.expiradasHoje], ["Entregues hoje", p.reservas.entreguesHoje]] as const).map(([rotulo, n]) => (
              <div key={rotulo} className="rounded-cartao border-2 border-tinta bg-branco p-4">
                <dt className="text-sm text-tinta-suave">{rotulo}</dt>
                <dd className="m-0 font-display text-[34px] font-extrabold leading-none">{n}</dd>
              </div>
            ))}
          </dl>

          <Caixa titulo="Mensagens de WhatsApp hoje">
            <p className="m-0 text-[15px]">
              {p.fila.enviadasHoje} enviadas · {p.fila.pendentes} na fila{p.fila.falhasHoje ? ` · ${p.fila.falhasHoje} com falha` : ""}
              {p.fila.descartadasHoje ? ` · ${p.fila.descartadasHoje} descartadas (vencidas)` : ""}.
            </p>
            {p.fila.maisAntigaPendente && <p className="m-0 text-sm text-tinta-suave">A mais antiga na fila é de {dataHora(p.fila.maisAntigaPendente)}.</p>}
          </Caixa>

          <Alertas alertas={alertas.dados ?? []} aoResolver={() => { void alertas.recarregar(); void painel.recarregar(); }} />
        </>
      )}
    </Casca>
  );
}

function Acao({ n, texto, href, urgente }: { n: number; texto: string; href?: string; urgente?: boolean }) {
  const corpo = (
    <>
      <b className={cx("font-display text-2xl font-extrabold", n > 0 && urgente && "text-erro")}>{n}</b>
      <span>{texto}</span>
    </>
  );
  const classe = cx("flex min-h-12 items-center gap-3 rounded-campo border px-3 py-2",
    n > 0 ? "border-tinta bg-papel" : "border-linha text-tinta-suave");
  return <li>{href && n > 0 ? <Link href={href} className={cx(classe, "hover:bg-citrino")}>{corpo}</Link> : <span className={classe}>{corpo}</span>}</li>;
}

function Alertas({ alertas, aoResolver }: { alertas: Alerta[]; aoResolver: () => void }) {
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function resolver(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
    if (motivo.length < 3) return setErro("Escreva o que foi feito (pelo menos 3 letras).");
    const r = await chamarApi(`v1/admin/alerts/${id}/resolve`, { motivo });
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    setErro(null);
    setResolvendo(null);
    aoResolver();
  }

  return (
    <Caixa titulo={`Alertas do sistema${alertas.length ? ` (${alertas.length})` : ""}`}>
      {alertas.length === 0 ? <p className="m-0 text-sm text-tinta-suave">Nenhum alerta aberto.</p> : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {alertas.map((a) => (
            <li key={a.id} className="grid gap-2 border-t border-linha pt-3 first:border-0 first:pt-0">
              <p className="m-0 text-[15px]"><b>{a.mensagem}</b></p>
              <p className="m-0 text-sm text-tinta-suave">Desde {dataHora(a.abertoEm)}{a.ocorrencias && a.ocorrencias > 1 ? ` · ${a.ocorrencias} vezes` : ""}</p>
              {resolvendo === a.id ? (
                <form onSubmit={(e) => resolver(e, a.id)} className="grid gap-2">
                  <label htmlFor={`motivo-${a.id}`} className="text-sm font-semibold">O que foi feito?</label>
                  <textarea id={`motivo-${a.id}`} name="motivo" rows={2} maxLength={500} className="rounded-campo border-2 border-tinta bg-branco p-2 text-base" />
                  {erro && <p role="alert" className="m-0 text-sm font-semibold text-erro">{erro}</p>}
                  <div className="flex gap-2"><Botao type="submit" variante="contorno">Marcar como resolvido</Botao><Botao variante="link" onClick={() => setResolvendo(null)}>Voltar</Botao></div>
                </form>
              ) : (
                <Botao variante="link" className="justify-self-start" onClick={() => setResolvendo(a.id)}>Resolver</Botao>
              )}
            </li>
          ))}
        </ul>
      )}
    </Caixa>
  );
}
