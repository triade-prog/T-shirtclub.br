import { assertEquals } from "@std/assert";
import type { Banco } from "../_shared/banco.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { criarWorker } from "./app.ts";
import { despacharOutbox } from "./outbox.ts";

function fila(itens: unknown[]) {
  const resultados: Record<string, unknown>[] = [];
  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      if (funcao === "outbox_claim") return Promise.resolve((itens.shift() ?? null) as T);
      resultados.push(args);
      return Promise.resolve(null as T);
    },
  };
  return { banco, resultados };
}

const pedido = (id: string, template = "reserva_criada") => ({
  id, telefone: "+5577998128809", template,
  params: { nome: "Marina", pecas: 2, numero: 1048, totalCentavos: 9998, expiraEm: "2026-10-10T17:32:00Z", link: "https://tshirtclub.pt/r#abc" },
  intervalo: { minS: 4, maxS: 9 },
});

Deno.test("envia na ordem da fila, com intervalo sorteado entre o mínimo e o máximo", async () => {
  const { banco, resultados } = fila([pedido("a"), pedido("b")]);
  const whatsapp = whatsappFalso();
  const esperas: number[] = [];
  const r = await despacharOutbox({ banco, whatsapp, sorteio: () => 0.5, orcamentoMs: 60_000, dormir: (ms) => { esperas.push(ms); return Promise.resolve(); } });
  assertEquals(r, { enviadas: 2, falhas: 0 });
  assertEquals(whatsapp.enviadas[0]!.texto.startsWith("Reserva #1048 feita, Marina! Guardamos suas peças até *14:32*."), true);
  assertEquals(esperas, [6500, 6500]);
  assertEquals(resultados.map((x) => x.p_ok), [true, true]);
});

Deno.test("falha de envio volta para a fila com o erro", async () => {
  const { banco, resultados } = fila([pedido("a")]);
  const whatsapp = whatsappFalso();
  whatsapp.falharProximo = true;
  assertEquals(await despacharOutbox({ banco, whatsapp, dormir: () => Promise.resolve() }), { enviadas: 0, falhas: 1 });
  assertEquals(resultados[0]!.p_ok, false);
  assertEquals(resultados[0]!.p_error, "Error: falha simulada");
});

Deno.test("modelo desconhecido não trava a fila", async () => {
  const { banco, resultados } = fila([pedido("a", "nao_existe")]);
  assertEquals((await despacharOutbox({ banco, whatsapp: whatsappFalso(), dormir: () => Promise.resolve() })).falhas, 1);
  assertEquals(resultados[0]!.p_ok, false);
});

Deno.test("worker só atende com o segredo", async () => {
  const app = criarWorker("w".repeat(40), { banco: fila([]).banco, whatsapp: whatsappFalso(), pagamentos: pagamentosFalso() });
  assertEquals((await app.request("/worker/outbox", { method: "POST" })).status, 403);
  const r = await app.request("/worker/outbox", { method: "POST", headers: { "x-worker-segredo": "w".repeat(40) } });
  assertEquals(await r.json(), { enviadas: 0, falhas: 0 });
});
