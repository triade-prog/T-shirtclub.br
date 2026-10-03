// WhatsApp no painel (F10, tela 18, G5): conexão com o QR code para reconectar, fila,
// ritmo de envio, modo lançamento, notificações que a loja liga e desliga e mensagem de
// teste; os avisos da loja para o WhatsApp da equipe (0510); e o atendimento automático
// (0540): respostas rápidas, a ordem do menu e a pausa; os chamados (0550); e (0570) as conversas,
// o histórico da fila com "Tentar de novo", os números do atendimento e o horário de atendimento.
// Toda mudança vai para a auditoria (no banco).

import type { Hono } from "hono";
import {
  AVISOS_LOJA,
  ErroDominio,
  FILTROS_ENVIO,
  NOTIFICACOES,
  configAvisosSchema,
  configWhatsappSchema,
  conversaSchema,
  idSchema,
  mensagemTesteSchema,
  ordemRespostasSchema,
  pausaRespostasSchema,
  respostaRapidaSchema,
} from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { WhatsAppProvider } from "../_shared/whatsapp.ts";
import type { VarsAdmin } from "./auth.ts";

interface Configuracao {
  desligadas: string[];
  [chave: string]: unknown;
}

/** A tela vê as linhas (NOTIFICACOES); o banco guarda os modelos desligados. */
function comNotificacoes(cfg: Configuracao) {
  const desligadas = new Set(cfg.desligadas);
  const { desligadas: _, ...resto } = cfg;
  return {
    ...resto,
    notificacoes: NOTIFICACOES.map((n) => ({
      id: n.id, nome: n.nome, quando: n.quando, essencial: n.essencial,
      ligada: n.essencial || !n.modelos.every((m) => desligadas.has(m)),
    })),
  };
}

