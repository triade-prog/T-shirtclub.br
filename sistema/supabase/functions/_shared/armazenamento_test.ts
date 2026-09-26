import { assertEquals } from "@std/assert";
import { storageSupabase } from "./armazenamento.ts";

Deno.test("Storage: URL assinada completa e exclusão em lote", async () => {
  const pedidos: { url: string; metodo: string; corpo: string }[] = [];
  const buscar: typeof fetch = async (entrada, init) => {
    pedidos.push({ url: String(entrada), metodo: init?.method ?? "GET", corpo: String(init?.body ?? "") });
    const corpo = String(entrada).includes("/upload/sign/") ? { url: "/object/upload/sign/catalogo/looks/a.webp?token=xyz" } : {};
    return await Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));
  };
  const s = storageSupabase("https://p.supabase.co", "srv", "catalogo", buscar);
  assertEquals(await s.urlDeEnvio("looks/a.webp"), {
    url: "https://p.supabase.co/storage/v1/object/upload/sign/catalogo/looks/a.webp?token=xyz",
    token: "xyz",
  });
  await s.apagar(["looks/a.webp"]);
  assertEquals(pedidos[1], { url: "https://p.supabase.co/storage/v1/object/catalogo", metodo: "DELETE", corpo: '{"prefixes":["looks/a.webp"]}' });
  await s.apagar([]);
  assertEquals(pedidos.length, 2);
});
