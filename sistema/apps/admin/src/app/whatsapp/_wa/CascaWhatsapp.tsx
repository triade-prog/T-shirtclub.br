"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { Casca } from "../../_painel/Casca";
import { useDados } from "../../_painel/useDados";
import { useRepetir } from "../../_painel/useRepetir";
import { haQuanto, tomDaEspera, type Chamado } from "./rotulos";

// WhatsApp em abas (0570, pedido da loja: "não parece um sistema"). Como os sistemas de
// atendimento (Zendesk, Octadesk, Blip): o trabalho do dia separado da configuração. A faixa do
// topo, em todas as abas, mostra a conexão e o que pede atenção, e cada número leva à aba certa.

export interface Ritmo { intervaloMinS: number; intervaloMaxS: number; tetoHora: number }
export interface ConfigWhatsapp {
  conectado: boolean; modoLancamento: boolean; ritmo: Ritmo; ritmoLancamento: Ritmo;
  fila: { pendentes: number; enviadasHoje: number; respostasHoje?: number; falhasHoje: number; descartadasHoje: number; maisAntigaPendente: string | null };
  notificacoes: { id: string; nome: string; quando: string; essencial: boolean; ligada: boolean }[];
}
export interface Chamados { abertos: Chamado[]; finalizados: Chamado[]; notas: { media: number | null; total: number } }

interface Contexto {
  config: ConfigWhatsapp | null; erroConfig: string | null; recarregarConfig: () => void;
  chamados: Chamados | null; recarregarChamados: () => void;
}
const ContextoWhatsapp = createContext<Contexto | null>(null);
export function useWhatsapp(): Contexto {
  const c = useContext(ContextoWhatsapp);
  if (!c) throw new Error("useWhatsapp fora da CascaWhatsapp");
  return c;
}

const ABAS = [
  { href: "/whatsapp", texto: "Atendimento" },
  { href: "/whatsapp/clubinha", texto: "Clubinha" },
  { href: "/whatsapp/mensagens", texto: "Mensagens automáticas" },
  { href: "/whatsapp/envios", texto: "Envios" },
  { href: "/whatsapp/configuracoes", texto: "Configurações" },
] as const;

export function CascaWhatsapp({ sub, children }: { sub: string; children: React.ReactNode }) {
  const caminho = usePathname();
  const config = useDados<ConfigWhatsapp>("v1/admin/whatsapp");
  const chamados = useDados<Chamados>("v1/admin/whatsapp/chamados");
  useRepetir(() => { void config.recarregar(); void chamados.recarregar(); }, 30_000, true);
  const contexto: Contexto = {
    config: config.dados, erroConfig: config.erro, recarregarConfig: () => void config.recarregar(),
    chamados: chamados.dados, recarregarChamados: () => void chamados.recarregar(),
  };

  return (
    <Casca kicker="MENSAGENS" titulo="WhatsApp" sub={sub}>
      <ContextoWhatsapp.Provider value={contexto}>
        <Faixa config={config.dados} chamados={chamados.dados} />
        <nav className="wa-abas" aria-label="Áreas do WhatsApp">
          {ABAS.map((a) => {
            const ativa = caminho === a.href;
            return <Link key={a.href} href={a.href} className={`wa-aba${ativa ? " ativa" : ""}`} aria-current={ativa ? "page" : undefined}>{a.texto}</Link>;
          })}
        </nav>
        {children}
      </ContextoWhatsapp.Provider>
    </Casca>
  );
}

function Faixa({ config, chamados }: { config: ConfigWhatsapp | null; chamados: Chamados | null }) {
  if (!config) return null;
  const abertos = chamados?.abertos ?? [];
  const semDono = abertos.filter((c) => c.status === "ABERTO").map((c) => c.abertoEm).sort()[0];
  const plural = (n: number, um: string, varios: string) => `${n === 1 ? um : varios}`;
  return (
    <>
      {!config.conectado && (
        <div className="notice error wa-desconectado" role="alert">
          <b>O WhatsApp da loja está desconectado.</b> As clientes não recebem o código e as mensagens esperam na fila.{" "}
          <Link className="btn-link" href="/whatsapp/configuracoes">Conectar agora</Link>
        </div>
      )}
      <section className="wa-faixa" aria-label="Resumo do WhatsApp">
        <Link href="/whatsapp/configuracoes" className={`wa-kpi wa-conexao${config.conectado ? " ok" : " off"}`}>
          <span className="wa-ponto" aria-hidden="true" />{config.conectado ? "Conectado" : "Desconectado"}
        </Link>
        <Link href="/whatsapp" className={`wa-kpi${abertos.length ? " destaque" : ""}`}>
          <b>{abertos.length}</b> {plural(abertos.length, "chamado aberto", "chamados abertos")}
        </Link>
        {semDono && (
          <Link href="/whatsapp" className={`wa-kpi ${tomDaEspera(semDono)}`}>
            <b>{haQuanto(semDono)}</b> esperando a equipe
          </Link>
        )}
        <Link href="/whatsapp/envios" className="wa-kpi"><b>{config.fila.enviadasHoje}</b> {plural(config.fila.enviadasHoje, "enviada hoje", "enviadas hoje")}</Link>
        <Link href="/whatsapp/envios?status=FILA" className="wa-kpi"><b>{config.fila.pendentes}</b> na fila</Link>
        <Link href="/whatsapp/envios?status=FALHOU" className={`wa-kpi${config.fila.falhasHoje ? " urgente" : ""}`}>
          <b>{config.fila.falhasHoje}</b> {plural(config.fila.falhasHoje, "falha hoje", "falhas hoje")}
        </Link>
      </section>
    </>
  );
}
