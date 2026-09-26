"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { chamarApi } from "@/lib/api";
import { useDados } from "./useDados";
import { useRepetir } from "./useRepetir";

// Casca do painel V4 (docs/design/v4/painel): barra lateral com contadores, topo com o
// estado da operação e o cabeçalho de cada tela. No celular, a barra abre pelo menu.

interface Contagem {
  reservas: { ativas: number };
  acoes: { cancelamentosPendentes: number; fretes: { aguardandoCalculo: number; vencidos: number }; emPreparacao: number };
  whatsapp: { conectado: boolean };
}

const ICONES = {
  inicio: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />,
  reservas: <><path d="M6 4h12a2 2 0 0 1 2 2v14H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z" /><path d="M7 20a3 3 0 0 1 0-6h13" /></>,
  cancelamentos: <path d="m6 6 12 12M18 6 6 18" />,
  entregas: <><path d="m4 7 8-4 8 4-8 4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>,
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
    { href: "/", rotulo: "Início", icone: ICONES.inicio, n: 0 },
    { href: "/reservas", rotulo: "Reservas", icone: ICONES.reservas, n: c?.reservas.ativas ?? 0 },
    { href: "/cancelamentos", rotulo: "Cancelamentos", icone: ICONES.cancelamentos, n: c?.acoes.cancelamentosPendentes ?? 0 },
    { href: "/entregas", rotulo: "Entregas e frete", icone: ICONES.entregas, n: c ? c.acoes.fretes.aguardandoCalculo + c.acoes.fretes.vencidos + c.acoes.emPreparacao : 0 },
  ];

  return (
    <>
      <a className="skip" href="#main">Pular para o conteúdo</a>
      <div className="panel-shell">
        <aside className="sidebar" id="sidebar" aria-label="Menu do painel">
          <div className="brandbox">
            <Image src="/marca/logo.webp" alt="T-shirt Club.br" width={132} height={58} priority />
            <span className="admin">Painel</span>
          </div>
          <nav className="nav" aria-label="Navegação principal">
            {menu.map((m) => {
              const ativo = m.href === "/" ? caminho === "/" : caminho.startsWith(m.href);
              return (
                <Link key={m.href} href={m.href} className={`nav-item${ativo ? " active" : ""}`} aria-current={ativo ? "page" : undefined} onClick={() => setAberto(false)}>
                  <Icone>{m.icone}</Icone>
                  <span>{m.rotulo}</span>
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
