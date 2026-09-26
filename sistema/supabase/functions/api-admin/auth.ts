// Login do painel (G7, D12, F2.4): senha, depois o código do autenticador. Só a sessão com
// os dois fatores (aal2) passa por exigirAdmin, que protege todas as outras rotas do painel.
//
// Senhas erradas contam por e-mail + IP (sha256, nada em claro no banco): 5 erros bloqueiam
// por 15 min só aquela rede, e a partir do 3º o login pede o Turnstile.

import type { Context, Hono, MiddlewareHandler } from "hono";
import { COOKIES_PAINEL, ErroDominio, loginAdminSchema, verificarAutenticadorSchema } from "@tshirtclub/domain";
import type { Portador, ProvedorAuth, SessaoAuth } from "../_shared/auth-admin.ts";
import type { Banco } from "../_shared/banco.ts";
import type { VerificadorTurnstile } from "../_shared/turnstile.ts";
import { apagarCookie, gravarCookie, lerCookie } from "../_shared/cookies.ts";
import { base64url, deBase64url, sha256Hex } from "../_shared/cripto.ts";
import { ipDaCliente } from "../_shared/repasse.ts";
import { lerCorpo } from "../_shared/validar.ts";

/** Igual ao timebox das sessões no config.toml (12 h). */
const SESSAO_SEGUNDOS = 12 * 60 * 60;

export interface DepsAuthAdmin {
  banco: Banco;
  auth: ProvedorAuth;
  turnstile: VerificadorTurnstile;
  /** Aviso por e-mail a cada bloqueio (G7). */
  avisarBloqueio(email: string, ate: string): Promise<void>;
  /** Aviso por e-mail quando a senha do painel é trocada (tela 22). */
  avisarSenhaTrocada(email: string): Promise<void>;
}

export interface Admin {
  userId: string;
  /** Token da sessão aal2 (Minha conta fala com o Auth em nome dela). */
  accessToken: string;
  email?: string;
  sessaoId?: string;
}

export type VarsAdmin = { Variables: { admin: Admin } };

interface EstadoLogin {
  blocked_until: string | null;
  failures: number;
  turnstile_required: boolean;
  just_blocked: boolean;
}

function empacotar(s: Pick<SessaoAuth, "accessToken" | "refreshToken">): string {
  return `v1.${base64url(JSON.stringify({ a: s.accessToken, r: s.refreshToken }))}`;
}

function desempacotar(valor: string | null): { a: string; r: string } | null {
  if (!valor?.startsWith("v1.")) return null;
  try {
    const v = JSON.parse(deBase64url(valor.slice(3)));
    return typeof v?.a === "string" && typeof v?.r === "string" ? v : null;
  } catch {
    return null;
  }
}

export function gravarSessao(c: Context, s: SessaoAuth): void {
  c.header("set-cookie", gravarCookie(COOKIES_PAINEL.painel, empacotar(s), SESSAO_SEGUNDOS), { append: true });
}

async function auditar(banco: Banco, acao: string, actorId: string | null, entidade: string, id: string, dados: Record<string, unknown> = {}) {
  await banco.rpc("log_audit", {
    p_actor_type: actorId ? "ADMIN" : "SISTEMA",
    p_actor_id: actorId,
    p_action: acao,
    p_entity_type: entidade,
    p_entity_id: id,
    p_data: dados,
  });
}

/** Sessão do cookie, renovada se o token venceu. Não exige aal2. */
async function sessaoDoCookie(c: Context, deps: DepsAuthAdmin): Promise<(Portador & { accessToken: string }) | null> {
  const s = desempacotar(lerCookie(c.req.raw.headers, COOKIES_PAINEL.painel));
  if (!s) return null;
  const p = await deps.auth.portador(s.a);
  if (p) return { ...p, accessToken: s.a };
  const nova = await deps.auth.renovar(s.r);
  if (!nova) return null;
  const pn = await deps.auth.portador(nova.accessToken);
  if (!pn) return null;
  gravarSessao(c, nova);
  return { ...pn, accessToken: nova.accessToken };
}

/** Toda rota do painel: sessão aal2 de um administrador ativo. Sem aal2, 403 (D12). */
export function exigirAdmin(deps: DepsAuthAdmin): MiddlewareHandler<VarsAdmin> {
  return async (c, next) => {
    const s = await sessaoDoCookie(c, deps);
    if (!s) throw new ErroDominio("UNAUTHORIZED");
    if (s.aal !== "aal2") throw new ErroDominio("MFA_REQUIRED");
    if (!(await deps.banco.rpc<boolean>("admin_is_active", { p_user_id: s.userId }))) throw new ErroDominio("FORBIDDEN");
    c.set("admin", { userId: s.userId, accessToken: s.accessToken, email: s.email, sessaoId: s.sessaoId });
    await next();
  };
}

