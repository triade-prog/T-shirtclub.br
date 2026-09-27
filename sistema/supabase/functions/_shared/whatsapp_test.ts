import { assertEquals } from "@std/assert";
import type { Banco } from "./banco.ts";
import { comRegistroDeConexao, whatsappFalso } from "./whatsapp.ts";

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
