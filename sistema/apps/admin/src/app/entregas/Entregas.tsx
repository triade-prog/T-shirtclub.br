"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatarReais } from "@tshirtclub/domain";
import { Aviso, cx } from "@tshirtclub/ui";
import { dataHora, telefone } from "@/lib/api";
import { MODALIDADE, SUBSTATUS } from "@/lib/rotulos";
import { AcoesEntrega, FormFrete } from "../_painel/acoes";
import { Caixa, Casca } from "../_painel/Casca";
import { useDados } from "../_painel/useDados";

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
  const { dados, erro, recarregar } = useDados<Item[]>(`v1/admin/fulfillments${substatus ? `?substatus=${substatus}` : ""}`);

  return (
    <Casca titulo="Entregas e frete">
      <nav aria-label="Etapas" className="flex flex-wrap gap-2">
        {ETAPAS.map((s) => (
          <button key={s || "todas"} type="button" aria-pressed={substatus === s} onClick={() => router.replace(s ? `${caminho}?substatus=${s}` : caminho)}
            className={cx("min-h-11 rounded-pilula border-2 border-tinta px-3 text-sm font-semibold", substatus === s ? "bg-citrino text-no-citrino" : "bg-branco")}>
            {s ? SUBSTATUS[s] : "Todas"}
          </button>
        ))}
      </nav>
      {erro && <Aviso tipo="erro" titulo={erro} />}
      {!dados ? <p role="status" className="m-0 text-tinta-suave">Carregando…</p> : dados.length === 0 ? (
        <p className="m-0 text-tinta-suave">Nenhum pedido nesta etapa.</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
          {dados.map((f) => (
            <li key={f.reserva.id}>
              <Caixa>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/reservas/${f.reserva.id}`} className="font-display text-xl font-extrabold underline decoration-rosa decoration-2 underline-offset-2">#{f.reserva.numero}</Link>
                  <span className="text-sm font-bold">{SUBSTATUS[f.substatus] ?? f.substatus}</span>
                </div>
                <p className="m-0 text-[15px]"><b>{f.reserva.nome}</b> · {telefone(f.reserva.telefone)} · {formatarReais(f.reserva.totalCentavos)} · pago em {dataHora(f.reserva.pagaEm)}</p>
                <p className="m-0 text-[15px]">
                  {MODALIDADE[f.modalidade ?? ""] ?? "Entrega ainda não escolhida"}
                  {f.endereco ? ` · ${f.endereco.rua}, ${f.endereco.numero} · ${f.endereco.bairro} · ${f.endereco.cidade}/${f.endereco.uf}` : ""}
                </p>
                {f.frete && <p className="m-0 text-sm">Frete {formatarReais(f.frete.valorCentavos)}{f.frete.pagoEm ? " · pago" : f.frete.pagarAte ? ` · pagar até ${dataHora(f.frete.pagarAte)}` : ""}</p>}
                {f.disputaAberta && <Aviso tipo="erro" titulo="Contestação aberta: não entregue antes de resolver." />}
                {(f.substatus === "AGUARDANDO_CALCULO_FRETE" || f.substatus === "FRETE_VENCIDO") && <FormFrete reservaId={f.reserva.id} aoSalvar={() => void recarregar()} />}
                <AcoesEntrega reservaId={f.reserva.id} modalidade={f.modalidade} substatus={f.substatus} aoMudar={() => void recarregar()} />
              </Caixa>
            </li>
          ))}
        </ul>
      )}
    </Casca>
  );
}
