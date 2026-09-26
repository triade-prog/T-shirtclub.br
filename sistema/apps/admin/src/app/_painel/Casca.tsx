"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cx } from "@tshirtclub/ui";
import { chamarApi } from "@/lib/api";

// Casca do painel: menu das telas prontas e "Sair". As demais telas do protótipo (catálogo,
// estoque, promoções, pagamentos em análise, bloqueados, WhatsApp, auditoria e conta) entram
// no menu quando ficarem prontas.

const MENU = [
  { href: "/", rotulo: "Início" },
  { href: "/reservas", rotulo: "Reservas" },
  { href: "/cancelamentos", rotulo: "Cancelamentos" },
  { href: "/entregas", rotulo: "Entregas e frete" },
];

export function Casca({ titulo, acoes, children }: { titulo: string; acoes?: React.ReactNode; children: React.ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();

  async function sair() {
    await chamarApi("v1/admin/auth/logout", {});
    router.replace("/entrar");
  }

  return (
    <div className="grid gap-6 px-4 pb-12 pt-4">
      <nav aria-label="Painel" className="-mx-4 flex gap-1 overflow-x-auto border-b border-linha px-4 pb-2">
        {MENU.map((m) => {
          const ativo = m.href === "/" ? caminho === "/" : caminho.startsWith(m.href);
          return (
            <Link key={m.href} href={m.href} aria-current={ativo ? "page" : undefined}
              className={cx("inline-flex min-h-11 flex-none items-center rounded-pilula px-4 text-sm font-semibold",
                ativo ? "border-2 border-tinta bg-citrino text-no-citrino" : "hover:bg-algodao")}>
              {m.rotulo}
            </Link>
          );
        })}
        <button type="button" onClick={sair} className="ml-auto inline-flex min-h-11 flex-none items-center gap-2 rounded-pilula px-4 text-sm font-semibold hover:bg-algodao">
          <LogOut aria-hidden="true" className="size-4" /> Sair
        </button>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="tc-titulo m-0 text-[clamp(32px,4vw,44px)]">{titulo}</h1>
        {acoes}
      </div>
      {children}
    </div>
  );
}

/** Caixa com contorno de adesivo, a unidade das telas do painel. */
export function Caixa({ titulo, children, className }: { titulo?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("grid gap-3 rounded-cartao border-2 border-tinta bg-branco p-4 shadow-adesivo-sm", className)}>
      {titulo && <h2 className="m-0 text-lg font-bold">{titulo}</h2>}
      {children}
    </section>
  );
}
