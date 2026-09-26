"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { dataHora, telefone } from "@/lib/api";
import { MODALIDADE, SUBSTATUS } from "@/lib/rotulos";
import { AcoesEntrega, FormFrete } from "../_painel/acoes";
import { Casca } from "../_painel/Casca";
import { Aviso, Carregando, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";

// Entregas e frete (tela 08 da V4): uma aba por etapa, calcular frete, preparar e entregar.

interface Item {
  modalidade?: string; substatus: string; endereco?: Record<string, string>; codigoRetirada?: string; rastreio?: string;
  frete?: { valorCentavos: number; pagarAte?: string; pagoEm?: string };
  reserva: { id: string; numero: number; nome: string; telefone: string; totalCentavos: number; pagaEm: string };
  disputaAberta?: boolean;
}

const ETAPAS = ["", "AGUARDANDO_CALCULO_FRETE", "AGUARDANDO_PAGAMENTO_FRETE", "FRETE_VENCIDO", "EM_PREPARACAO", "PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO", "AGUARDANDO_MODALIDADE"];

export function Entregas() {
  const router = useRouter();
  const caminho = usePathname();
  const substatus = useSearchParams().get("substatus") ?? "";
  // Uma busca só (todos os pedidos pagos); a aba filtra aqui e mostra a contagem de cada etapa.
  const { dados: todas, erro, recarregar } = useDados<Item[]>("v1/admin/fulfillments");
  const dados = todas && (substatus ? todas.filter((f) => f.substatus === substatus) : todas);
  const conta = (s: string) => (todas ?? []).filter((f) => f.substatus === s).length;
  const atualizar = () => void recarregar();

  return (
    <Casca kicker="LOGÍSTICA" titulo={<>Entregas <em style={{ color: "var(--pink-dark)" }}>e frete</em></>}
      sub="Acompanhe fretes, preparação e entrega sem misturar os estados do pedido.">
      <nav className="tabs" aria-label="Etapas da entrega">
        {ETAPAS.map((s) => {
          const n = s ? conta(s) : 0;
          return (
            <button key={s || "todas"} type="button" className={`tab${substatus === s ? " active" : ""}`} aria-pressed={substatus === s}
              onClick={() => router.replace(s ? `${caminho}?substatus=${s}` : caminho)}>
              {s ? SUBSTATUS[s] : "Todas"}{n > 0 && <span className="n">{n}</span>}
            </button>
          );
        })}
      </nav>
      {!dados ? <Carregando erro={erro} /> : dados.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>Nenhum pedido nesta etapa.</p>
      ) : (
        <div className="list">
          {dados.map((f) => (
            <section key={f.reserva.id} className="card" aria-label={`Pedido #${f.reserva.numero}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <Link className="pop" style={{ fontSize: 22 }} href={`/reservas/${f.reserva.id}`}>#{f.reserva.numero}</Link>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: "3px 0 0" }}>
                    {f.reserva.nome} · {telefone(f.reserva.telefone)} · {formatarReais(f.reserva.totalCentavos)} · pago em {dataHora(f.reserva.pagaEm)}
                  </p>
                </div>
                <Selo tom="ship">{SUBSTATUS[f.substatus] ?? f.substatus}</Selo>
              </div>
              <div className="notice green" style={{ marginTop: 16 }}>
                <h2>{MODALIDADE[f.modalidade ?? ""] ?? "Entrega ainda não escolhida"}</h2>
                {f.endereco && <p>{f.endereco.rua}, {f.endereco.numero} · {f.endereco.bairro} · {f.endereco.cidade}/{f.endereco.uf}</p>}
                {f.codigoRetirada && <p>Código de retirada: <b>{f.codigoRetirada}</b></p>}
                {f.frete && <p>Frete {formatarReais(f.frete.valorCentavos)}{f.frete.pagoEm ? " · pago" : f.frete.pagarAte ? ` · pagar até ${dataHora(f.frete.pagarAte)}` : ""}</p>}
              </div>
              {f.disputaAberta && <div style={{ marginTop: 12 }}><Aviso tipo="error" titulo="Contestação aberta: não entregue antes de resolver." /></div>}
              <div style={{ marginTop: 4 }}>
                {(f.substatus === "AGUARDANDO_CALCULO_FRETE" || f.substatus === "FRETE_VENCIDO") && <FormFrete reservaId={f.reserva.id} aoSalvar={atualizar} />}
                <AcoesEntrega reservaId={f.reserva.id} modalidade={f.modalidade} substatus={f.substatus} aoMudar={atualizar} />
              </div>
            </section>
          ))}
        </div>
      )}
    </Casca>
  );
}
