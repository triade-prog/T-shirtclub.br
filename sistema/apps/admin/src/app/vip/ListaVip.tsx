"use client";

import { useState } from "react";
import { chamarApi, dataHora, mensagemDeErro, telefone } from "@/lib/api";
import { Casca } from "../_painel/Casca";
import { Aviso, Botao, Campo, Carregando, Escolha, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Lista VIP (sem referência V4, no estilo do painel V4): quem aceitou receber novidades pelo
// WhatsApp, pelo pop-up ou pelo rodapé da loja. Exportar (planilha CSV) fica na auditoria; tirar
// da lista apaga o contato (a pedido da cliente). O cupom de boas-vindas é um cupom de Promoções.

interface Contato { id: string; telefone: string; nome: string | null; origem: "POPUP" | "RODAPE"; em: string }
interface Config {
  cupom: string | null; valendo: boolean; contatos: number;
  cupons: { codigo: string; nome: string; modo: "PERCENTUAL" | "VALOR"; valor: number; situacao: "AGENDADA" | "ATIVA" | "ENCERRADA" }[];
}
const ORIGEM = { POPUP: "Pop-up", RODAPE: "Rodapé" } as const;

function csv(linhas: Omit<Contato, "id">[]): string {
  const c = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ["WhatsApp;Nome;Origem;Aceite", ...linhas.map((l) => [l.telefone, l.nome ?? "", ORIGEM[l.origem], dataHora(l.em)].map(c).join(";"))].join("\r\n");
}

export function ListaVip() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const q = new URLSearchParams({ pagina: String(pagina), ...(busca.trim() ? { q: busca.trim() } : {}) });
  const lista = useDados<{ total: number; itens: Contato[] }>(`v1/admin/vip?${q}`);
  const config = useDados<Config>("v1/admin/vip/config");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function exportar() {
    setOcupado("exportar");
    const r = await chamarApi<Omit<Contato, "id">[]>("v1/admin/vip/export", {});
    setOcupado(null);
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    // BOM para o Excel abrir os acentos certos
    const url = URL.createObjectURL(new Blob(["﻿" + csv(r.dados)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `lista-vip-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function remover(c: Contato) {
    if (!confirm(`Tirar ${c.nome ?? telefone(c.telefone)} da Lista VIP? O contato é apagado.`)) return;
    setOcupado(c.id);
    const r = await chamarApi(`v1/admin/vip/${c.id}`, undefined, "DELETE");
    setOcupado(null);
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    await Promise.all([lista.recarregar(), config.recarregar()]);
  }

  async function mudarCupom(codigo: string) {
    setOcupado("cupom");
    const r = await chamarApi("v1/admin/vip/config", { cupom: codigo || null }, "PUT");
    setOcupado(null);
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    await config.recarregar();
  }

  const total = lista.dados?.total ?? 0;
  return (
    <Casca kicker="CLIENTES" titulo="Lista VIP"
      sub="Quem aceitou receber novidades, drops e ofertas pelo WhatsApp, pelo pop-up ou pelo rodapé da loja.">
      {erro && <Aviso tipo="error" titulo={erro} />}
      <div className="grid split">
        <div>
          <div className="board-toolbar">
            <Campo rotulo="Buscar por nome ou número" value={busca} maxLength={60} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
            <Botao variante="ghost" carregando={ocupado === "exportar"} onClick={() => void exportar()} disabled={!config.dados?.contatos}>Exportar planilha</Botao>
          </div>
          {!lista.dados ? <Carregando erro={lista.erro} /> : lista.dados.itens.length === 0 ? (
            <p className="muted loading">{busca.trim() ? "Ninguém com esse nome ou número." : "A lista ainda está vazia."}</p>
          ) : (
            <ul className="list" aria-label="Contatos da Lista VIP">
              {lista.dados.itens.map((c) => (
                <li key={c.id} className="row">
                  <Selo tom={c.origem === "POPUP" ? "reserved" : "ship"}>{ORIGEM[c.origem]}</Selo>
                  <div>
                    <b>{c.nome ?? "Sem nome"}</b>
                    <p className="meta">{telefone(c.telefone)} · aceitou em {dataHora(c.em)}</p>
                  </div>
                  <Botao variante="ghost" carregando={ocupado === c.id} onClick={() => void remover(c)} aria-label={`Tirar ${c.nome ?? telefone(c.telefone)} da lista`}>Tirar da lista</Botao>
                </li>
              ))}
            </ul>
          )}
          {total > 50 && (
            <div className="actions mt">
              <Botao variante="ghost" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Botao>
              <span className="muted">Página {pagina} de {Math.ceil(total / 50)}</span>
              <Botao variante="ghost" disabled={pagina * 50 >= total} onClick={() => setPagina((p) => p + 1)}>Próxima</Botao>
            </div>
          )}
        </div>
        <aside className="card flat" aria-label="Cupom de boas-vindas">
          <h2>Cupom de boas-vindas</h2>
          {!config.dados ? <Carregando erro={config.erro} /> : (
            <>
              <div className="rule">
                <div><strong>{config.dados.contatos}</strong><span>{config.dados.contatos === 1 ? "contato" : "contatos"}</span></div>
              </div>
              <Escolha rotulo="Cupom mostrado a quem entra" value={config.dados.cupom ?? ""} disabled={ocupado === "cupom"}
                onChange={(e) => void mudarCupom(e.target.value)}
                opcoes={[["", "Nenhum cupom"], ...config.dados.cupons.map((c) =>
                  [c.codigo, `${c.codigo} · ${c.modo === "PERCENTUAL" ? `${c.valor}%` : `R$ ${(c.valor / 100).toFixed(2).replace(".", ",")}`} · ${c.situacao === "ATIVA" ? "valendo" : c.situacao === "AGENDADA" ? "agendado" : "encerrado"}`] as const)]}
                ajuda="O cupom é criado em Promoções. A loja só mostra enquanto ele estiver valendo e com unidades." />
              {config.dados.cupom && (config.dados.valendo
                ? <p className="field-help mt"><Selo tom="paid">Valendo</Selo> O pop-up e o rodapé mostram o benefício; o código aparece para quem entra.</p>
                : <p className="field-help mt"><Selo tom="issue">Não está valendo</Selo> Fora do período ou sem unidades: a loja não mostra cupom.</p>)}
              <p className="field-help mt">Para sair da lista, a cliente pede pelo WhatsApp; aqui você tira o contato e ele é apagado.</p>
            </>
          )}
        </aside>
      </div>
    </Casca>
  );
}