export function rotasAuthAdmin(app: Hono<VarsAdmin>, deps: DepsAuthAdmin): void {
  app.post("/v1/admin/auth/login", async (c) => {
    const { email, senha, turnstileToken } = await lerCorpo(c, loginAdminSchema);
    const ip = ipDaCliente(c.req.raw.headers) ?? "sem-ip";
    const chave = await sha256Hex(`${email}|${ip}`);

    const estado = await deps.banco.rpc<EstadoLogin>("admin_login_check", { p_key_hash: chave });
    if (estado.blocked_until) throw new ErroDominio("LOGIN_BLOCKED", { ate: estado.blocked_until });
    if (estado.turnstile_required) {
      if (!turnstileToken) throw new ErroDominio("TURNSTILE_REQUIRED");
      if (!(await deps.turnstile.verificar(turnstileToken, ip))) throw new ErroDominio("TURNSTILE_INVALID");
    }

    const sessao = await deps.auth.entrarComSenha(email, senha);
    const ativo = sessao ? await deps.banco.rpc<boolean>("admin_is_active", { p_user_id: sessao.userId }) : false;
    if (!sessao || !ativo) {
      // Usuário sem acesso ao painel responde igual a senha errada.
      if (sessao) await deps.auth.sair(sessao.accessToken);
      const depois = await deps.banco.rpc<EstadoLogin>("admin_login_failed", { p_key_hash: chave });
      await auditar(deps.banco, "admin.login.senha_errada", null, "admin_login", chave);
      if (depois.just_blocked && depois.blocked_until) await deps.avisarBloqueio(email, depois.blocked_until);
      if (depois.blocked_until) throw new ErroDominio("LOGIN_BLOCKED", { ate: depois.blocked_until });
      throw new ErroDominio("INVALID_CREDENTIALS", { turnstile: depois.turnstile_required });
    }

    await deps.banco.rpc("admin_login_succeeded", { p_key_hash: chave });
    const fatores = await deps.auth.fatores(sessao.accessToken);
    gravarSessao(c, sessao);
    return c.json({ etapa: fatores.some((f) => f.verificado) ? "CODIGO" : "CADASTRAR_AUTENTICADOR" });
  });

  // Primeiro autenticador: só enquanto a conta não tem nenhum verificado. Os seguintes são
  // cadastrados em Minha conta, já com a sessão aal2.
  app.post("/v1/admin/auth/mfa/enroll", async (c) => {
    const s = await sessaoDoCookie(c, deps);
    if (!s) throw new ErroDominio("UNAUTHORIZED");
    if ((await deps.auth.fatores(s.accessToken)).some((f) => f.verificado) && s.aal !== "aal2") {
      throw new ErroDominio("MFA_REQUIRED");
    }
    return c.json(await deps.auth.cadastrarTotp(s.accessToken));
  });

  app.post("/v1/admin/auth/mfa/verify", async (c) => {
    const s = await sessaoDoCookie(c, deps);
    if (!s) throw new ErroDominio("UNAUTHORIZED");
    const { codigo, factorId } = await lerCorpo(c, verificarAutenticadorSchema);

    const dentroDoLimite = await deps.banco.rpc<boolean>("hit_rate_limit", {
      p_key: `admin_mfa:${s.userId}`,
      p_window: "15 minutes",
      p_max: 10,
    });
    if (!dentroDoLimite) throw new ErroDominio("RATE_LIMITED");

    const fatores = await deps.auth.fatores(s.accessToken);
    const fator = factorId ? fatores.find((f) => f.id === factorId) : fatores.find((f) => f.verificado);
    if (!fator) throw new ErroDominio("MFA_INVALID");

    const nova = await deps.auth.verificarTotp(s.accessToken, fator.id, codigo);
    if (!nova) throw new ErroDominio("MFA_INVALID");
    gravarSessao(c, nova);
    await auditar(deps.banco, fator.verificado ? "admin.login" : "admin.autenticador.cadastrado", s.userId, "admin_user", s.userId);
    return c.json({ ok: true });
  });

  app.post("/v1/admin/auth/logout", async (c) => {
    const s = desempacotar(lerCookie(c.req.raw.headers, COOKIES_PAINEL.painel));
    if (s) await deps.auth.sair(s.a).catch(() => undefined);
    c.header("set-cookie", apagarCookie(COOKIES_PAINEL.painel), { append: true });
    return c.json({ ok: true });
  });
}
