"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { dataHora, telefone } from "@/lib/api";
import { STATUS_RESERVA, SUBSTATUS } from "@/lib/rotulos";
import { Casca, Icone } from "../_painel/Casca";
import { Botao, Carregando, Selo, tomDoStatus } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Reservas (tela 04 da V4): busca por número, telefone ou nome, filtro por estado e páginas.

interface Linha {
  id: string; numero: number; status: string; nome: string; telefone: string; totalCentavos: number; pecas?: number;
  criadaEm: string; substatus?: string; cancelamentoPendente?: boolean;
}
interface Pagina { itens: Linha[]; pagina: number; porPagina: number; total: number }

const COR_ID: Record<string, React.CSSProperties> = {
  PAGAMENTO_CONFIRMADO: { background: "var(--green-soft)", color: "var(--green)" },
  ENTREGUE: { background: "var(--blue-soft)", color: "#1d4e9a" },
  EXPIRADO: { background: "#f3eded", color: "#7d676f" },
};

export function Reservas() {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const status = busca.get("status") ?? "";
  const q = busca.get("q") ?? "";
  const page = Number(busca.get("page") ?? "1") || 1;
  const consulta = new URLSearchParams({ ...(status && { status }), ...(q && { q }), page: String(page) });
  const { dados, erro } = useDados<Pagina>(`v1/admin/reservations?${consulta}`);

  function ir(mudar: Record<string, string>) {
    const u = new URLSearchParams({ ...(status && { status }), ...(q && { q }), ...mudar });
    for (const [k, v] of [...u]) if (!v) u.delete(k);
    router.replace(`${caminho}?${u}`);
  }
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

  return (
    <Casca kicker="PEDIDOS" titulo="Reservas" sub="Busque por cliente ou acompanhe rapidamente o estado de cada reserva.">
      <section className="card flat">
        <form role="search" className="form-row" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          ir({ q: String(f.get("q") ?? "").trim(), status: String(f.get("status") ?? ""), page: "" });
        }}>
          <div className="field">
            <label htmlFor="q">Número, telefone ou nome</label>
            <input className="input" id="q" name="q" defaultValue={q} maxLength={60} placeholder="Ex.: Marina, 1042 ou telefone" />
          </div>
          <div className="field">
            <label htmlFor="status">Estado</label>
            <select className="select" id="status" name="status" defaultValue={status} onChange={(e) => ir({ status: e.target.value, page: "" })}>
              <option value="">Todos</option>
              {["RESERVADO", "PAGAMENTO_CONFIRMADO", "ENTREGUE", "EXPIRADO"].map((s) => <option key={s} value={s}>{STATUS_RESERVA[s]}</option>)}
            </select>
          </div>
          <Botao type="submit"><Icone><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icone> Buscar</Botao>
        </form>
      </section>

      {!dados ? <div style={{ marginTop: 20 }}><Carregando erro={erro} /></div> : (
        <>
          <div className="section-title">
            <h2>{dados.total} {dados.total === 1 ? "reserva" : "reservas"}</h2>
            <span>Mais recentes primeiro</span>
          </div>
          {dados.itens.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Nenhuma reserva encontrada.</p> : (
            <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {dados.itens.map((r) => (
                <li key={r.id}>
                  <Link className="reservation" href={`/reservas/${r.id}`}>
                    <div className="res-id" style={COR_ID[r.status]}>#{r.numero}</div>
                    <div className="res-main">
                      <b>{r.nome}</b>
                      <div className="meta">{telefone(r.telefone)}{r.pecas ? ` · ${r.pecas} ${r.pecas === 1 ? "peça" : "peças"}` : ""} · {formatarReais(r.totalCentavos)}</div>
                      <div style={{ display: "flex", gap: 7, marginTop: 7, flexWrap: "wrap" }}>
                        <Selo tom={tomDoStatus(r.status)}>{STATUS_RESERVA[r.status] ?? r.status}</Selo>
                        {r.substatus && r.status === "PAGAMENTO_CONFIRMADO" && <Selo tom="ship">{SUBSTATUS[r.substatus] ?? r.substatus}</Selo>}
                        {r.cancelamentoPendente && <Selo tom="issue">Cancelamento pedido</Selo>}
                      </div>
                    </div>
                    <div className="res-side">
                      <div className="amount">{formatarReais(r.totalCentavos)}</div>
                      <div className="date">{dataHora(r.criadaEm)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {paginas > 1 && (
            <nav aria-label="Páginas" className="actions" style={{ marginTop: 18, alignItems: "center" }}>
              <Botao variante="ghost" disabled={page <= 1} onClick={() => ir({ page: String(page - 1) })}>Anterior</Botao>
              <span style={{ fontSize: 11 }}>Página {page} de {paginas}</span>
              <Botao variante="ghost" disabled={page >= paginas} onClick={() => ir({ page: String(page + 1) })}>Próxima</Botao>
            </nav>
          )}
        </>
      )}
    </Casca>
  );
}
