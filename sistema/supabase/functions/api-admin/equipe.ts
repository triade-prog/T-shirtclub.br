// Equipe do painel (0630), em Minha conta: a lista de quem entra no painel e, só para a dona da
// conta, adicionar alguém com uma senha provisória, tirar e devolver o acesso, dar uma senha
// provisória nova e zerar o autenticador de quem perdeu o celular. A senha vai direto para o
// Auth; o banco e a auditoria não a veem.

import type { Context, Hono } from "hono";
import { ErroDominio, acessoEquipeSchema, idSchema, novaPessoaEquipeSchema, senhaProvisoriaSchema } from "@tshirtclub/domain";
import type { GestaoEquipe } from "../_shared/auth-admin.ts";
import type { Banco } from "../_shared/banco.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export interface DepsEquipe {
  banco: Banco;
  equipe: GestaoEquipe;
}

export function rotasEquipe(app: Hono<VarsAdmin>, deps: DepsEquipe): void {
  async function limite(adminId: string): Promise<void> {
    if (!(await chamar<boolean>(deps.banco, "hit_rate_limit", { p_key: `admin_equipe:${adminId}`, p_window: "15 minutes", p_max: 20 }))) {
      throw new ErroDominio("RATE_LIMITED");
    }
  }
  function pessoa(c: Context<VarsAdmin>): string {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) throw new ErroDominio("NOT_FOUND");
    return id.data;
  }

  app.get("/v1/admin/team", async (c) => c.json(await chamar(deps.banco, "admin_list_team", { p_admin: c.get("admin").userId })));

  app.post("/v1/admin/team", async (c) => {
    const admin = c.get("admin").userId;
    const { nome, email, senha } = await lerCorpo(c, novaPessoaEquipeSchema);
    // A dona confere antes: ninguém mais cria conta no Auth
    const achado = await chamar<{ id?: string; naEquipe: boolean }>(deps.banco, "admin_team_lookup", { p_admin: admin, p_email: email });
    await limite(admin);
    if (achado.naEquipe) throw new ErroDominio("ALREADY_EXISTS");
    let id = achado.id;
    if (id) {
      if ((await deps.equipe.definirSenha(id, senha)) === "FRACA") throw new ErroDominio("PASSWORD_WEAK");
    } else {
      const criado = await deps.equipe.criarUsuario(email, senha);
      if (criado === "FRACA") throw new ErroDominio("PASSWORD_WEAK");
      if (criado === "JA_EXISTE") throw new ErroDominio("ALREADY_EXISTS");
      id = criado.id;
    }
    return c.json(await chamar(deps.banco, "admin_team_add", { p_admin: admin, p_user: id, p_name: nome }), 201);
  });

  app.put("/v1/admin/team/:id/active", async (c) => {
    const { ativo } = await lerCorpo(c, acessoEquipeSchema);
    return c.json(await chamar(deps.banco, "admin_team_set_active", { p_admin: c.get("admin").userId, p_user: pessoa(c), p_active: ativo }));
  });

  app.put("/v1/admin/team/:id/password", async (c) => {
    const admin = c.get("admin").userId;
    const id = pessoa(c);
    const { senha } = await lerCorpo(c, senhaProvisoriaSchema);
    await chamar(deps.banco, "admin_team_check", { p_admin: admin, p_user: id });
    await limite(admin);
    if ((await deps.equipe.definirSenha(id, senha)) === "FRACA") throw new ErroDominio("PASSWORD_WEAK");
    return c.json(await chamar(deps.banco, "admin_team_log", { p_admin: admin, p_user: id, p_action: "admin.equipe.senha_provisoria" }));
  });

  app.post("/v1/admin/team/:id/reset-mfa", async (c) => {
    const admin = c.get("admin").userId;
    const id = pessoa(c);
    await chamar(deps.banco, "admin_team_check", { p_admin: admin, p_user: id });
    await limite(admin);
    await deps.equipe.zerarAutenticadores(id);
    return c.json(await chamar(deps.banco, "admin_team_log", { p_admin: admin, p_user: id, p_action: "admin.equipe.autenticador_zerado" }));
  });
}
