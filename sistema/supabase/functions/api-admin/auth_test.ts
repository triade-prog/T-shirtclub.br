import { assert, assertEquals, assertMatch } from "@std/assert";
import type { ProvedorAuth, SessaoAuth } from "../_shared/auth-admin.ts";
import { ErroBanco, type Banco } from "../_shared/banco.ts";
import { criarApiAdmin } from "./app.ts";

const SEGREDO = "s3gredo";
const ADMIN = "00000000-0000-0000-0000-0000000000d1";

interface Cenario {
  estado?: { blocked_until: string | null; failures: number; turnstile_required: boolean; just_blocked: boolean };
  depoisDeErrar?: { blocked_until: string | null; failures: number; turnstile_required: boolean; just_blocked: boolean };
  ativo?: boolean;
  fatorVerificado?: boolean;
  turnstileOk?: boolean;
  limiteMfaOk?: boolean;
  tokensVencidos?: Set<string>;
  erroAjuste?: ErroBanco;
}

function montar(cen: Cenario = {}) {
  const chamadas: string[] = [];
  const avisos: string[] = [];
  const auditoria: string[] = [];
  const fatores = [{ id: "f1", verificado: cen.fatorVerificado ?? true }];
  const vencidos = cen.tokensVencidos ?? new Set<string>();

  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      chamadas.push(funcao);
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
          default:
            throw new Error(`rpc inesperada ${funcao}`);
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

  const app = criarApiAdmin(SEGREDO, {
    banco,
    auth,
    turnstile: { verificar: (token) => Promise.resolve(token === "ok" && (cen.turnstileOk ?? true)) },
    avisarBloqueio: (email) => {
      avisos.push(email);
      return Promise.resolve();
    },
  });

  function pedir(caminho: string, corpo?: unknown, cookie?: string) {
    const headers: Record<string, string> = { "x-repasse-segredo": SEGREDO, "x-cliente-ip": "200.1.2.3" };
    if (corpo !== undefined) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    return app.request(`/api-admin${caminho}`, { method: corpo === undefined ? "GET" : "POST", headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  }

  return { pedir, chamadas, avisos, auditoria };
}

function cookieDe(r: Response): string {
  const v = r.headers.get("set-cookie") ?? "";
  return v.split(";")[0]!;
}

async function erro(r: Response) {
  return ((await r.json()) as { erro: { codigo: string; detalhes?: Record<string, unknown> } }).erro;
}

const LOGIN = { email: "Loja@TshirtClub.pt", senha: "senha certa 123" };

Deno.test("senha certa: cookie __Host- seguro e pede o código do autenticador", async () => {
  const { pedir, chamadas } = montar();
  const r = await pedir("/v1/admin/auth/login", LOGIN);
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { etapa: "CODIGO" });
  const set = r.headers.get("set-cookie") ?? "";
  assertMatch(set, /^__Host-painel=v1\.[A-Za-z0-9_-]+; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
  assert(chamadas.includes("admin_login_succeeded"));
});

Deno.test("senha errada: 401 e a falha é contada por e-mail + IP", async () => {
  const { pedir, chamadas, auditoria } = montar();
  const r = await pedir("/v1/admin/auth/login", { ...LOGIN, senha: "senha errada 123" });
  assertEquals(r.status, 401);
  assertEquals(await erro(r), { codigo: "INVALID_CREDENTIALS", detalhes: { turnstile: false } });
  assert(chamadas.includes("admin_login_failed"));
  assertEquals(auditoria, ["admin.login.senha_errada"]);
  assertEquals(r.headers.get("set-cookie"), null);
});

Deno.test("usuário sem acesso ao painel responde igual a senha errada", async () => {
  const { pedir } = montar({ ativo: false });
  const r = await pedir("/v1/admin/auth/login", LOGIN);
  assertEquals((await erro(r)).codigo, "INVALID_CREDENTIALS");
});

Deno.test("rede bloqueada: 423 sem nem conferir a senha", async () => {
  const ate = "2026-10-10T15:15:00Z";
  const { pedir, chamadas } = montar({ estado: { blocked_until: ate, failures: 5, turnstile_required: true, just_blocked: false } });
  const r = await pedir("/v1/admin/auth/login", LOGIN);
  assertEquals(r.status, 423);
  assertEquals(await erro(r), { codigo: "LOGIN_BLOCKED", detalhes: { ate } });
  assert(!chamadas.includes("admin_login_failed"));
});

Deno.test("o 5º erro bloqueia e avisa por e-mail", async () => {
  const ate = "2026-10-10T15:15:00Z";
  const { pedir, avisos } = montar({ depoisDeErrar: { blocked_until: ate, failures: 5, turnstile_required: true, just_blocked: true } });
  const r = await pedir("/v1/admin/auth/login", { ...LOGIN, senha: "senha errada 123" });
  assertEquals(r.status, 423);
  assertEquals(avisos, ["loja@tshirtclub.pt"]);
});

Deno.test("a partir do 3º erro, o login pede o Turnstile", async () => {
  const estado = { blocked_until: null, failures: 3, turnstile_required: true, just_blocked: false };
  assertEquals((await erro(await montar({ estado }).pedir("/v1/admin/auth/login", LOGIN))).codigo, "TURNSTILE_REQUIRED");
  assertEquals((await erro(await montar({ estado }).pedir("/v1/admin/auth/login", { ...LOGIN, turnstileToken: "falso" }))).codigo, "TURNSTILE_INVALID");
  assertEquals((await montar({ estado }).pedir("/v1/admin/auth/login", { ...LOGIN, turnstileToken: "ok" })).status, 200);
});

Deno.test("senha certa sem o código (aal1): 403 em qualquer rota do painel (D12)", async () => {
  const { pedir } = montar();
  const cookie = cookieDe(await pedir("/v1/admin/auth/login", LOGIN));
  const r = await pedir("/v1/admin/me", undefined, cookie);
  assertEquals(r.status, 403);
  assertEquals((await erro(r)).codigo, "MFA_REQUIRED");
  const ajuste = await pedir("/v1/admin/products/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f/stock-adjustments", { delta: 1, motivo: "Lote" }, cookie);
  assertEquals(ajuste.status, 403);
});

Deno.test("com o código do autenticador (aal2), o painel abre", async () => {
  const { pedir, auditoria } = montar();
  const aal1 = cookieDe(await pedir("/v1/admin/auth/login", LOGIN));
  const errado = await pedir("/v1/admin/auth/mfa/verify", { codigo: "000000" }, aal1);
  assertEquals((await erro(errado)).codigo, "MFA_INVALID");
  const certo = await pedir("/v1/admin/auth/mfa/verify", { codigo: "482 193" }, aal1);
  assertEquals(certo.status, 200);
  const aal2 = cookieDe(certo);
  const me = await pedir("/v1/admin/me", undefined, aal2);
  assertEquals(me.status, 200);
  assertEquals(await me.json(), { userId: ADMIN });
  assertEquals(auditoria, ["admin.login"]);
});

Deno.test("primeiro acesso: cadastra o autenticador e entra", async () => {
  const { pedir, auditoria } = montar({ fatorVerificado: false });
  const login = await pedir("/v1/admin/auth/login", LOGIN);
  assertEquals(await login.json(), { etapa: "CADASTRAR_AUTENTICADOR" });
  const aal1 = cookieDe(login);
  const cadastro = await pedir("/v1/admin/auth/mfa/enroll", {}, aal1);
  assertEquals((await cadastro.json()).factorId, "f1");
  const ok = await pedir("/v1/admin/auth/mfa/verify", { codigo: "482193", factorId: "f1" }, aal1);
  assertEquals(ok.status, 200);
  assertEquals(auditoria, ["admin.autenticador.cadastrado"]);
});

Deno.test("com autenticador já cadastrado, a sessão aal1 não cadastra outro", async () => {
  const { pedir } = montar();
  const aal1 = cookieDe(await pedir("/v1/admin/auth/login", LOGIN));
  assertEquals((await erro(await pedir("/v1/admin/auth/mfa/enroll", {}, aal1))).codigo, "MFA_REQUIRED");
});

Deno.test("muitas tentativas de código: 429", async () => {
  const { pedir } = montar({ limiteMfaOk: false });
  const aal1 = cookieDe(await pedir("/v1/admin/auth/login", LOGIN));
  assertEquals((await pedir("/v1/admin/auth/mfa/verify", { codigo: "482193" }, aal1)).status, 429);
});

Deno.test("sem sessão: 401; sessão vencida é renovada pelo refresh", async () => {
  const { pedir } = montar({ tokensVencidos: new Set(["a-aal2"]) });
  assertEquals((await pedir("/v1/admin/me")).status, 401);
  assertEquals((await pedir("/v1/admin/me", undefined, "__Host-painel=lixo")).status, 401);
  const aal1 = cookieDe(await pedir("/v1/admin/auth/login", LOGIN));
  const aal2 = cookieDe(await pedir("/v1/admin/auth/mfa/verify", { codigo: "482193" }, aal1));
  const r = await pedir("/v1/admin/me", undefined, aal2);
  assertEquals(r.status, 200);
  assert(cookieDe(r).startsWith("__Host-painel=v1."), "cookie renovado");
  assert(cookieDe(r) !== aal2);
});

Deno.test("sair apaga o cookie", async () => {
  const { pedir } = montar();
  const r = await pedir("/v1/admin/auth/logout", {});
  assertEquals(r.status, 200);
  assertMatch(r.headers.get("set-cookie") ?? "", /^__Host-painel=; Path=\/; Max-Age=0/);
});

Deno.test("ajuste de estoque: motivo obrigatório e nunca abaixo do comprometido", async () => {
  const produto = "/v1/admin/products/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f/stock-adjustments";
  async function comSessao(cen: Cenario) {
    const m = montar(cen);
    const aal1 = cookieDe(await m.pedir("/v1/admin/auth/login", LOGIN));
    return { ...m, cookie: cookieDe(await m.pedir("/v1/admin/auth/mfa/verify", { codigo: "482193" }, aal1)) };
  }
  const ok = await comSessao({});
  const r = await ok.pedir(produto, { delta: 5, motivo: "Chegada do lote", tipo: "ENTRADA" }, ok.cookie);
  assertEquals(await r.json(), { total: 7 });
  assertEquals((await erro(await ok.pedir(produto, { delta: 5, motivo: "" }, ok.cookie))).codigo, "VALIDATION_ERROR");
  assertEquals((await ok.pedir("/v1/admin/products/nao-e-id/stock-adjustments", { delta: 1, motivo: "Lote" }, ok.cookie)).status, 404);

  const abaixo = await comSessao({ erroAjuste: new ErroBanco("TS124", "O estoque não pode ficar abaixo do reservado + vendido (3)") });
  const r2 = await abaixo.pedir(produto, { delta: -9, motivo: "Contagem" }, abaixo.cookie);
  assertEquals(r2.status, 409);
  assertEquals(await erro(r2), { codigo: "STOCK_BELOW_COMMITTED", detalhes: { comprometido: 3 } });
});
