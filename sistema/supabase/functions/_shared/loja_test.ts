import { assertEquals } from "@std/assert";
import { avisoLojaHttp } from "./loja.ts";

Deno.test("aviso à loja: POST /revalidar com o segredo; falha da loja não derruba a gravação", async () => {
  const pedidos: { url: string; metodo: string; segredo: string | null; corpo: unknown }[] = [];
  let resposta: () => Promise<Response> = () => Promise.resolve(new Response(null, { status: 200 }));
  const fetchOriginal = globalThis.fetch;
  const warnOriginal = console.warn;
  const avisos: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    pedidos.push({ url: String(url), metodo: init?.method ?? "GET", segredo: h.get("x-revalidar-segredo"), corpo: JSON.parse(String(init?.body)) });
    return await resposta();
  }) as typeof fetch;
  console.warn = (m: string) => avisos.push(m);
  try {
    const loja = avisoLojaHttp({ urlLoja: "https://tshirtclub.vercel.app/", segredo: "s3gredo" });
    await loja.catalogoMudou();
    assertEquals(pedidos, [{ url: "https://tshirtclub.vercel.app/revalidar", metodo: "POST", segredo: "s3gredo", corpo: { etiquetas: ["catalogo"] } }]);
    assertEquals(avisos, []);
    // Loja recusou: registra sem o segredo nem a URL
    resposta = () => Promise.resolve(new Response(null, { status: 401 }));
    await loja.catalogoMudou();
    assertEquals(avisos, [JSON.stringify({ aviso: "loja não revalidou o catálogo", status: 401 })]);
    // Loja fora do ar: registra e segue, sem lançar
    resposta = () => Promise.reject(new TypeError("conexão recusada"));
    await loja.catalogoMudou();
    assertEquals(avisos.at(-1), JSON.stringify({ aviso: "loja não revalidou o catálogo", erro: "TypeError" }));
  } finally {
    globalThis.fetch = fetchOriginal;
    console.warn = warnOriginal;
  }
});
