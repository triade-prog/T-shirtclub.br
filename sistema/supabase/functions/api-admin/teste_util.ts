// Utilitário dos testes da api-admin: provedores falsos e login de dois fatores.

import type { ProvedorAuth, SessaoAuth } from "../_shared/auth-admin.ts";
import { ErroBanco, type Banco } from "../_shared/banco.ts";
import { criarApiAdmin } from "./app.ts";

const SEGREDO = "s3gredo";
export const ADMIN = "00000000-0000-0000-0000-0000000000d1";

export interface Cenario {
  estado?: { blocked_until: string | null; failures: number; turnstile_required: boolean; just_blocked: boolean };
  depoisDeErrar?: { blocked_until: string | null; failures: number; turnstile_required: boolean; just_blocked: boolean };
  ativo?: boolean;
  fatorVerificado?: boolean;
  turnstileOk?: boolean;
  limiteMfaOk?: boolean;
  tokensVencidos?: Set<string>;
  erroAjuste?: ErroBanco;
  /** Outras funções SQL (catálogo); undefined = rpc inesperada. */
  rpcExtra?: (funcao: string, args: Record<string, unknown>) => unknown;
}

export function montar(cen: Cenario = {}) {
  const chamadas: string[] = [];
  const rpcs: { funcao: string; args: Record<string, unknown> }[] = [];
  const avisos: string[] = [];
  const auditoria: string[] = [];
  const fatores = [{ id: "f1", verificado: cen.fatorVerificado ?? true }];
  const vencidos = cen.tokensVencidos ?? new Set<string>();

  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      chamadas.push(funcao);
      rpcs.push({ funcao, args });
      const r = (() => {
        switch (funcao) {
          case "admin_login_check":
            return cen.estado ?? { blocked_until: null, failures: 0, turnstile_required: false, just_blocked: false };
          case "admin_login_failed":
            return cen.depoisDeErrar ?? { blocked_until: null, failures: 1, turnstile_required: false, just_blocked: false };
          case "admin_login_succeeded":
            return null;
          case "admin_is_active":
            return args.p_user_id === ADMIN && (cen.ativo ?? true);
          case "hit_rate_limit":
            return cen.limiteMfaOk ?? true;
          case "log_audit":
            auditoria.push(String(args.p_action));
            return 1;
          case "adjust_stock":
            if (cen.erroAjuste) throw cen.erroAjuste;
            return 7;
          default: {
            const r = cen.rpcExtra?.(funcao, args);
            if (r === undefined) throw new Error(`rpc inesperada ${funcao}`);
            if (r instanceof ErroBanco) throw r;
            return r;
          }
        }
      })();
      return Promise.resolve(r as T);
    },
  };

  const sessao = (aal: "aal1" | "aal2", n = ""): SessaoAuth => ({ accessToken: `a-${aal}${n}`, refreshToken: `r-${aal}${n}`, expiraEm: 3600, userId: ADMIN });
  const auth: ProvedorAuth = {
    entrarComSenha: (email, senha) => Promise.resolve(email === "loja@tshirtclub.pt" && senha === "senha certa 123" ? sessao("aal1") : null),
    fatores: () => Promise.resolve(fatores),
    cadastrarTotp: () => Promise.resolve({ factorId: "f1", qrCode: "data:image/svg+xml;utf8,<svg/>", segredo: "ABC" }),
    verificarTotp: (_t, id, codigo) => Promise.resolve(id === "f1" && codigo === "482193" ? sessao("aal2") : null),
    portador: (t) => Promise.resolve(vencidos.has(t) ? null : { userId: ADMIN, aal: t.includes("aal2") ? "aal2" : "aal1" }),
    renovar: (r) => Promise.resolve(r.startsWith("r-aal2") ? sessao("aal2", "-novo") : null),
    sair: () => Promise.resolve(),
  };

  const arquivosApagados: string[] = [];
  const app = criarApiAdmin(SEGREDO, {
    banco,
    armazenamento: {
      urlDeEnvio: (caminho) => Promise.resolve({ url: `https://p.supabase.co/storage/v1/object/upload/sign/catalogo/${caminho}?token=t`, token: "t" }),
      apagar: (caminhos) => {
        arquivosApagados.push(...caminhos);
        return Promise.resolve();
      },
    },
    auth,
    turnstile: { verificar: (token) => Promise.resolve(token === "ok" && (cen.turnstileOk ?? true)) },
    avisarBloqueio: (email) => {
      avisos.push(email);
      return Promise.resolve();
    },
  });

  function pedir(caminho: string, corpo?: unknown, cookie?: string, metodo?: string) {
    const headers: Record<string, string> = { "x-repasse-segredo": SEGREDO, "x-cliente-ip": "200.1.2.3" };
    if (corpo !== undefined) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    return app.request(`/api-admin${caminho}`, {
      method: metodo ?? (corpo === undefined ? "GET" : "POST"),
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  }

  return { pedir, chamadas, rpcs, avisos, auditoria, arquivosApagados };
}

export function cookieDe(r: Response): string {
  const v = r.headers.get("set-cookie") ?? "";
  return v.split(";")[0]!;
}

export async function erro(r: Response) {
  return ((await r.json()) as { erro: { codigo: string; detalhes?: Record<string, unknown> } }).erro;
}

export const LOGIN = { email: "Loja@TshirtClub.pt", senha: "senha certa 123" };

/** Painel já logado com os dois fatores (aal2). */
export async function logado(cen: Cenario = {}) {
  const m = montar(cen);
  const aal1 = cookieDe(await m.pedir("/v1/admin/auth/login", LOGIN));
  const cookie = cookieDe(await m.pedir("/v1/admin/auth/mfa/verify", { codigo: "482193" }, aal1));
  const pedir = (caminho: string, corpo?: unknown, metodo?: string) => m.pedir(caminho, corpo, cookie, metodo);
  return { ...m, cookie, pedir };
}
