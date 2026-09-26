"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { Aviso, Botao, Campo, cx } from "@tshirtclub/ui";
import { dataHora, telefone } from "@/lib/api";
import { STATUS_RESERVA, SUBSTATUS } from "@/lib/rotulos";
import { Casca } from "../_painel/Casca";
import { useDados } from "../_painel/useDados";

interface Linha {
  id: string; numero: number; status: string; nome: string; telefone: string; totalCentavos: number; pecas?: number;
  criadaEm: string; expiraEm?: string; substatus?: string; cancelamentoPendente?: boolean;
}
interface Pagina { itens: Linha[]; pagina: number; porPagina: number; total: number }

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
    <Casca titulo="Reservas">
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); ir({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim(), page: "" }); }}
        className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end"
      >
        <Campo name="q" rotulo="Número, telefone ou nome" defaultValue={q} maxLength={60} />
        <div className="grid gap-1.5">
          <label htmlFor="status" className="text-[15px] font-semibold">Estado</label>
          <select id="status" value={status} onChange={(e) => ir({ status: e.target.value, page: "" })}
            className="min-h-13 rounded-campo border-2 border-tinta bg-branco px-3 text-base">
            <option value="">Todos</option>
            {["RESERVADO", "PAGAMENTO_CONFIRMADO", "ENTREGUE", "EXPIRADO"].map((s) => <option key={s} value={s}>{STATUS_RESERVA[s]}</option>)}
          </select>
        </div>
        <Botao type="submit">Buscar</Botao>
      </form>

      {erro && <Aviso tipo="erro" titulo={erro} />}
      {!dados ? <p role="status" className="m-0 text-tinta-suave">Carregando…</p> : dados.itens.length === 0 ? (
        <p className="m-0 text-tinta-suave">Nenhuma reserva encontrada.</p>
      ) : (
        <>
          <p className="m-0 text-sm text-tinta-suave" role="status">{dados.total} {dados.total === 1 ? "reserva" : "reservas"}</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {dados.itens.map((r) => (
              <li key={r.id}>
                <Link href={`/reservas/${r.id}`} className="grid gap-1 rounded-campo border-2 border-tinta bg-branco p-3 hover:bg-citrino md:grid-cols-[90px_1.4fr_1fr_1fr_auto] md:items-center md:gap-3">
                  <b className="font-display text-xl font-extrabold">#{r.numero}</b>
                  <span><b>{r.nome}</b><span className="block text-sm text-tinta-suave">{telefone(r.telefone)}</span></span>
                  <span className={cx("text-sm font-bold", r.status === "EXPIRADO" && "font-normal text-tinta-suave")}>
                    {STATUS_RESERVA[r.status] ?? r.status}
                    {r.substatus && <span className="block font-normal">{SUBSTATUS[r.substatus] ?? r.substatus}</span>}
                    {r.cancelamentoPendente && <span className="block font-bold text-erro">Cancelamento pedido</span>}
                  </span>
                  <span className="text-sm">{r.pecas ? `${r.pecas} peças · ` : ""}{formatarReais(r.totalCentavos)}</span>
                  <span className="text-sm text-tinta-suave">{dataHora(r.criadaEm)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav aria-label="Páginas" className="flex items-center gap-3">
              <Botao variante="contorno" disabled={page <= 1} onClick={() => ir({ page: String(page - 1) })}>Anterior</Botao>
              <span className="text-sm">Página {page} de {paginas}</span>
              <Botao variante="contorno" disabled={page >= paginas} onClick={() => ir({ page: String(page + 1) })}>Próxima</Botao>
            </nav>
          )}
        </>
      )}
    </Casca>
  );
}
