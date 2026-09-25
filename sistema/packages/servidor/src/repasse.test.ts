import { afterEach, describe, expect, it, vi } from "vitest";
import { criarRepasse, filtrarSetCookie, ipReal } from "./repasse.ts";

const op = { destino: "https://fn.exemplo/functions/v1/api-public", segredo: "s3gredo", cookies: ["__Host-sessao", "__Host-tentativa"] };
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
const repassar = criarRepasse(() => op);

afterEach(() => vi.unstubAllGlobals());

function mockFetch(resposta: Response) {
  const f = vi.fn(async (_url: URL, _init: RequestInit) => resposta);
  vi.stubGlobal("fetch", f);
  return f;
}

describe("repasse /api", () => {
  it("chama a função com o segredo, o IP real e só os cookies permitidos", async () => {
    const f = mockFetch(new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }));
    const req = new Request("https://tshirtclub.pt/api/v1/health?x=1", {
      headers: {
        cookie: "__Host-sessao=abc; outro=1; __Host-tentativa=def",
        "x-real-ip": "200.1.2.3",
        "x-repasse-segredo": "falso-vindo-do-navegador",
        "x-cliente-ip": "6.6.6.6",
      },
    });
    const r = await repassar(req, ctx(["v1", "health"]));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://fn.exemplo/functions/v1/api-public/v1/health?x=1");
    const h = new Headers(init.headers);
    expect(h.get("x-repasse-segredo")).toBe("s3gredo");
    expect(h.get("x-cliente-ip")).toBe("200.1.2.3");
    expect(h.get("cookie")).toBe("__Host-sessao=abc; __Host-tentativa=def");
  });

  it("recusa caminhos fora de /v1 e tentativas de subir de pasta", async () => {
    mockFetch(new Response("{}"));
    for (const path of [["v2", "x"], ["v1", "..", "admin"], ["v1"], ["v1", "a b"]]) {
      const r = await repassar(new Request("https://tshirtclub.pt/api/x"), ctx(path));
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ erro: { codigo: "NOT_FOUND" } });
    }
  });

  it("aceita só JSON e corpo pequeno nos envios", async () => {
    mockFetch(new Response("{}"));
    const form = new Request("https://tshirtclub.pt/api/v1/x", { method: "POST", body: "a=1", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect((await repassar(form, ctx(["v1", "x"]))).status).toBe(400);
    const grande = new Request("https://tshirtclub.pt/api/v1/x", { method: "POST", body: "x".repeat(70_000), headers: { "content-type": "application/json" } });
    expect((await repassar(grande, ctx(["v1", "x"]))).status).toBe(400);
  });

  it("função fora do ar vira UPSTREAM_UNAVAILABLE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const r = await repassar(new Request("https://tshirtclub.pt/api/v1/health"), ctx(["v1", "health"]));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ erro: { codigo: "UPSTREAM_UNAVAILABLE" } });
  });

  it("sem segredo configurado não chama nada", async () => {
    const f = mockFetch(new Response("{}"));
    const r = await criarRepasse(() => ({ ...op, segredo: "" }))(new Request("https://tshirtclub.pt/api/v1/health"), ctx(["v1", "health"]));
    expect(r.status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it("devolve só cookies __Host- permitidos e seguros", async () => {
    const upstream = new Response("{}", { status: 201 });
    upstream.headers.append("set-cookie", "__Host-sessao=tok; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400");
    upstream.headers.append("set-cookie", "rastreador=1; Path=/");
    mockFetch(upstream);
    const r = await repassar(new Request("https://tshirtclub.pt/api/v1/x", { method: "DELETE" }), ctx(["v1", "x"]));
    expect(r.headers.getSetCookie()).toEqual(["__Host-sessao=tok; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400"]);
  });
});

describe("filtrarSetCookie", () => {
  const nomes = ["__Host-sessao"];
  it("tira Domain e completa HttpOnly e SameSite", () => {
    expect(filtrarSetCookie(["__Host-sessao=x; Path=/; Secure; Domain=supabase.co"], nomes)).toEqual(["__Host-sessao=x; Path=/; Secure; HttpOnly; SameSite=Lax"]);
  });
  it("descarta cookie sem Secure, com Path diferente ou nome fora da lista", () => {
    expect(filtrarSetCookie(["__Host-sessao=x; Path=/"], nomes)).toEqual([]);
    expect(filtrarSetCookie(["__Host-sessao=x; Path=/api; Secure"], nomes)).toEqual([]);
    expect(filtrarSetCookie(["__Host-outro=x; Path=/; Secure"], nomes)).toEqual([]);
  });
});

describe("ipReal", () => {
  it("usa x-real-ip, depois o primeiro do x-forwarded-for, e recusa lixo", () => {
    expect(ipReal(new Headers({ "x-real-ip": "2804:14c::1" }))).toBe("2804:14c::1");
    expect(ipReal(new Headers({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" }))).toBe("200.1.2.3");
    expect(ipReal(new Headers({ "x-real-ip": "<script>" }))).toBeNull();
    expect(ipReal(new Headers())).toBeNull();
  });
});
