// Supabase Auth do painel (D12): e-mail e senha, depois o autenticador (TOTP). A api-admin
// fala com o Auth por esta interface; os testes usam uma implementação falsa.

import { deBase64url } from "./cripto.ts";

export interface SessaoAuth {
  accessToken: string;
  refreshToken: string;
  /** Segundos até o accessToken vencer. */
  expiraEm: number;
  userId: string;
}

export interface Fator {
  id: string;
  verificado: boolean;
  nome?: string;
  criadoEm?: string;
}

export interface CadastroTotp {
  factorId: string;
  /** QR code em SVG (data URI), para o aplicativo autenticador. */
  qrCode: string;
  segredo: string;
}

export interface Portador {
  userId: string;
  /** "aal1" depois da senha; "aal2" depois do autenticador. */
  aal: "aal1" | "aal2";
  email?: string;
  /** Sessão do Auth (claim session_id): marca o aparelho atual em Minha conta. */
  sessaoId?: string;
}

export interface ProvedorAuth {
  /** null quando e-mail ou senha não conferem. */
  entrarComSenha(email: string, senha: string): Promise<SessaoAuth | null>;
  /** Autenticadores TOTP do usuário. */
  fatores(accessToken: string): Promise<Fator[]>;
  cadastrarTotp(accessToken: string): Promise<CadastroTotp>;
  /** Sessão nova, já em aal2; null quando o código não confere. */
  verificarTotp(accessToken: string, factorId: string, codigo: string): Promise<SessaoAuth | null>;
  /** Valida o token no Auth; null se vencido ou revogado. */
  portador(accessToken: string): Promise<Portador | null>;
  renovar(refreshToken: string): Promise<SessaoAuth | null>;
  sair(accessToken: string): Promise<void>;
  /** Encerra as outras sessões da conta (Minha conta, e depois de trocar a senha). */
  sairDosOutros(accessToken: string): Promise<void>;
  /** FRACA quando o Auth recusa a senha (curta, comum ou vazada). */
  trocarSenha(accessToken: string, novaSenha: string): Promise<"OK" | "FRACA">;
  /** Remove um autenticador; o Auth exige a sessão aal2. */
  removerFator(accessToken: string, factorId: string): Promise<void>;
}

interface TokenGoTrue {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

function sessao(t: TokenGoTrue): SessaoAuth {
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiraEm: t.expires_in, userId: t.user.id };
}

/** Lê as claims do JWT. Só usar depois que o Auth validou o token. */
export function claimsJwt(token: string): Record<string, unknown> {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("JWT inválido");
  return JSON.parse(deBase64url(partes[1]!));
}

export function authGoTrue(url: string, apiKey: string, buscar: typeof fetch = fetch): ProvedorAuth {
  async function chamar(caminho: string, init: { method?: string; token?: string; corpo?: unknown } = {}): Promise<Response> {
    return await buscar(`${url}/auth/v1${caminho}`, {
      method: init.method ?? (init.corpo === undefined ? "GET" : "POST"),
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${init.token ?? apiKey}`,
        "content-type": "application/json",
      },
      body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
      signal: AbortSignal.timeout(8000),
    });
  }

  async function exigirOk(r: Response): Promise<unknown> {
    if (!r.ok) throw new Error(`Auth respondeu ${r.status}`);
    return await r.json();
  }

  return {
    async entrarComSenha(email, senha) {
      const r = await chamar("/token?grant_type=password", { corpo: { email, password: senha } });
      if (r.status === 400) return null; // invalid_grant: e-mail ou senha não conferem
      return sessao((await exigirOk(r)) as TokenGoTrue);
    },

    async fatores(token) {
      const u = (await exigirOk(await chamar("/user", { token }))) as {
        factors?: { id: string; factor_type: string; status: string; friendly_name?: string; created_at?: string }[];
      };
      return (u.factors ?? []).filter((f) => f.factor_type === "totp").map((f) => ({
        id: f.id,
        verificado: f.status === "verified",
        ...(f.friendly_name ? { nome: f.friendly_name } : {}),
        ...(f.created_at ? { criadoEm: f.created_at } : {}),
      }));
    },

    async cadastrarTotp(token) {
      const f = (await exigirOk(await chamar("/factors", {
        token,
        corpo: { factor_type: "totp", friendly_name: `Painel ${new Date().toISOString().slice(0, 16)}` },
      }))) as { id: string; totp: { qr_code: string; secret: string } };
      return { factorId: f.id, qrCode: f.totp.qr_code, segredo: f.totp.secret };
    },

    async verificarTotp(token, factorId, codigo) {
      const id = encodeURIComponent(factorId);
      const desafio = (await exigirOk(await chamar(`/factors/${id}/challenge`, { token, corpo: {} }))) as { id: string };
      const r = await chamar(`/factors/${id}/verify`, { token, corpo: { challenge_id: desafio.id, code: codigo } });
      if (r.status === 400 || r.status === 422) return null;
      return sessao((await exigirOk(r)) as TokenGoTrue);
    },

    async portador(token) {
      const r = await chamar("/user", { token });
      if (r.status === 401 || r.status === 403) return null;
      const u = (await exigirOk(r)) as { id: string; email?: string };
      const claims = claimsJwt(token);
      return {
        userId: u.id,
        aal: claims.aal === "aal2" ? "aal2" : "aal1",
        ...(u.email ? { email: u.email } : {}),
        ...(typeof claims.session_id === "string" ? { sessaoId: claims.session_id } : {}),
      };
    },

    async renovar(refreshToken) {
      const r = await chamar("/token?grant_type=refresh_token", { corpo: { refresh_token: refreshToken } });
      if (r.status === 400 || r.status === 401) return null;
      return sessao((await exigirOk(r)) as TokenGoTrue);
    },

    async sair(token) {
      await chamar("/logout?scope=local", { token, corpo: {} });
    },

    async sairDosOutros(token) {
      const r = await chamar("/logout?scope=others", { token, corpo: {} });
      if (!r.ok && r.status !== 204) throw new Error(`Auth respondeu ${r.status}`);
    },

    async trocarSenha(token, novaSenha) {
      const r = await chamar("/user", { method: "PUT", token, corpo: { password: novaSenha } });
      if (r.status === 422 || r.status === 400) return "FRACA"; // weak_password (inclui senha vazada) ou same_password
      await exigirOk(r);
      return "OK";
    },

    async removerFator(token, factorId) {
      await exigirOk(await chamar(`/factors/${encodeURIComponent(factorId)}`, { method: "DELETE", token }));
    },
  };
}
