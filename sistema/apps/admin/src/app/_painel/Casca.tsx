"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { chamarApi } from "@/lib/api";
import { useMenuRecolhido } from "./MenuRecolhido";
import { useDados } from "./useDados";
import { useRepetir } from "./useRepetir";

// Casca do painel V4 (docs/design/v4/painel): barra lateral com contadores, topo com o
// estado da operação e o cabeçalho de cada tela. No celular, a barra abre pelo menu; no
// computador, o botão do topo recolhe a barra para só os ícones (MenuRecolhido).

interface Contagem {
  reservas: { ativas: number };
  acoes: {
    cancelamentosPendentes: number; fretes: { aguardandoCalculo: number; vencidos: number }; emPreparacao: number;
    pagamentosEmAnalise: number; disputasAbertas: number; telefonesBloqueados: number;
  };
  whatsapp: { conectado: boolean };
}

const ICONES = {
  inicio: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />,
  operacao: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" /></>,
  reservas: <><path d="M6 4h12a2 2 0 0 1 2 2v14H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z" /><path d="M7 20a3 3 0 0 1 0-6h13" /></>,
  cancelamentos: <path d="m6 6 12 12M18 6 6 18" />,
  entregas: <><path d="m4 7 8-4 8 4-8 4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>,
  catalogo: <path d="m8 4 4 2 4-2 5 3-3 5-2-1v9H8v-9l-2 1-3-5Z" />,
  estoque: <><path d="M3 8h18v12H3Z" /><path d="M3 8l2-4h14l2 4M10 12h4" /></>,
  promocoes: <><path d="M4 12V4h8l8 8-8 8Z" /><circle cx="8.5" cy="8.5" r="1.5" /></>,
  pagamentos: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  contestacoes: <><path d="M12 3 3 20h18Z" /><path d="M12 10v4M12 17h.01" /></>,
  bloqueados: <><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></>,
  acessos: <><path d="M3 20h18" /><path d="M6 16v-5M11 16V7M16 16v-8M21 16v-3" /></>,
  vip: <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7Z" />,
  whatsapp: <path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12Z" />,
  auditoria: <><path d="M6 3h9l4 4v14H6Z" /><path d="M9 11h7M9 15h7M9 7h3" /></>,
  conta: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

export function Icone({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
}

export function Casca({ kicker, titulo, sub, topo, acoes, children }: {
  kicker: string;
  titulo: React.ReactNode;
  sub?: string;
  /** Texto da barra de cima (padrão: "Painel da loja"). */
  topo?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const { recolhido, alternar } = useMenuRecolhido();
  const { dados: c, recarregar } = useDados<Contagem>("v1/admin/dashboard");
  useRepetir(() => void recarregar(), 30_000, true);

  // Menu do celular: com ele aberto, o resto fica inerte; fecha tocando fora, no Esc ou ao navegar.
  useEffect(() => {
    document.body.classList.toggle("nav-open", aberto);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    if (aberto) document.addEventListener("keydown", esc);
    return () => { document.body.classList.remove("nav-open"); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  async function sair() {
    await chamarApi("v1/admin/auth/logout", {});
    router.replace("/entrar");
  }

  const menu = [
    { href: "/", rotulo: "Dashboard", icone: ICONES.inicio, n: 0 },
    // O que precisa de ação na Operação: cancelamentos, análises, contestações e fretes (a calcular ou vencidos)
    { href: "/operacao", rotulo: "Operação", icone: ICONES.operacao,
      n: c ? c.acoes.cancelamentosPendentes + c.acoes.pagamentosEmAnalise + c.acoes.disputasAbertas + c.acoes.fretes.aguardandoCalculo + c.acoes.fretes.vencidos : 0 },
    { href: "/reservas", rotulo: "Reservas", icone: ICONES.reservas, n: c?.reservas.ativas ?? 0 },
    { href: "/cancelamentos", rotulo: "Cancelamentos", icone: ICONES.cancelamentos, n: c?.acoes.cancelamentosPendentes ?? 0 },
    { href: "/entregas", rotulo: "Entregas e frete", icone: ICONES.entregas, n: c ? c.acoes.fretes.aguardandoCalculo + c.acoes.fretes.vencidos + c.acoes.emPreparacao : 0 },
    { href: "/catalogo", rotulo: "Catálogo", icone: ICONES.catalogo, n: 0 },
    { href: "/estoque", rotulo: "Estoque", icone: ICONES.estoque, n: 0 },
    { href: "/promocoes", rotulo: "Promoções", icone: ICONES.promocoes, n: 0 },
    { href: "/pagamentos", rotulo: "Pagamentos em análise", icone: ICONES.pagamentos, n: c?.acoes.pagamentosEmAnalise ?? 0 },
    { href: "/contestacoes", rotulo: "Contestações", icone: ICONES.contestacoes, n: c?.acoes.disputasAbertas ?? 0 },
    { href: "/bloqueados", rotulo: "Bloqueios", icone: ICONES.bloqueados, n: c?.acoes.telefonesBloqueados ?? 0 },
    { href: "/vip", rotulo: "Lista VIP", icone: ICONES.vip, n: 0 },
    { href: "/acessos", rotulo: "Acessos", icone: ICONES.acessos, n: 0 },
    { href: "/whatsapp", rotulo: "WhatsApp", icone: ICONES.whatsapp, n: 0 },
    { href: "/auditoria", rotulo: "Auditoria", icone: ICONES.auditoria, n: 0 },
    { href: "/conta", rotulo: "Minha conta", icone: ICONES.conta, n: 0 },
  ];

  return (
    <>
      <a className="skip" href="#main">Pular para o conteúdo</a>
      <div className={`panel-shell${recolhido ? " recolhido" : ""}`}>
        <aside className="sidebar" id="sidebar" aria-label="Menu do painel">
          <div className="brandbox">
            <Image src="/marca/logo-limao.webp" alt="T-shirt Club.br" width={132} height={58} priority />
            <span className="admin">Painel</span>
          </div>
          <nav className="nav" aria-label="Navegação principal">
            {menu.map((m) => {
              const ativo = m.href === "/" ? caminho === "/" : caminho.startsWith(m.href);
              return (
                <Link key={m.href} href={m.href} className={`nav-item${ativo ? " active" : ""}`} aria-current={ativo ? "page" : undefined} onClick={() => setAberto(false)} title={recolhido ? m.rotulo : undefined}>
                  <Icone>{m.icone}</Icone>
                  <span className="nav-rotulo">{m.rotulo}</span>
                  {m.n > 0 && <span className="nav-count"><span className="sr-only">: </span>{m.n}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="side-note">
            <span className="club-tag"><span className="dot" />LOJA ONLINE</span>
            <p><b>Você faz o Club.</b></p>
            <p>Operação, reservas e entregas em um painel com a mesma identidade da marca.</p>
            <button className="logout" type="button" onClick={sair}>Sair</button>
          </div>
        </aside>
        <div className="overlay" aria-hidden="true" onClick={() => setAberto(false)} />
        <div className="main" inert={aberto}>
          <header className="topbar">
            <div className="top-title">
              <button className="menu-btn icon-btn" type="button" aria-label={aberto ? "Fechar menu" : "Abrir menu"} aria-expanded={aberto} aria-controls="sidebar" onClick={() => setAberto(!aberto)}>
                <Icone><path d="M4 7h16M4 12h16M4 17h16" /></Icone>
              </button>
              <button className="recolher-btn icon-btn" type="button" aria-label={recolhido ? "Mostrar menu" : "Esconder menu"} aria-expanded={!recolhido} aria-controls="sidebar" title={recolhido ? "Mostrar menu" : "Esconder menu"} onClick={alternar}>
                <Icone><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />{recolhido ? <path d="m13 9 3 3-3 3" /> : <path d="m16 9-3 3 3 3" />}</Icone>
              </button>
              <b className="mobile-brand">T-shirt Club</b>
              <span>{topo ?? "Painel da loja"}</span>
            </div>
            <div className="top-actions">
              {c && (c.whatsapp.conectado
                ? <span className="status-live">Operação online</span>
                : <span className="status issue">WhatsApp desconectado</span>)}
              <div className="avatar" role="img" aria-label="Loja T-shirt Club">TC</div>
            </div>
          </header>
          <main className="content" id="main">
            <div className="page-head">
              <div>
                <div className="page-kicker">{kicker}</div>
                <h1 className="display">{titulo}</h1>
                {sub && <p className="sub">{sub}</p>}
              </div>
              {acoes && <div className="head-right">{acoes}</div>}
            </div>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
