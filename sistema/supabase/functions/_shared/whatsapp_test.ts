import { assertEquals } from "@std/assert";
import type { Banco } from "./banco.ts";
import { comRegistroDeConexao, whatsappFalso, whatsappZapi } from "./whatsapp.ts";

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
