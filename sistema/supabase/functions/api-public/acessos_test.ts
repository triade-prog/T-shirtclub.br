import { assertEquals, assertNotEquals } from "@std/assert";
import type { Banco } from "../_shared/banco.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { criarApiPublica } from "./app.ts";

const SEGREDO = "s3gredo";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function montar(opcoes: { limite?: boolean; agora?: Date } = {}) {
  const chamadas: { funcao: string; args: Record<string, unknown> }[] = [];
  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      chamadas.push({ funcao, args });
      if (funcao === "hit_rate_limit") return Promise.resolve((opcoes.limite ?? true) as T);
      if (funcao === "register_visit") return Promise.resolve(true as T);
      throw new Error(`rpc inesperada ${funcao}`);
    },
  };
  const app = criarApiPublica(SEGREDO, {
    banco, agora: () => opcoes.agora ?? new Date("2026-10-10T12:00:00Z"), whatsapp: whatsappFalso(), pagamentos: pagamentosFalso(),
    turnstile: { verificar: () => Promise.resolve(true) }, pepper: "p".repeat(32), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt", salIp: "sal",
  });
  const pedir = (corpo: unknown, navegador: string | null = IPHONE, ip = "200.1.2.3") =>
    app.request("/api-public/v1/visita", {
      method: "POST",
      headers: { "x-repasse-segredo": SEGREDO, "x-cliente-ip": ip, "content-type": "application/json", ...(navegador ? { "x-cliente-navegador": navegador } : {}) },
      body: JSON.stringify(corpo),
    });
  const visitas = () => chamadas.filter((c) => c.funcao === "register_visit").map((c) => c.args);
  return { pedir, visitas, chamadas };
}

Deno.test("visita: página da loja vai para o banco com origem, aparelho e um código que não é o IP", async () => {
  const { pedir, visitas } = await montar();
  assertEquals((await pedir({ caminho: "/colecao/fe", origem: "https://l.instagram.com/" })).status, 204);
  assertEquals((await pedir({ caminho: "/produto/limone-amalfi" })).status, 204);
  assertEquals((await pedir({ caminho: "/sacola", origem: "https://tshirtclub.pt/produto/x" })).status, 204);
  const [a, b, c] = visitas();
  assertEquals([a!.p_path, a!.p_source, a!.p_device], ["/colecao/fe", "instagram", "mobile"]);
  assertEquals([b!.p_path, b!.p_source], ["/produto/limone-amalfi", null]);
  assertEquals(c!.p_source, null, "a própria loja não é origem");
  assertEquals(a!.p_visitor, b!.p_visitor, "mesma pessoa no mesmo dia, mesmo código");
  assertEquals(/^[0-9a-f]{64}$/.test(String(a!.p_visitor)), true);
  assertEquals(String(a!.p_visitor).includes("200.1.2.3"), false);
});

Deno.test("visita: o código muda no outro dia e com outro IP", async () => {
  const hoje = montar();
  await hoje.pedir({ caminho: "/" });
  await hoje.pedir({ caminho: "/" }, IPHONE, "200.9.9.9");
  const amanha = montar({ agora: new Date("2026-10-11T12:00:00Z") });
  await amanha.pedir({ caminho: "/" });
  const [a, outroIp] = hoje.visitas();
  assertNotEquals(a!.p_visitor, outroIp!.p_visitor);
  assertNotEquals(a!.p_visitor, amanha.visitas()[0]!.p_visitor);
});

Deno.test("visita: robô, sem navegador e endereço fora da loja não contam; limite por IP", async () => {
  const { pedir, visitas } = montar();
  assertEquals((await pedir({ caminho: "/" }, "Mozilla/5.0 (compatible; Googlebot/2.1)")).status, 204);
  assertEquals((await pedir({ caminho: "/" }, null)).status, 204);
  assertEquals((await pedir({ caminho: "/wp-login.php" })).status, 204);
  assertEquals(visitas().length, 0);
  assertEquals((await pedir({ caminho: 42 })).status, 400);
  assertEquals((await montar({ limite: false }).pedir({ caminho: "/" })).status, 429);
});
