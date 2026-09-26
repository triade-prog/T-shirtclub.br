// WhatsApp no painel (F10, tela 18, G5): conexão com o QR code para reconectar, fila,
// ritmo de envio, modo lançamento, notificações que a loja liga e desliga e mensagem de
// teste. Toda mudança vai para a auditoria (no banco).

import type { Hono } from "hono";
import { ErroDominio, NOTIFICACOES, configWhatsappSchema, mensagemTesteSchema } from "@tshirtclub/domain";
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
}
