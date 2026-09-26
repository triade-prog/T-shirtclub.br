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
      const u = (await exigirOk(await chamar("/user", { token }))) as { factors?: { id: string; factor_type: string; status: string }[] };
      return (u.factors ?? []).filter((f) => f.factor_type === "totp").map((f) => ({ id: f.id, verificado: f.status === "verified" }));
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
      const u = (await exigirOk(r)) as { id: string };
      const aal = claimsJwt(token).aal;
      return { userId: u.id, aal: aal === "aal2" ? "aal2" : "aal1" };
    },

    async renovar(refreshToken) {
      const r = await chamar("/token?grant_type=refresh_token", { corpo: { refresh_token: refreshToken } });
      if (r.status === 400 || r.status === 401) return null;
      return sessao((await exigirOk(r)) as TokenGoTrue);
    },

    async sair(token) {
      await chamar("/logout?scope=local", { token, corpo: {} });
    },
  };
}
