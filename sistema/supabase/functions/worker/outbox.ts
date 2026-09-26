// Envio da fila (seção 12, G5): uma mensagem por vez, na ordem de prioridade, com intervalo
// sorteado entre o mínimo e o máximo do modo (normal ou lançamento). O banco decide o que
// sai e quando (outbox_claim); aqui só se monta o texto e se envia.

import { mensagemWhatsApp, type Modelo, type ParametrosMensagem } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import type { WhatsAppProvider } from "../_shared/whatsapp.ts";

export interface DepsOutbox {
  banco: Banco;
  whatsapp: WhatsAppProvider;
  /** Tempo máximo de uma rodada, em ms (a varredura chama de novo a cada 10 s). */
  orcamentoMs?: number;
  dormir?: (ms: number) => Promise<void>;
  sorteio?: () => number;
}

interface Pedido {
  id: string;
  telefone: string;
  template: string;
  params: Record<string, unknown>;
  intervalo: { minS: number; maxS: number };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Datas voltam do banco como texto; os textos das mensagens usam Date. */
function parametros(p: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "string" && ISO.test(v) ? new Date(v) : v]));
}

export async function despacharOutbox(deps: DepsOutbox): Promise<{ enviadas: number; falhas: number }> {
  const inicio = Date.now();
  const orcamento = deps.orcamentoMs ?? 25_000;
  const dormir = deps.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const sorteio = deps.sorteio ?? Math.random;
  let enviadas = 0, falhas = 0;

  while (Date.now() - inicio < orcamento) {
    const p = await deps.banco.rpc<Pedido | null>("outbox_claim");
    if (!p) break;
    try {
      const texto = mensagemWhatsApp(p.template as Modelo, parametros(p.params) as unknown as ParametrosMensagem[Modelo], sorteio());
      const envio = await deps.whatsapp.enviarTexto(p.telefone, texto);
      await deps.banco.rpc("outbox_result", { p_id: p.id, p_ok: true, p_provider_message_id: envio.id });
      enviadas++;
    } catch (e) {
      await deps.banco.rpc("outbox_result", { p_id: p.id, p_ok: false, p_error: String(e).slice(0, 500) });
      falhas++;
    }
    const espera = (p.intervalo.minS + sorteio() * (p.intervalo.maxS - p.intervalo.minS)) * 1000;
    if (Date.now() - inicio + espera >= orcamento) break;
    await dormir(espera);
  }
  return { enviadas, falhas };
}
