"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatarReais, normalizarTelefone, textoCupom, type MotivoCupom } from "@tshirtclub/domain";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { paraCentavos } from "@/lib/catalogo";
import { NOME_TAMANHO, type Tamanho } from "@/lib/tiposCatalogo";
import { Casca } from "../../_painel/Casca";
import { Aviso, Botao, Campo, Escolha } from "../../_painel/ui";
import { useEnvio } from "../../_painel/useEnvio";
import { useTodosProdutos } from "../../_painel/useTodosProdutos";

// Reserva manual (0470): a equipe cadastra a reserva de quem pediu pelo WhatsApp, Instagram ou na
// loja. Pelo link, a cliente recebe a mensagem e paga no site; já paga (dinheiro, PIX na conta da
// loja ou maquininha), a reserva nasce paga. O preço é o do site; o desconto da loja pede motivo.

type Pagamento = "LINK" | "DINHEIRO" | "PIX_DIRETO" | "MAQUININHA";
const PAGAMENTOS: { valor: Pagamento; texto: string; ajuda: string }[] = [
  { valor: "LINK", texto: "Cliente paga pelo link", ajuda: "Ela recebe a reserva no WhatsApp e paga por PIX ou cartão no site em até 60 minutos." },
  { valor: "DINHEIRO", texto: "Já pago em dinheiro", ajuda: "A reserva nasce paga, baixa o estoque e entra no faturamento." },
  { valor: "PIX_DIRETO", texto: "Já pago por PIX na conta da loja", ajuda: "A reserva nasce paga, baixa o estoque e entra no faturamento." },
  { valor: "MAQUININHA", texto: "Já pago na maquininha", ajuda: "A reserva nasce paga, baixa o estoque e entra no faturamento." },
];

interface Linha { produtoId: string; varianteId: string; nome: string; tamanho: Tamanho; qtd: number; disponivel: number }
interface Cotacao {
  subtotalCentavos: number; descontoCentavos: number; descontoManualCentavos: number; totalCentavos: number;
  aplicada: { rotulo: string; descontoCentavos: number } | null;
  cupom: { situacao: "APLICADO" | "NAO_E_O_MELHOR" | "INVALIDO"; motivo?: MotivoCupom; gastoMinimoCentavos?: number } | null;
}

