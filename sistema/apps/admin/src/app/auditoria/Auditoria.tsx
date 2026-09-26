"use client";

import Link from "next/link";
import { useState } from "react";
import { dataHora } from "@/lib/api";
import { ASSUNTO, AUTOR, textoAcao } from "@/lib/rotulos";
import { Casca } from "../_painel/Casca";
import { Botao, Carregando, Escolha } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Auditoria (tela 21 do protótipo; sem referência V4, no estilo do painel V4): o registro é
// permanente, 50 por página, do mais novo para o mais antigo.

interface Registro {
  id: string; em: string; ator: string; atorNome?: string; assunto: string; acao: string;
  entidade?: string; entidadeId?: string; reservaId?: string; reservaNumero?: number; dados?: Record<string, unknown>;
}
interface Pagina { itens: Registro[]; pagina: number; porPagina: number; total: number }

const AUTORES = [["", "Todos os autores"], ["SISTEMA", "Sistema"], ["ADMIN", "Loja"], ["CLIENTE", "Cliente"], ["PROVEDOR", "Provedor"]] as const;
const ASSUNTOS = [["", "Todos os assuntos"], ...["RESERVA", "PAGAMENTO", "ESTOQUE", "CATALOGO", "PROMOCAO", "BLOQUEIO", "WHATSAPP", "ACESSO"].map((a) => [a, ASSUNTO[a]!] as const)] as const;
const PERIODOS = [["", "Todo o período"], ["HOJE", "Hoje"], ["7_DIAS", "Últimos 7 dias"], ["30_DIAS", "Últimos 30 dias"]] as const;

/** Motivo ou nota registrados junto da ação, quando houver. */
function detalhe(d: Registro["dados"]): string | null {
  const v = d?.motivo ?? d?.nota ?? d?.observacao;
  return typeof v === "string" && v ? v : null;
}

export function Auditoria() {
  const [filtros, setFiltros] = useState({ autor: "", assunto: "", periodo: "HOJE" });
  const [pagina, setPagina] = useState(1);
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)), pagina: String(pagina) });
  const { dados, erro } = useDados<Pagina>(`v1/admin/audit?${q}`);
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;
  const mudar = (campo: keyof typeof filtros) => (e: React.ChangeEvent<HTMLSelectElement>) => { setFiltros({ ...filtros, [campo]: e.target.value }); setPagina(1); };

  return (
    <Casca kicker="SEGURANÇA" titulo="Auditoria"
      sub="Tudo o que o sistema, a loja, as clientes e os provedores fizeram. O registro é permanente: não pode ser editado nem apagado, nem quando um contador é zerado.">
      <div className="filters">
        <Escolha rotulo="Quem" opcoes={AUTORES} value={filtros.autor} onChange={mudar("autor")} />
        <Escolha rotulo="Assunto" opcoes={ASSUNTOS} value={filtros.assunto} onChange={mudar("assunto")} />
        <Escolha rotulo="Período" opcoes={PERIODOS} value={filtros.periodo} onChange={mudar("periodo")} />
      </div>
      {!dados ? <Carregando erro={erro} /> : dados.itens.length === 0 ? (
        <p className="muted loading">Nada registrado com esses filtros.</p>
      ) : (
        <>
          <ol className="list" aria-label="Registros da auditoria">
            {dados.itens.map((r) => (
              <li key={r.id} className="row">
                <span className="micro muted">{dataHora(r.em)}</span>
                <div>
                  <b>{textoAcao(r.acao)}</b>
                  <p className="meta">
                    {r.atorNome ?? AUTOR[r.ator] ?? r.ator} · {ASSUNTO[r.assunto] ?? r.assunto}
                    {detalhe(r.dados) ? ` · “${detalhe(r.dados)}”` : ""}
                  </p>
                </div>
                <span className="audit-ref">
                  {r.reservaId ? <Link href={`/reservas/${r.reservaId}`}>#{r.reservaNumero}</Link> : r.entidade ? r.entidade.replace(/_/g, " ") : ""}
                </span>
              </li>
            ))}
          </ol>
          <nav className="pager" aria-label="Páginas da auditoria">
            <Botao variante="ghost" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Mais novos</Botao>
            <span>Página {dados.pagina} de {paginas} · {dados.total} {dados.total === 1 ? "registro" : "registros"}</span>
            <Botao variante="ghost" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Mais antigos</Botao>
          </nav>
        </>
      )}
    </Casca>
  );
}
