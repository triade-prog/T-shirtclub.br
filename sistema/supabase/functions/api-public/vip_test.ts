import { assertEquals } from "@std/assert";
import { TEXTO_CONSENTIMENTO_VIP } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { whatsappFalso } from "../_shared/whatsapp.ts";
import { pagamentosFalso } from "../_shared/pagamentos.ts";
import { criarApiPublica } from "./app.ts";

const SEGREDO = "s3gredo";

function montar(opcoes: { limite?: boolean; novo?: boolean } = {}) {
  const chamadas: { funcao: string; args: Record<string, unknown> }[] = [];
  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      chamadas.push({ funcao, args });
      const r: unknown = (() => {
        switch (funcao) {
          case "hit_rate_limit": return opcoes.limite ?? true;
          case "vip_signup": return { novo: opcoes.novo ?? true, cupom: { codigo: "VIP10", modo: "PERCENTUAL", valor: 10, minimoCentavos: null } };
          case "vip_offer": return { modo: "PERCENTUAL", valor: 10, minimoCentavos: null };
          default: throw new Error(`rpc inesperada ${funcao}`);
        }
      })();
      return Promise.resolve(r as T);
    },
  };
  const app = criarApiPublica(SEGREDO, {
    banco, agora: () => new Date("2026-10-10T12:00:00Z"), whatsapp: whatsappFalso(), pagamentos: pagamentosFalso(),
    turnstile: { verificar: () => Promise.resolve(true) }, pepper: "p".repeat(32), numeroLoja: "5577998155772", urlLoja: "https://tshirtclub.pt", salIp: "sal",
  });
  const pedir = (caminho: string, corpo?: unknown) =>
    app.request(`/api-public${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { "x-repasse-segredo": SEGREDO, "x-cliente-ip": "200.1.2.3", ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  return { pedir, chamadas };
}

const entrada = { telefone: "(77) 99812-8809", nome: "Marina", origem: "POPUP", consentimento: true, privacidade: true };

Deno.test("VIP: inscreve com o texto do consentimento, sem IP legível, e devolve o cupom", async () => {
  const { pedir, chamadas } = montar();
  const r = await pedir("/v1/vip", entrada);
  assertEquals(r.status, 201);
  assertEquals((await r.json()).cupom.codigo, "VIP10");
  const args = chamadas.find((x) => x.funcao === "vip_signup")!.args;
  assertEquals([args.p_phone, args.p_name, args.p_source, args.p_consent_text], ["+5577998128809", "Marina", "POPUP", TEXTO_CONSENTIMENTO_VIP]);
  assertEquals(/^[0-9a-f]{64}$/.test(String(args.p_ip_hash)), true);
  // Limite por IP e por número, os dois pelo hash
  assertEquals(chamadas.filter((x) => x.funcao === "hit_rate_limit").map((x) => String(x.args.p_key).split(":")[0]), ["vip_ip", "vip_tel"]);
});

Deno.test("VIP: número que já estava responde 200", async () => {
  assertEquals((await montar({ novo: false }).pedir("/v1/vip", entrada)).status, 200);
});

Deno.test("VIP: sem os dois aceites ou com telefone inválido, recusa sem gravar", async () => {
  for (const corpo of [{ ...entrada, consentimento: false }, { ...entrada, privacidade: undefined }, { ...entrada, telefone: "123" }]) {
    const { pedir, chamadas } = montar();
    assertEquals((await pedir("/v1/vip", corpo)).status, 400);
    assertEquals(chamadas.some((x) => x.funcao === "vip_signup"), false);
  }
});

Deno.test("VIP: passou do limite, RATE_LIMITED", async () => {
  const r = await montar({ limite: false }).pedir("/v1/vip", entrada);
  assertEquals(r.status, 429);
});

Deno.test("VIP: o rodapé recebe o benefício, sem o código do cupom", async () => {
  const r = await montar().pedir("/v1/catalog/vip");
  assertEquals(await r.json(), { beneficio: { modo: "PERCENTUAL", valor: 10, minimoCentavos: null } });
});