export function rotasWhatsappAdmin(app: Hono<VarsAdmin>, deps: { banco: Banco; whatsapp: WhatsAppProvider }): void {
  app.get("/v1/admin/whatsapp", async (c) => {
    const [cfg, conectado] = await Promise.all([chamar<Configuracao>(deps.banco, "admin_whatsapp_settings"), deps.whatsapp.conectado()]);
    return c.json({ conectado, ...comNotificacoes(cfg) });
  });

  // Sem conexão, a validação por WhatsApp fica fora do ar no site e a fila espera.
  app.get("/v1/admin/whatsapp/qr", async (c) => {
    if (await deps.whatsapp.conectado()) return c.json({ conectado: true });
    const qrCode = await deps.whatsapp.qrCode().catch(() => null);
    if (!qrCode) throw new ErroDominio("UPSTREAM_UNAVAILABLE");
    return c.json({ conectado: false, qrCode });
  });

  app.put("/v1/admin/settings/whatsapp", async (c) => {
    const dados = await lerCorpo(c, configWhatsappSchema);
    const p: Record<string, unknown> = {};
    if (dados.modoLancamento !== undefined) p.modoLancamento = dados.modoLancamento;
    if (dados.ritmo) p.ritmo = dados.ritmo;
    if (dados.ritmoLancamento) p.ritmoLancamento = dados.ritmoLancamento;
    if (dados.notificacoes) {
      const atual = await chamar<Configuracao>(deps.banco, "admin_whatsapp_settings");
      const desligadas = new Set(atual.desligadas);
      for (const [id, ligada] of Object.entries(dados.notificacoes)) {
        const n = NOTIFICACOES.find((x) => x.id === id);
        if (!n || n.essencial) throw new ErroDominio("VALIDATION_ERROR", { notificacao: id });
        for (const m of n.modelos) ligada ? desligadas.delete(m) : desligadas.add(m);
      }
      p.desligadas = [...desligadas];
    }
    const cfg = await chamar<Configuracao>(deps.banco, "admin_update_whatsapp_settings", { p_admin: c.get("admin").userId, p });
    return c.json({ conectado: await deps.whatsapp.conectado(), ...comNotificacoes(cfg) });
  });

  // Só para números da equipe: mensagem para quem nunca falou com a loja aumenta o risco
  // de bloqueio do número (W2).
  app.post("/v1/admin/whatsapp/test", async (c) => {
    const { telefone } = await lerCorpo(c, mensagemTesteSchema);
    const admin = c.get("admin").userId;
    if (!(await chamar<boolean>(deps.banco, "hit_rate_limit", { p_key: `whatsapp_teste:${admin}`, p_window: "1 hour", p_max: 5 }))) {
      throw new ErroDominio("RATE_LIMITED");
    }
    await chamar(deps.banco, "admin_whatsapp_test", { p_admin: admin, p_phone: telefone });
    return c.json({ ok: true, naFila: true }, 202);
  });

  // Avisos da loja (0510): o WhatsApp da equipe e os avisos que ela desligou. A tela vê as linhas
  // (AVISOS_LOJA), com nome e quando, e se cada uma está ligada.
  const comAvisos = (cfg: { telefone: string | null; desligados: string[] }) => ({
    telefone: cfg.telefone,
    avisos: AVISOS_LOJA.map((a) => ({ id: a.id, nome: a.nome, quando: a.quando, ligado: !cfg.desligados.includes(a.id) })),
  });

  app.get("/v1/admin/whatsapp/avisos", async (c) => c.json(comAvisos(await chamar(deps.banco, "admin_store_alerts"))));

  app.put("/v1/admin/whatsapp/avisos", async (c) => {
    const dados = await lerCorpo(c, configAvisosSchema);
    const p: Record<string, unknown> = {};
    if (dados.telefone !== undefined) p.telefone = dados.telefone;
    if (dados.desligados) p.desligados = dados.desligados;
    return c.json(comAvisos(await chamar(deps.banco, "admin_update_store_alerts", { p_admin: c.get("admin").userId, p })));
  });

  app.post("/v1/admin/whatsapp/avisos/teste", async (c) => {
    const admin = c.get("admin").userId;
    if (!(await chamar<boolean>(deps.banco, "hit_rate_limit", { p_key: `avisos_teste:${admin}`, p_window: "1 hour", p_max: 5 }))) {
      throw new ErroDominio("RATE_LIMITED");
    }
    await chamar(deps.banco, "admin_store_alert_test", { p_admin: admin });
    return c.json({ ok: true, naFila: true }, 202);
  });

  // Atendimento automático (0540): as respostas rápidas do menu, na ordem, e a pausa.
  const resposta = (c: { req: { param: (n: string) => string } }) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    return id.data;
  };

  app.get("/v1/admin/whatsapp/respostas", async (c) => c.json(await chamar(deps.banco, "admin_quick_replies")));

  app.post("/v1/admin/whatsapp/respostas", async (c) => {
    const dados = await lerCorpo(c, respostaRapidaSchema);
    return c.json(await chamar(deps.banco, "admin_save_quick_reply", { p_admin: c.get("admin").userId, p: dados }), 201);
  });

  app.put("/v1/admin/whatsapp/respostas/ordem", async (c) => {
    const { ids } = await lerCorpo(c, ordemRespostasSchema);
    return c.json(await chamar(deps.banco, "admin_order_quick_replies", { p_admin: c.get("admin").userId, p_ids: ids }));
  });

  app.put("/v1/admin/whatsapp/respostas/pausa", async (c) => {
    const dados = await lerCorpo(c, pausaRespostasSchema);
    return c.json(await chamar(deps.banco, "admin_update_quick_reply_settings", { p_admin: c.get("admin").userId, p: dados }));
  });

  app.put("/v1/admin/whatsapp/respostas/:id", async (c) => {
    const id = resposta(c);
    const dados = await lerCorpo(c, respostaRapidaSchema);
    return c.json(await chamar(deps.banco, "admin_save_quick_reply", { p_admin: c.get("admin").userId, p: { ...dados, id } }));
  });

  app.delete("/v1/admin/whatsapp/respostas/:id", async (c) => {
    return c.json(await chamar(deps.banco, "admin_remove_quick_reply", { p_admin: c.get("admin").userId, p_id: resposta(c) }));
  });

  // Chamados (0550): os abertos e os finalizados da semana; assumir e finalizar pelo painel.
  const chamado = (c: { req: { param: (n: string) => string } }) => {
    const n = c.req.param("numero");
    if (!/^[1-9][0-9]{0,8}$/.test(n)) throw new ErroDominio("NOT_FOUND");
    return Number(n);
  };

  app.get("/v1/admin/whatsapp/chamados", async (c) => c.json(await chamar(deps.banco, "admin_tickets")));

  app.post("/v1/admin/whatsapp/chamados/:numero/assumir", async (c) => {
    return c.json(await chamar(deps.banco, "admin_take_ticket", { p_admin: c.get("admin").userId, p_id: chamado(c) }));
  });

  app.post("/v1/admin/whatsapp/chamados/:numero/finalizar", async (c) => {
    return c.json(await chamar(deps.banco, "admin_resolve_ticket", { p_admin: c.get("admin").userId, p_id: chamado(c) }));
  });

  // Painel em abas (0570). Conversas: a lista e a conversa inteira (o número vai no corpo, para
  // ficar fora do endereço e dos registros de acesso). Os textos da fila a tela monta.
  app.get("/v1/admin/whatsapp/conversas", async (c) => c.json(await chamar(deps.banco, "admin_wa_conversations")));

  app.post("/v1/admin/whatsapp/conversa", async (c) => {
    const { chat } = await lerCorpo(c, conversaSchema);
    return c.json(await chamar(deps.banco, "admin_wa_conversation", { p_chat: chat }));
  });

  // Envios: o histórico da fila (7 dias, ou até 30) e "Tentar de novo" na que falhou.
  app.get("/v1/admin/whatsapp/envios", async (c) => {
    const status = c.req.query("status");
    const dias = c.req.query("dias") ?? "7";
    if ((status !== undefined && !(FILTROS_ENVIO as readonly string[]).includes(status)) || !/^([1-9]|[12][0-9]|30)$/.test(dias)) {
      throw new ErroDominio("VALIDATION_ERROR");
    }
    return c.json(await chamar(deps.banco, "admin_outbox_list", { p_status: status ?? null, p_dias: Number(dias) }));
  });

  app.post("/v1/admin/whatsapp/envios/:id/reenviar", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    return c.json(await chamar(deps.banco, "admin_outbox_retry", { p_admin: c.get("admin").userId, p_id: id.data }));
  });

  // Números do atendimento: 7 ou 30 dias.
  app.get("/v1/admin/whatsapp/numeros", async (c) => {
    const dias = c.req.query("dias") ?? "7";
    if (dias !== "7" && dias !== "30") throw new ErroDominio("VALIDATION_ERROR");
    return c.json(await chamar(deps.banco, "admin_wa_report", { p_dias: Number(dias) }));
  });
}
