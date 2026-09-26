import { assertEquals, assertRejects } from "@std/assert";
import { authGoTrue } from "./auth-admin.ts";
import { bancoPostgrest, ErroBanco } from "./banco.ts";
import { apagarCookie, gravarCookie, lerCookie } from "./cookies.ts";
import { base64url } from "./cripto.ts";

type Resposta = { status: number; corpo?: unknown };

function fetchFalso(rotas: Record<string, Resposta>, pedidos: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return (entrada, init) => {
    const url = String(entrada);
    pedidos.push({ url, init });
    const chave = Object.keys(rotas).find((k) => url.endsWith(k));
    const r = chave ? rotas[chave]! : { status: 404, corpo: {} };
    return Promise.resolve(new Response(r.corpo === undefined ? null : JSON.stringify(r.corpo), { status: r.status }));
  };
}

const jwt = (claims: Record<string, unknown>) => `x.${base64url(JSON.stringify(claims))}.y`;
const TOKEN = { access_token: jwt({ aal: "aal2" }), refresh_token: "r", expires_in: 3600, user: { id: "u1" } };

Deno.test("GoTrue: senha errada é null; aal vem do token validado", async () => {
  const pedidos: { url: string; init?: RequestInit }[] = [];
  const auth = authGoTrue("https://p.supabase.co", "anon", fetchFalso({
    "/token?grant_type=password": { status: 400, corpo: { error: "invalid_grant" } },
    "/user": { status: 200, corpo: { id: "u1", factors: [{ id: "f1", factor_type: "totp", status: "verified" }, { id: "p1", factor_type: "phone", status: "verified" }] } },
  }, pedidos));
  assertEquals(await auth.entrarComSenha("a@b.pt", "x"), null);
  assertEquals(await auth.portador(TOKEN.access_token), { userId: "u1", aal: "aal2" });
  assertEquals(await auth.fatores("t"), [{ id: "f1", verificado: true }]);
  assertEquals(pedidos[0]!.url, "https://p.supabase.co/auth/v1/token?grant_type=password");
});

Deno.test("GoTrue: código do autenticador passa por desafio e verificação", async () => {
  const auth = authGoTrue("https://p.supabase.co", "anon", fetchFalso({
    "/factors/f1/challenge": { status: 200, corpo: { id: "c1" } },
    "/factors/f1/verify": { status: 200, corpo: TOKEN },
  }));
  assertEquals((await auth.verificarTotp("t", "f1", "482193"))?.userId, "u1");
  const errado = authGoTrue("https://p.supabase.co", "anon", fetchFalso({
    "/factors/f1/challenge": { status: 200, corpo: { id: "c1" } },
    "/factors/f1/verify": { status: 422, corpo: { error: "invalid code" } },
  }));
  assertEquals(await errado.verificarTotp("t", "f1", "000000"), null);
});

Deno.test("GoTrue: Minha conta (e-mail e sessão do token, senha, sair dos outros, remover autenticador)", async () => {
  const pedidos: { url: string; init?: RequestInit }[] = [];
  const token = jwt({ aal: "aal2", session_id: "s1" });
  const auth = authGoTrue("https://p.supabase.co", "anon", fetchFalso({
    "/user": { status: 200, corpo: { id: "u1", email: "loja@tshirtclub.pt", factors: [{ id: "f1", factor_type: "totp", status: "verified", friendly_name: "Celular" }] } },
    "/logout?scope=others": { status: 204 },
    "/factors/f2": { status: 200, corpo: { id: "f2" } },
  }, pedidos));
  assertEquals(await auth.portador(token), { userId: "u1", aal: "aal2", email: "loja@tshirtclub.pt", sessaoId: "s1" });
  assertEquals((await auth.fatores(token))[0]!.nome, "Celular");
  assertEquals(await auth.trocarSenha(token, "uma frase bem longa"), "OK");
  assertEquals(pedidos.at(-1)!.init?.method, "PUT");
  await auth.sairDosOutros(token);
  assertEquals(pedidos.at(-1)!.url, "https://p.supabase.co/auth/v1/logout?scope=others");
  await auth.removerFator(token, "f2");
  assertEquals([pedidos.at(-1)!.url, pedidos.at(-1)!.init?.method], ["https://p.supabase.co/auth/v1/factors/f2", "DELETE"]);
  const fraca = authGoTrue("https://p.supabase.co", "anon", fetchFalso({ "/user": { status: 422, corpo: { error_code: "weak_password" } } }));
  assertEquals(await fraca.trocarSenha(token, "123456789012"), "FRACA");
});

Deno.test("banco: erro da função SQL chega com o código", async () => {
  const banco = bancoPostgrest("https://p.supabase.co", "srv", fetchFalso({
    "/rest/v1/rpc/adjust_stock": { status: 400, corpo: { code: "TS124", message: "abaixo (3)" } },
    "/rest/v1/rpc/admin_is_active": { status: 200, corpo: true },
  }));
  assertEquals(await banco.rpc<boolean>("admin_is_active", { p_user_id: "u1" }), true);
  const e = await assertRejects(() => banco.rpc("adjust_stock"), ErroBanco);
  assertEquals(e.codigo, "TS124");
  await assertRejects(() => banco.rpc("drop table; --"));
});

Deno.test("cookies __Host-: lê, grava seguro e apaga", () => {
  assertEquals(lerCookie(new Headers({ cookie: "a=1; __Host-painel=v1.abc" }), "__Host-painel"), "v1.abc");
  assertEquals(lerCookie(new Headers(), "__Host-painel"), null);
  assertEquals(gravarCookie("__Host-painel", "v1.abc", 60), "__Host-painel=v1.abc; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Strict");
  assertEquals(apagarCookie("__Host-painel").includes("Max-Age=0"), true);
});