export function NovaReserva() {
  const router = useRouter();
  const { produtos, erro: erroProdutos } = useTodosProdutos();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [busca, setBusca] = useState("");
  const [telefone, setTelefone] = useState("");
  const [pagamento, setPagamento] = useState<Pagamento>("LINK");
  const [cupom, setCupom] = useState("");
  const [desconto, setDesconto] = useState("");
  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [erroCotacao, setErroCotacao] = useState<string | null>(null);
  const { ocupado, erro, setErro, enviar } = useEnvio<{ reserva: { id: string } }>((d) => router.push(`/reservas/${d.reserva.id}`));

  const descontoCentavos = desconto.trim() ? paraCentavos(desconto) : 0;
  const telefoneOk = normalizarTelefone(telefone);
  const e164 = telefoneOk.ok ? telefoneOk.e164 : undefined;
  const itens = linhas.map((l) => ({ produtoId: l.produtoId, varianteId: l.varianteId, qtd: l.qtd }));
  const chave = JSON.stringify([itens, cupom.trim(), descontoCentavos, e164]);

  // O total sai da api-admin, com o mesmo motor de preço do site e o histórico do telefone
  useEffect(() => {
    if (itens.length === 0 || descontoCentavos === null) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await chamarApi<Cotacao>("v1/admin/reservations/quote", {
        itens, cupom: cupom.trim() || undefined, telefone: e164, descontoManualCentavos: descontoCentavos,
      });
      if (!vivo) return;
      if (r.ok) { setCotacao(r.dados); setErroCotacao(null); } else { setCotacao(null); setErroCotacao(mensagemDeErro(r.codigo, r.detalhes)); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave resume itens, cupom, desconto e telefone
  }, [chave]);

  // Sem peças (ou com o desconto mal digitado), a última cotação não vale
  const pronta = itens.length > 0 && descontoCentavos !== null;
  const total = pronta ? cotacao : null;
  const falhaTotal = pronta ? erroCotacao : null;
  const q = busca.trim().toLowerCase();
  const vitrine = (produtos ?? []).filter((p) => p.ativo && p.publicado && (!q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)));

  function adicionar(produtoId: string, varianteId: string, nome: string, tamanho: Tamanho, disponivel: number) {
    setLinhas((ls) => ls.some((l) => l.varianteId === varianteId)
      ? ls.map((l) => (l.varianteId === varianteId ? { ...l, qtd: Math.min(l.qtd + 1, 2, disponivel) } : l))
      : [...ls, { produtoId, varianteId, nome, tamanho, qtd: 1, disponivel }]);
  }

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get("nome") ?? "").trim();
    const motivo = String(f.get("motivo") ?? "").trim();
    if (nome.length < 2) return setErro("Informe o nome da cliente.");
    if (!e164) return setErro("Confira o WhatsApp da cliente: DDD + celular com 9 dígitos.");
    if (linhas.length === 0) return setErro("Escolha pelo menos uma peça.");
    if (descontoCentavos === null) return setErro("Confira o desconto da loja, em reais (ex.: 10,00).");
    if (descontoCentavos > 0 && motivo.length < 3) return setErro("Escreva o motivo do desconto da loja: ele fica na auditoria.");
    if (!total) return setErro(falhaTotal ?? "Aguarde o total ser calculado.");
    void enviar(chamarApi("v1/admin/reservations", {
      nome, telefone: e164, entrega: String(f.get("entrega")), pagamento, itens,
      cupom: cupom.trim() || undefined, descontoManualCentavos: descontoCentavos,
      motivoDesconto: descontoCentavos > 0 ? motivo : undefined, totalEsperadoCentavos: total.totalCentavos,
    }));
  }

  const ajudaPagamento = PAGAMENTOS.find((p) => p.valor === pagamento)!.ajuda;
  return (
    <Casca kicker="PEDIDOS" titulo="Nova reserva" sub="Para quem pediu pelo WhatsApp, pelo Instagram ou na loja. O preço é o do site."
      acoes={<Link className="btn btn-ghost" href="/reservas">← Reservas</Link>}>
      <form className="grid" onSubmit={salvar} noValidate>
        <article className="card">
          <h2>Cliente</h2>
          <div className="form-grid">
            <Campo name="nome" rotulo="Nome da cliente" autoComplete="off" maxLength={60} />
            <Campo name="telefone" rotulo="WhatsApp da cliente" type="tel" inputMode="tel" autoComplete="off" placeholder="(77) 99812-8809" maxLength={20}
              value={telefone} onChange={(e) => setTelefone(e.target.value)}
              ajuda="As mensagens da reserva vão para este número." />
          </div>
        </article>

        <article className="card">
          <h2>Peças</h2>
          <input className="input" type="search" aria-label="Buscar peça por nome ou código" placeholder="Buscar por nome ou código"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="picker" role="list" aria-label="Peças à venda">
            {erroProdutos ? <p role="alert" className="field-error">{erroProdutos}</p> : !produtos ? <p className="loading">Carregando peças…</p>
              : vitrine.length === 0 ? <p className="loading">Nenhuma peça.</p> : vitrine.map((p) => (
                <div key={p.id} role="listitem" className="kv-row">
                  <span>{p.nome} <span className="muted">· {p.codigo} · {formatarReais(p.precoCentavos)}</span></span>
                  <span className="actions">
                    {p.tamanhos.filter((t) => t.ativa).map((t) => (
                      <Botao key={t.id} variante="ghost" disabled={t.disponivel < 1}
                        aria-label={`Adicionar ${p.nome}, ${NOME_TAMANHO[t.tamanho]}`}
                        onClick={() => adicionar(p.id, t.id, p.nome, t.tamanho, t.disponivel)}>
                        + {NOME_TAMANHO[t.tamanho]} {t.disponivel < 1 ? "(esgotado)" : `(${t.disponivel})`}
                      </Botao>
                    ))}
                  </span>
                </div>
              ))}
          </div>
          {linhas.length > 0 && (
            <ul className="list" aria-label="Peças da reserva">
              {linhas.map((l) => (
                <li key={l.varianteId} className="kv-row">
                  <span>{l.nome} · {NOME_TAMANHO[l.tamanho]}</span>
                  <span className="actions">
                    <select className="select" aria-label={`Quantidade de ${l.nome}`} value={l.qtd}
                      onChange={(e) => setLinhas((ls) => ls.map((x) => (x.varianteId === l.varianteId ? { ...x, qtd: Number(e.target.value) } : x)))}>
                      {Array.from({ length: Math.min(2, l.disponivel) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <Botao variante="ghost" aria-label={`Tirar ${l.nome}`} onClick={() => setLinhas((ls) => ls.filter((x) => x.varianteId !== l.varianteId))}>Tirar</Botao>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card">
          <h2>Entrega e pagamento</h2>
          <div className="form-grid">
            <Escolha name="entrega" rotulo="Entrega" defaultValue="RETIRADA"
              opcoes={[["RETIRADA", "Retirada na loja"], ["MOTOBOY", "Motoboy"], ["ENVIO", "Envio"]]}
              ajuda="Motoboy e envio: a cliente informa o endereço no site, e a loja calcula o frete." />
          </div>
          <fieldset className="field">
            <legend>Pagamento</legend>
            {PAGAMENTOS.map((p) => (
              <label key={p.valor} className="check">
                <input type="radio" name="pagamento" value={p.valor} checked={pagamento === p.valor} onChange={() => setPagamento(p.valor)} /> {p.texto}
              </label>
            ))}
            <span className="field-help">{ajudaPagamento}</span>
          </fieldset>
        </article>

        <article className="card">
          <h2>Cupom e desconto da loja</h2>
          <div className="form-grid form-grid3">
            <Campo name="cupom" rotulo="Cupom (opcional)" maxLength={20} autoComplete="off" value={cupom} onChange={(e) => setCupom(e.target.value.toUpperCase())}
              erro={cotacao?.cupom?.situacao === "INVALIDO" ? textoCupom(cotacao.cupom.motivo, { gastoMinimoCentavos: cotacao.cupom.gastoMinimoCentavos }) : undefined}
              ajuda={cotacao?.cupom?.situacao === "NAO_E_O_MELHOR" ? "A promoção já dá um desconto maior; o cupom não é usado." : undefined} />
            <Campo name="desconto" rotulo="Desconto da loja (R$, opcional)" inputMode="decimal" maxLength={10} value={desconto} onChange={(e) => setDesconto(e.target.value)}
              erro={descontoCentavos === null ? "Use reais e centavos, como 10,00." : undefined}
              ajuda="Depois da promoção. A cliente vê “Desconto da loja”." />
            <Campo name="motivo" rotulo="Motivo do desconto" maxLength={200} autoComplete="off"
              ajuda="Obrigatório com desconto. Fica na auditoria; a cliente não vê." />
          </div>
        </article>

        <article className="card" aria-live="polite">
          <h2>Total</h2>
          {falhaTotal ? <Aviso tipo="error" titulo={falhaTotal} /> : !total ? <p className="muted">Escolha as peças para ver o total.</p> : (
            <div className="kv">
              <div className="kv-row"><span>Subtotal</span><b>{formatarReais(total.subtotalCentavos)}</b></div>
              {total.aplicada && <div className="kv-row discount"><span>{total.aplicada.rotulo}</span><b>− {formatarReais(total.aplicada.descontoCentavos)}</b></div>}
              {total.descontoManualCentavos > 0 && <div className="kv-row discount"><span>Desconto da loja</span><b>− {formatarReais(total.descontoManualCentavos)}</b></div>}
              <div className="kv-row"><span>Total</span><b className="price-total">{formatarReais(total.totalCentavos)}</b></div>
            </div>
          )}
          {erro && <Aviso tipo="error" titulo={erro} />}
          <div className="actions">
            <Botao type="submit" carregando={ocupado}>{pagamento === "LINK" ? "Criar reserva e enviar o link" : "Registrar venda paga"}</Botao>
          </div>
        </article>
      </form>
    </Casca>
  );
}
