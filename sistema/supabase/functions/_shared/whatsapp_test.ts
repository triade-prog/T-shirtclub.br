import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import type { Banco } from "./banco.ts";
import { comRegistroDeConexao, EnvioIncerto, formaDoAviso, URL_WAFLY, whatsappDoAmbiente, whatsappFalso, whatsappZapi } from "./whatsapp.ts";

Deno.test("cada conexão vista vai para o banco; falha ao registrar não muda a resposta", async () => {
  const rpcs: { funcao: string; args: Record<string, unknown> }[] = [];
  let quebrado = false;
  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      rpcs.push({ funcao, args });
      return quebrado ? Promise.reject(new Error("banco fora")) : Promise.resolve(0 as T);
    },
  };
  const falso = whatsappFalso();
  const whatsapp = comRegistroDeConexao(falso, banco);

  falso.online = false;
  assertEquals(await whatsapp.conectado(), false);
  falso.online = true;
  assertEquals(await whatsapp.conectado(), true);
  assertEquals(rpcs, [
    { funcao: "whatsapp_connection_seen", args: { p_connected: false } },
    { funcao: "whatsapp_connection_seen", args: { p_connected: true } },
  ]);

  quebrado = true;
  assertEquals(await whatsapp.conectado(), true);
  assertEquals((await whatsapp.enviarTexto("+5577998128809", "oi")).id.startsWith("falso-"), true, "o resto do provedor segue igual");
});

Deno.test("código vai como texto simples (o botão da Z-API não chegava na cliente)", async () => {
  const chamadas: { url: string; corpo: Record<string, unknown> }[] = [];
  const buscar = ((url: string, init: RequestInit) => {
    chamadas.push({ url, corpo: JSON.parse(String(init.body)) });
    return Promise.resolve(new Response(JSON.stringify({ messageId: "m1" }), { status: 200 }));
  }) as unknown as typeof fetch;
  const z = whatsappZapi({ instancia: "i", token: "t", clientToken: "c" }, buscar);
  const r = await z.enviarCodigo("+5577999999809", "Seu código da T-shirt Club é 123456.", "123456");
  assertEquals(r.id, "m1");
  assertEquals(chamadas.length, 1);
  assertEquals(chamadas[0].url.endsWith("/send-text"), true);
  assertEquals(chamadas[0].corpo, { phone: "5577999999809", message: "Seu código da T-shirt Club é 123456." });
});

Deno.test("Wafly: o mesmo formato da Z-API em outro endereço, com o Client-Token", async () => {
  const chamadas: { url: string; headers: Headers }[] = [];
  const buscar = ((url: string, init: RequestInit = {}) => {
    chamadas.push({ url, headers: new Headers(init.headers) });
    // Respostas de exemplo do OpenAPI da Wafly (https://wafly.com.br/openapi.json)
    const corpo = url.endsWith("/status") ? { value: "CONNECTED" } : url.endsWith("/qr-code/image") ? { value: "data:image/png;base64,QQ==" } : { value: true, messageId: "w1" };
    return Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));
  }) as unknown as typeof fetch;
  const w = whatsappDoAmbiente((n) => ({ WAFLY_INSTANCE: "INST", WAFLY_TOKEN: "TOK", WAFLY_CLIENT_TOKEN: "CT", ZAPI_INSTANCIA: "z", ZAPI_TOKEN: "z", ZAPI_CLIENT_TOKEN: "z" })[n], buscar);
  assertEquals((await w.enviarTexto("+5577998128809", "oi")).id, "w1");
  assertEquals(await w.conectado(), true);
  assertEquals(await w.qrCode(), "data:image/png;base64,QQ==");
  assertEquals(chamadas.map((c) => c.url), [
    "https://wafly.com.br/api-bridge-whats/instances/INST/token/TOK/send-text",
    "https://wafly.com.br/api-bridge-whats/instances/INST/token/TOK/status",
    "https://wafly.com.br/api-bridge-whats/instances/INST/token/TOK/qr-code/image",
  ]);
  for (const c of chamadas) assertEquals(c.headers.get("client-token"), "CT");

  const desconectada = whatsappZapi({ instancia: "i", token: "t", clientToken: "c", url: URL_WAFLY },
    (() => Promise.resolve(new Response(JSON.stringify({ value: "DISCONNECTED" })))) as unknown as typeof fetch);
  const avisos: string[] = [];
  const original = console.warn;
  console.warn = (m: string) => void avisos.push(m);
  try {
    assertEquals(await desconectada.conectado(), false);
  } finally {
    console.warn = original;
  }
});

