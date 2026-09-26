// Webhook da Z-API (seção 07, G4). Sem assinatura da ferramenta: a URL tem um segmento
// secreto de 32+ caracteres, comparado em tempo constante e trocável sem deploy.
// Descarta mensagens da própria loja (a equipe atende pelo celular), de grupos, status e
// canais, e as com mais de 10 min. Cada mensagem é tratada uma vez, com limite por
// remetente. O pedido de código é respondido na hora, na mesma conversa (fora da fila).

import { Hono } from "hono";
import {
  candidatosDoRemetente,
  ehPedidoMinhaReserva,
  lerPedidoDeCodigo,
  mensagemWhatsApp,
} from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { gerarCodigo, hashCodigo } from "../_shared/otp.ts";
import { segredoConfere } from "../_shared/repasse.ts";
import { lerWebhookZapi, type EventoWhatsApp, type WhatsAppProvider } from "../_shared/whatsapp.ts";

export interface DepsWebhook {
  banco: Banco;
  whatsapp: WhatsAppProvider;
  pepper: string;
  segredo: string;
  agora?: () => Date;
  sorteio?: () => number;
}

type Resultado = { acao: "ENVIAR_CODIGO"; telefone: string; validadeMinutos: number } | { acao: "NUMERO_DIFERENTE" | "REFERENCIA_INVALIDA" | "AGUARDE" } | { acao: "BLOQUEADO"; ate: string };

const DEZ_MINUTOS = 10 * 60 * 1000;

export function criarWebhookWhatsApp(deps: DepsWebhook) {
  const app = new Hono().basePath("/webhook-whatsapp");
  const agora = () => deps.agora?.() ?? new Date();
  const sorteio = () => deps.sorteio?.() ?? Math.random();

  async function marcar(id: string, como: string): Promise<string> {
    await deps.banco.rpc("inbound_mark", { p_wa_message_id: id, p_handled_as: como });
    return como;
  }

  async function responder(remetente: string, texto: string): Promise<void> {
    try {
      await deps.whatsapp.enviarTexto(`+${remetente}`, texto);
    } catch (e) {
      console.error(JSON.stringify({ funcao: "webhook-whatsapp", aviso: "resposta não enviada", erro: String(e) }));
    }
  }

  async function tratar(e: EventoWhatsApp): Promise<string> {
    if (e.tipo === "STATUS") {
      for (const id of e.ids) await deps.banco.rpc("outbox_delivery", { p_provider_message_id: id, p_status: e.status });
      return "STATUS";
    }
    if (e.tipo === "OUTRO" || e.grupo || e.canal) return "IGNORADA";
    if (e.deMim) return "DA_LOJA";
    if (Number.isNaN(e.momento.getTime()) || agora().getTime() - e.momento.getTime() > DEZ_MINUTOS) return "ANTIGA";

    const reg = await deps.banco.rpc<{ novo: boolean; dentroDoLimite: boolean }>("inbound_register", {
      p_wa_message_id: e.id,
      p_from: e.remetente,
      p_text: e.texto,
    });
    if (!reg.novo) return "REPETIDA";
    if (!reg.dentroDoLimite) return await marcar(e.id, "LIMITE");

    const pedido = lerPedidoDeCodigo(e.texto);
    if (!pedido) return await marcar(e.id, ehPedidoMinhaReserva(e.texto) ? "MINHA_RESERVA" : "CONVERSA");
    if (pedido.finalidade === "CONSULTA") return await marcar(e.id, "CONSULTA");

    const candidatos = candidatosDoRemetente(e.remetente);
    if (candidatos.length === 0 || !e.remetente) return await marcar(e.id, "SEM_NUMERO");

    const codigo = gerarCodigo();
    const r = await deps.banco.rpc<Resultado>("otp_issue_code", {
      p_ref: pedido.ref,
      p_senders: candidatos,
      p_code_hash: await hashCodigo(deps.pepper, pedido.ref, codigo),
      p_wa_message_id: e.id,
    });

    switch (r.acao) {
      case "ENVIAR_CODIGO":
        try {
          const texto = mensagemWhatsApp("codigo_verificacao", { codigo, minutos: r.validadeMinutos }, sorteio());
          await deps.whatsapp.enviarCodigo(r.telefone, texto, codigo);
          return await marcar(e.id, "CODIGO_ENVIADO");
        } catch (erro) {
          console.error(JSON.stringify({ funcao: "webhook-whatsapp", aviso: "código não enviado", erro: String(erro) }));
          return await marcar(e.id, "FALHA_ENVIO");
        }
      case "NUMERO_DIFERENTE":
        await responder(e.remetente, mensagemWhatsApp("numero_diferente", {}));
        return await marcar(e.id, "NUMERO_DIFERENTE");
      case "REFERENCIA_INVALIDA":
        await responder(e.remetente, mensagemWhatsApp("referencia_invalida", {}));
        return await marcar(e.id, "REFERENCIA_INVALIDA");
      case "BLOQUEADO":
        await responder(e.remetente, mensagemWhatsApp("codigo_bloqueado", { ate: new Date(r.ate) }));
        return await marcar(e.id, "BLOQUEADO");
      default:
        return await marcar(e.id, "AGUARDE");
    }
  }

  app.post("/:segredo", async (c) => {
    if (deps.segredo.length < 32 || !segredoConfere(c.req.param("segredo"), deps.segredo)) {
      return c.json({ erro: { codigo: "NOT_FOUND" } }, 404);
    }
    const evento = lerWebhookZapi(await c.req.json().catch(() => null));
    return c.json({ ok: true, tratamento: await tratar(evento) });
  });

  app.onError((err, c) => {
    console.error(JSON.stringify({ funcao: "webhook-whatsapp", erro: String(err) }));
    return c.json({ erro: { codigo: "INTERNAL_ERROR" } }, 500); // a Z-API reenvia; o registro evita tratar duas vezes
  });
  app.notFound((c) => c.json({ erro: { codigo: "NOT_FOUND" } }, 404));
  return app;
}
