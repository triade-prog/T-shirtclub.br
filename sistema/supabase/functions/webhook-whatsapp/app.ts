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
  type ResumoReserva,
} from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { gerarCodigo, hashCodigo } from "../_shared/otp.ts";
import { relatarErro } from "../_shared/monitor.ts";
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
    await responderPara(`+${remetente}`, texto);
  }

  async function responderPara(telefone: string, texto: string): Promise<void> {
    try {
      await deps.whatsapp.enviarTexto(telefone, texto);
    } catch (e) {
      await relatarErro(e, { tarefa: "resposta-na-conversa" });
    }
  }

  /** "Minha reserva" (regra 22): o remetente é a prova; responde na conversa, sem código. */
  async function minhaReserva(id: string, remetente: string | null): Promise<string> {
    const candidatos = candidatosDoRemetente(remetente);
    if (candidatos.length === 0 || !remetente) return await marcar(id, "SEM_NUMERO");
    const lista = await deps.banco.rpc<(Omit<ResumoReserva, "expiraEm"> & { expiraEm?: string; telefone: string })[]>(
      "whatsapp_my_reservations", { p_senders: candidatos },
    );
    if (lista.length === 0) {
      await responder(remetente, mensagemWhatsApp("minhas_reservas", { reservas: [] }));
      return await marcar(id, "MINHA_RESERVA");
    }
    // Para o número guardado na reserva (como o código): quem escreveu de um fixo que
    // coincide com o celular de outra pessoa não recebe nada dela
    const porTelefone = new Map<string, ResumoReserva[]>();
    for (const { telefone, expiraEm, ...r } of lista) {
      porTelefone.set(telefone, [...(porTelefone.get(telefone) ?? []), { ...r, expiraEm: expiraEm ? new Date(expiraEm) : undefined }]);
    }
    for (const [telefone, reservas] of porTelefone) await responderPara(telefone, mensagemWhatsApp("minhas_reservas", { reservas }));
    return await marcar(id, "MINHA_RESERVA");
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
    if (!pedido) {
      if (!ehPedidoMinhaReserva(e.texto)) return await marcar(e.id, "CONVERSA");
      return await minhaReserva(e.id, e.remetente);
    }

    const candidatos = candidatosDoRemetente(e.remetente);
    if (candidatos.length === 0 || !e.remetente) return await marcar(e.id, "SEM_NUMERO");

    // A referência é da tentativa de reserva ou da consulta (site ou entrega pelo link). O
    // texto diz qual; se a cliente mexeu nele, tenta a outra antes de dar como inválida.
    const codigo = gerarCodigo();
    const args = {
      p_ref: pedido.ref,
      p_senders: candidatos,
      p_code_hash: await hashCodigo(deps.pepper, pedido.ref, codigo),
      p_wa_message_id: e.id,
    };
    const [primeira, segunda] = pedido.finalidade === "RESERVA"
      ? ["otp_issue_code", "otp_issue_lookup_code"]
      : ["otp_issue_lookup_code", "otp_issue_code"];
    let r = await deps.banco.rpc<Resultado>(primeira, args);
    if (r.acao === "REFERENCIA_INVALIDA") r = await deps.banco.rpc<Resultado>(segunda, args);

    switch (r.acao) {
      case "ENVIAR_CODIGO":
        try {
          const texto = mensagemWhatsApp("codigo_verificacao", { codigo, minutos: r.validadeMinutos }, sorteio());
          await deps.whatsapp.enviarCodigo(r.telefone, texto, codigo);
          return await marcar(e.id, "CODIGO_ENVIADO");
        } catch (erro) {
          await relatarErro(erro, { tarefa: "enviar-codigo" });
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

  app.onError(async (err, c) => {
    await relatarErro(err, { rota: c.req.routePath, metodo: c.req.method });
    return c.json({ erro: { codigo: "INTERNAL_ERROR" } }, 500); // a Z-API reenvia; o registro evita tratar duas vezes
  });
  app.notFound((c) => c.json({ erro: { codigo: "NOT_FOUND" } }, 404));
  return app;
}
