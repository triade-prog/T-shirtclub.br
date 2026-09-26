// Pagamentos que precisam do provedor (seção 06, 08 e 12): eventos do webhook, fim da
// tolerância (consulta; se não aprovou, cancela a cobrança e expira), cobranças de reservas
// que já saíram de RESERVADO e reconciliação do que ficou pendente sem webhook.

import type { Banco } from "../_shared/banco.ts";
import { paraAplicar, type PaymentProvider, type ResultadoProvedor } from "../_shared/pagamentos.ts";

export interface DepsPagamentos {
  banco: Banco;
  pagamentos: PaymentProvider;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aplica o resultado já consultado no provedor (nunca o corpo do webhook). */
export async function aplicar(banco: Banco, r: ResultadoProvedor): Promise<string> {
  if (!r.referencia || !UUID.test(r.referencia)) return "SEM_REFERENCIA";
  const res = await banco.rpc<{ resultado: string }>("apply_payment_result", { p_payment_id: r.referencia, p: paraAplicar(r) });
  return res.resultado;
}

export async function aplicarDoProvedor(deps: DepsPagamentos, providerPaymentId: string): Promise<string> {
  return await aplicar(deps.banco, await deps.pagamentos.consultar(providerPaymentId));
}

interface ParaConferir {
  tolerancias: { reservaId: string; pagamentos: { id: string; providerPaymentId: string | null }[] }[];
  cancelar: { id: string; providerPaymentId: string }[];
  reconciliar: { id: string; providerPaymentId: string }[];
  eventos: { id: number; ref: string }[];
}

export async function processarEvento(deps: DepsPagamentos, eventoId: number, ref: string): Promise<void> {
  try {
    await aplicarDoProvedor(deps, ref);
    await deps.banco.rpc("payment_event_done", { p_id: eventoId });
  } catch (e) {
    await deps.banco.rpc("payment_event_done", { p_id: eventoId, p_error: String(e) });
    throw e;
  }
}

export async function processarPagamentos(deps: DepsPagamentos) {
  const t = await deps.banco.rpc<ParaConferir>("payments_to_check");
  const conta = { eventos: 0, tolerancias: 0, cancelados: 0, reconciliados: 0, falhas: 0 };
  const tentar = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return true;
    } catch (e) {
      console.error(JSON.stringify({ funcao: "worker", tarefa: "pagamentos", erro: String(e) }));
      conta.falhas++;
      return false;
    }
  };

  for (const e of t.eventos) if (await tentar(() => processarEvento(deps, e.id, e.ref))) conta.eventos++;

  for (const tol of t.tolerancias) {
    let ok = true;
    for (const p of tol.pagamentos) {
      ok = (await tentar(async () => {
        if (!p.providerPaymentId) {
          await deps.banco.rpc("payment_failed", { p_payment_id: p.id, p_error: "sem cobrança no provedor ao fim da tolerância" });
          return;
        }
        const r = await deps.pagamentos.consultar(p.providerPaymentId);
        if (r.status === "APROVADO") return await aplicar(deps.banco, r);
        // Não aprovou até o fim da tolerância: cancela no provedor (G14). Se o banco da
        // cliente aprovar no meio do cancelamento, a resposta traz o aprovado e vai para análise.
        await aplicar(deps.banco, await deps.pagamentos.cancelar(p.providerPaymentId));
      })) && ok;
    }
    if (ok) {
      await deps.banco.rpc("expire_if_overdue", { p_id: tol.reservaId });
      conta.tolerancias++;
    }
  }

  for (const p of t.cancelar) {
    if (await tentar(async () => await aplicar(deps.banco, await deps.pagamentos.cancelar(p.providerPaymentId)))) conta.cancelados++;
  }
  for (const p of t.reconciliar) {
    if (await tentar(() => aplicarDoProvedor(deps, p.providerPaymentId))) conta.reconciliados++;
  }
  return conta;
}
