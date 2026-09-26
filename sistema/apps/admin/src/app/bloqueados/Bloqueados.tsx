"use client";

import Link from "next/link";
import { useState } from "react";
import { chamarApi, dataHora, telefone } from "@/lib/api";
import { DecisaoComMotivo } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Abas, Botao, Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Telefones bloqueados (tela 08 do protótipo; sem referência V4, no estilo do painel V4):
// 3 reservas expiradas em 30 dias bloqueiam novas reservas. Liberar zera o contador e mantém
// o histórico; manter registra a decisão. As duas pedem motivo.

interface Bloqueio {
  id: string; status: "ATIVO" | "LIBERADO"; criadoEm: string; liberadoEm?: string; motivoLiberacao?: string; telefone: string; nome?: string;
  reservas: { id: string; numero: number; expiradaEm: string }[] | null;
  decisoes: { decisao: "LIBERAR" | "MANTER"; motivo: string; em: string }[];
}

type Filtro = "ATIVO" | "LIBERADO" | "TODOS";

export function Bloqueados() {
  const [filtro, setFiltro] = useState<Filtro>("ATIVO");
  const { dados, erro, recarregar } = useDados<Bloqueio[]>(`v1/admin/phone-blocks?status=${filtro}`);

  return (
    <Casca kicker="CLIENTES" titulo="Telefones bloqueados"
      sub="3 reservas expiradas em 30 dias bloqueiam novas reservas. Liberar zera o contador e mantém o histórico.">
      <div className="grid split">
        <div>
          <Abas rotulo="Filtrar bloqueios" valor={filtro} aoMudar={setFiltro}
            opcoes={[{ valor: "ATIVO", texto: "Bloqueados", n: filtro === "ATIVO" ? dados?.length : undefined }, { valor: "LIBERADO", texto: "Liberados" }, { valor: "TODOS", texto: "Todos" }]} />
          {!dados ? <Carregando erro={erro} /> : dados.length === 0 ? (
            <p className="muted loading">{filtro === "ATIVO" ? "Nenhum telefone bloqueado." : "Nenhum bloqueio."}</p>
          ) : (
            <div className="list">{dados.map((b) => <CartaoBloqueio key={b.id} bloqueio={b} aoDecidir={() => void recarregar()} />)}</div>
          )}
        </div>
        <aside className="card flat" aria-label="Regra automática">
          <h2>Regra automática</h2>
          <div className="rule">
            <div><strong>3</strong><span>expirações</span></div>
            <div><strong>30</strong><span>dias de janela</span></div>
            <div><strong>0</strong><span>contador ao liberar</span></div>
          </div>
          <p className="field-help mt">Cancelamento aprovado pela loja não conta. O bloqueio vale só para novas reservas: as que já estão em andamento continuam.</p>
        </aside>
      </div>
    </Casca>
  );
}

function CartaoBloqueio({ bloqueio: b, aoDecidir }: { bloqueio: Bloqueio; aoDecidir: () => void }) {
  const [revisando, setRevisando] = useState(false);
  const ativo = b.status === "ATIVO";
  const reservas = b.reservas ?? [];
  const ultima = b.decisoes.at(-1);

  return (
    <section className={`card case${ativo ? " open" : ""}`} aria-label={`Bloqueio de ${b.nome ?? telefone(b.telefone)}`}>
      <div className="case-head">
        <div>
          <b className="pop">{b.nome ?? "Cliente"}</b>
          <p>{telefone(b.telefone)} · desde {dataHora(b.criadoEm)}</p>
        </div>
        {ativo ? <Selo tom="issue">Bloqueado</Selo> : <Selo tom="paid">Liberado</Selo>}
      </div>
      <div className="notice">
        <p className="big">{reservas.length} {reservas.length === 1 ? "reserva expirada" : "reservas expiradas"}</p>
        <p>
          {reservas.map((r, i) => (
            <span key={r.id}>{i > 0 && " · "}<Link className="btn-link" href={`/reservas/${r.id}`}>#{r.numero}</Link> em {dataHora(r.expiradaEm)}</span>
          ))}
        </p>
        {ultima && <p>Última decisão: {ultima.decisao === "LIBERAR" ? "liberado" : "mantido"} em {dataHora(ultima.em)}: “{ultima.motivo}”.</p>}
        {!ativo && b.liberadoEm && !ultima && <p>Liberado em {dataHora(b.liberadoEm)}{b.motivoLiberacao ? `: “${b.motivoLiberacao}”` : "."}</p>}
      </div>
      {ativo && (revisando ? (
        <DecisaoComMotivo rotulo="Motivo da decisão" placeholder="Obrigatório. Ex.: cliente explicou que o PIX não abriu"
          ajuda="Liberar permite novas reservas neste número na hora. Manter deixa o bloqueio e registra a revisão."
          aoDecidir={() => { setRevisando(false); aoDecidir(); }}
          opcoes={[
            { rotulo: "Liberar telefone", enviar: (motivo) => chamarApi(`v1/admin/phone-blocks/${b.id}/release`, { motivo }) },
            { rotulo: "Manter bloqueio", variante: "ghost", enviar: (motivo) => chamarApi(`v1/admin/phone-blocks/${b.id}/keep`, { motivo }) },
          ]} />
      ) : (
        <div className="actions"><Botao onClick={() => setRevisando(true)}>Revisar</Botao></div>
      ))}
    </section>
  );
}