Deno.test("sem WAFLY_*, a Z-API; Wafly pela metade não sobe", async () => {
  const urls: string[] = [];
  const buscar = ((url: string) => {
    urls.push(url);
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;
  const z = whatsappDoAmbiente((n) => ({ ZAPI_INSTANCIA: "I", ZAPI_TOKEN: "T", ZAPI_CLIENT_TOKEN: "C", WAFLY_TOKEN: " " })[n], buscar);
  await z.enviarTexto("+5577998128809", "oi");
  assertEquals(urls, ["https://api.z-api.io/instances/I/token/T/send-text"]);
  assertThrows(() => whatsappDoAmbiente((n) => ({ WAFLY_INSTANCE: "I", WAFLY_CLIENT_TOKEN: "C" })[n]), Error, "WAFLY_TOKEN");
  assertThrows(() => whatsappDoAmbiente(() => undefined), Error, "ZAPI_INSTANCIA");
});

Deno.test("sem resposta a tempo ou 504: envio incerto, sem o endereço com o token", async () => {
  const falhando = (erro: unknown) => (() => Promise.reject(erro)) as unknown as typeof fetch;
  const comToken = new TypeError("error sending request for url (https://wafly.com.br/api-bridge-whats/instances/INST/token/SEGREDO123/send-text)");
  for (const erro of [new DOMException("Signal timed out.", "TimeoutError"), comToken]) {
    const w = whatsappZapi({ instancia: "INST", token: "SEGREDO123", clientToken: "c", url: URL_WAFLY }, falhando(erro));
    const e = await assertRejects(() => w.enviarTexto("+5577998128809", "oi"), EnvioIncerto);
    assertEquals(e.message.includes("SEGREDO123"), false);
    await assertRejects(() => w.qrCode(), EnvioIncerto);
  }
  const resposta = (status: number, corpo = "{}") => (() => Promise.resolve(new Response(corpo, { status }))) as unknown as typeof fetch;
  await assertRejects(() => whatsappZapi({ instancia: "i", token: "t", clientToken: "c" }, resposta(504)).enviarTexto("+5577998128809", "oi"), EnvioIncerto);
  const recusa = await assertRejects(() => whatsappZapi({ instancia: "i", token: "t", clientToken: "c" }, resposta(400)).enviarTexto("+5577998128809", "oi"));
  assertEquals(recusa instanceof EnvioIncerto, false, "recusa clara pode tentar de novo");
  assertEquals((await whatsappZapi({ instancia: "i", token: "t", clientToken: "c" }, resposta(200, "ok")).enviarTexto("+5577998128809", "oi")).id, "", "2xx sem corpo legível conta como enviada");
});

Deno.test("erro de envio e log de status levam só o domínio, nunca o endereço com o token", async () => {
  const avisos: string[] = [];
  const original = console.warn;
  console.warn = (m: string) => void avisos.push(m);
  try {
    const buscar = (() => Promise.resolve(new Response("recusado", { status: 401 }))) as unknown as typeof fetch;
    const w = whatsappZapi({ instancia: "INST", token: "SEGREDO123", clientToken: "c", url: URL_WAFLY }, buscar);
    await assertRejects(() => w.enviarTexto("+5577998128809", "oi"), Error, "wafly.com.br respondeu 401");
    assertEquals(await w.conectado(), false);
    assertEquals(avisos.length, 1);
    for (const m of avisos) assertEquals(m.includes("SEGREDO123") || m.includes("/instances/"), false);
  } finally {
    console.warn = original;
  }
});

Deno.test("forma do aviso ignorado: tipo, status e nomes dos campos, sem valores", () => {
  assertEquals(formaDoAviso({ type: "DeliveryCallback", phone: "5577998128809", messageId: "x", status: "SENT" }), {
    tipo: "DeliveryCallback", status: "SENT", campos: ["messageId", "phone", "status", "type"],
  });
  assertEquals(formaDoAviso({ type: "5577998128809 oi", text: { message: "segredo" } }), { tipo: null, status: null, campos: ["text", "type"] });
  assertEquals(formaDoAviso(null), { tipo: null, status: null, campos: [] });
  assertEquals(formaDoAviso([1, 2]), { tipo: null, status: null, campos: [] });
});
