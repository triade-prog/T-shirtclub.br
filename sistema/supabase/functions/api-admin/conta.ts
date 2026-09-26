// Minha conta (F10, tela 22, D12, G7, G24): trocar a senha, aparelhos conectados e os
// autenticadores. Para remover um autenticador, o código vem de outro que continua
// cadastrado, então a conta nunca fica sem o segundo fator.

import type { Hono } from "hono";
import { ErroDominio, confirmarAutenticadorSchema, removerAutenticadorSchema, trocarSenhaSchema } from "@tshirtclub/domain";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import { gravarSessao, type DepsAuthAdmin, type VarsAdmin } from "./auth.ts";

export function rotasConta(app: Hono<VarsAdmin>, deps: DepsAuthAdmin): void {
  async function limite(chave: string, janela: string, maximo: number): Promise<void> {
    if (!(await chamar<boolean>(deps.banco, "hit_rate_limit", { p_key: chave, p_window: janela, p_max: maximo }))) {
      throw new ErroDominio("RATE_LIMITED");
    }
  }
  async function auditar(acao: string, adminId: string, dados: Record<string, unknown> = {}): Promise<void> {
    await deps.banco.rpc("log_audit", {
      p_actor_type: "ADMIN", p_actor_id: adminId, p_action: acao, p_entity_type: "admin_user", p_entity_id: adminId, p_data: dados,
    });
  }

  app.get("/v1/admin/account", async (c) => {
    const admin = c.get("admin");
    const [nome, fatores, aparelhos] = await Promise.all([
      chamar<string | null>(deps.banco, "admin_name", { p_id: admin.userId }),
      deps.auth.fatores(admin.accessToken),
      chamar(deps.banco, "admin_list_sessions", { p_admin: admin.userId, p_current: admin.sessaoId ?? null }),
    ]);
    return c.json({ email: admin.email ?? null, nome, autenticadores: fatores.filter((f) => f.verificado), aparelhos });
  });

  // Confere a senha atual antes; depois os outros aparelhos saem e chega um aviso por e-mail.
  app.put("/v1/admin/account/password", async (c) => {
    const admin = c.get("admin");
    const { atual, nova } = await lerCorpo(c, trocarSenhaSchema);
    await limite(`admin_senha:${admin.userId}`, "15 minutes", 5);
    if (!admin.email) throw new ErroDominio("INTERNAL_ERROR");

    const conferida = await deps.auth.entrarComSenha(admin.email, atual);
    if (!conferida || conferida.userId !== admin.userId) {
      await auditar("admin.senha.atual_errada", admin.userId);
      throw new ErroDominio("INVALID_CREDENTIALS");
    }
    await deps.auth.sair(conferida.accessToken); // a sessão da conferência não fica aberta

    if ((await deps.auth.trocarSenha(admin.accessToken, nova)) === "FRACA") throw new ErroDominio("PASSWORD_WEAK");
    await deps.auth.sairDosOutros(admin.accessToken);
    await auditar("admin.senha.trocada", admin.userId);
    await deps.avisarSenhaTrocada(admin.email);
    return c.json({ ok: true });
  });

  app.post("/v1/admin/account/sessions/revoke-others", async (c) => {
    const admin = c.get("admin");
    await deps.auth.sairDosOutros(admin.accessToken);
    await auditar("admin.aparelhos.encerrados", admin.userId);
    return c.json({ ok: true });
  });

  app.get("/v1/admin/mfa/factors", async (c) => c.json(await deps.auth.fatores(c.get("admin").accessToken)));

  app.post("/v1/admin/mfa/factors/enroll", async (c) => c.json(await deps.auth.cadastrarTotp(c.get("admin").accessToken), 201));

  app.post("/v1/admin/mfa/factors/:id/verify", async (c) => {
    const admin = c.get("admin");
    const { codigo } = await lerCorpo(c, confirmarAutenticadorSchema);
    await limite(`admin_mfa:${admin.userId}`, "15 minutes", 10);
    const fator = (await deps.auth.fatores(admin.accessToken)).find((f) => f.id === c.req.param("id"));
    if (!fator) throw new ErroDominio("NOT_FOUND");
    if (fator.verificado) throw new ErroDominio("ALREADY_APPLIED");
    const nova = await deps.auth.verificarTotp(admin.accessToken, fator.id, codigo);
    if (!nova) throw new ErroDominio("MFA_INVALID");
    gravarSessao(c, nova);
    await auditar("admin.autenticador.cadastrado", admin.userId);
    return c.json({ ok: true });
  });

  app.delete("/v1/admin/mfa/factors/:id", async (c) => {
    const admin = c.get("admin");
    const id = c.req.param("id");
    const fatores = await deps.auth.fatores(admin.accessToken);
    const alvo = fatores.find((f) => f.id === id);
    if (!alvo) throw new ErroDominio("NOT_FOUND");

    let token = admin.accessToken;
    // Cadastro que ficou pela metade sai sem código; um verificado, só com o código de outro
    if (alvo.verificado) {
      const { codigo, fatorDoCodigo } = await lerCorpo(c, removerAutenticadorSchema);
      await limite(`admin_mfa:${admin.userId}`, "15 minutes", 10);
      const outro = fatores.find((f) => f.id === fatorDoCodigo && f.verificado);
      if (!outro || outro.id === alvo.id) throw new ErroDominio("VALIDATION_ERROR", { campo: "fatorDoCodigo" });
      const nova = await deps.auth.verificarTotp(admin.accessToken, outro.id, codigo);
      if (!nova) throw new ErroDominio("MFA_INVALID");
      gravarSessao(c, nova);
      token = nova.accessToken;
    }
    await deps.auth.removerFator(token, alvo.id);
    await auditar("admin.autenticador.removido", admin.userId, { verificado: alvo.verificado });
    return c.json({ ok: true });
  });
}
