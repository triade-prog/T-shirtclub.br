import { assertEquals, assertMatch } from "@std/assert";
import type { Banco } from "../_shared/banco.ts";
import { lerWebhookZapi, whatsappFalso } from "../_shared/whatsapp.ts";
import { criarWebhookWhatsApp } from "./app.ts";

const SEGREDO = "s".repeat(40);
const AGORA = new Date("2026-10-10T12:00:00Z");

function montar(opcoes: { resultado?: unknown; limite?: boolean } = {}) {
  const rpcs: { funcao: string; args: Record<string, unknown> }[] = [];
  const vistas = new Set<string>();
  const banco: Banco = {
    rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      rpcs.push({ funcao, args });
      const r: unknown = (() => {
        switch (funcao) {
          case "inbound_register": {
            const novo = !vistas.has(String(args.p_wa_message_id));
            vistas.add(String(args.p_wa_message_id));
            return { novo, dentroDoLimite: opcoes.limite ?? true };
          }
          case "otp_issue_code":
            return opcoes.resultado ?? { acao: "ENVIAR_CODIGO", telefone: "+5577998128809", validadeMinutos: 5 };
          default:
            return null;
        }
      })();
      return Promise.resolve(r as T);
    },
  };
  const whatsapp = whatsappFalso();
  const app = criarWebhookWhatsApp({ banco, whatsapp, pepper: "p".repeat(40), segredo: SEGREDO, agora: () => AGORA, sorteio: () => 0 });
  const enviar = async (corpo: Record<string, unknown>, segredo = SEGREDO) => {
    const r = await app.request(`/webhook-whatsapp/${segredo}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    return { status: r.status, tratamento: r.status === 200 ? (await r.json()).tratamento : null };
  };
  return { enviar, rpcs, whatsapp };
}

const msg = (extra: Record<string, unknown> = {}) => ({
  type: "ReceivedCallback", messageId: "m1", phone: "5577998128809", fromMe: false, isGroup: false,
  momment: AGORA.getTime() - 5000, text: { message: "Quero meu código da reserva (ref. K7Q2)" }, ...extra,
});

Deno.test("segmento secreto errado: 404 e nada é registrado", async () => {
  const { enviar, rpcs } = montar();
  assertEquals((await enviar(msg(), "x".repeat(40))).status, 404);
  assertEquals(rpcs.length, 0);
});

Deno.test("descarta da loja, de grupo, de status/canal e antigas (G4)", async () => {
  const { enviar, rpcs } = montar();
  assertEquals((await enviar(msg({ fromMe: true }))).tratamento, "DA_LOJA");
  assertEquals((await enviar(msg({ isGroup: true }))).tratamento, "IGNORADA");
  assertEquals((await enviar(msg({ isNewsletter: true }))).tratamento, "IGNORADA");
  assertEquals((await enviar(msg({ broadcast: true }))).tratamento, "IGNORADA");
  assertEquals((await enviar(msg({ momment: AGORA.getTime() - 11 * 60_000 }))).tratamento, "ANTIGA");
  assertEquals(rpcs.length, 0);
});

Deno.test("pedido de código: gera, guarda só o hash e responde na conversa", async () => {
  const { enviar, rpcs, whatsapp } = montar();
  assertEquals((await enviar(msg())).tratamento, "CODIGO_ENVIADO");
  const pedido = rpcs.find((r) => r.funcao === "otp_issue_code")!.args;
  assertEquals(pedido.p_ref, "K7Q2");
  assertEquals(pedido.p_senders, ["+5577998128809", "+557798128809"]);
  assertMatch(String(pedido.p_code_hash), /^[0-9a-f]{64}$/);
  const enviada = whatsapp.enviadas[0]!;
  assertMatch(enviada.codigo!, /^\d{6}$/);
  assertEquals(enviada.texto.includes(enviada.codigo!), true);
  assertEquals(String(pedido.p_code_hash).includes(enviada.codigo!), false);
  assertEquals((await enviar(msg())).tratamento, "REPETIDA");
});

Deno.test("respostas: outro número, referência inválida e bloqueio", async () => {
  const outro = montar({ resultado: { acao: "NUMERO_DIFERENTE" } });
  assertEquals((await outro.enviar(msg())).tratamento, "NUMERO_DIFERENTE");
  assertEquals(outro.whatsapp.enviadas[0]!.telefone, "+5577998128809");
  const bloqueado = montar({ resultado: { acao: "BLOQUEADO", ate: "2026-10-10T12:30:00Z" } });
  await bloqueado.enviar(msg());
  assertEquals(bloqueado.whatsapp.enviadas[0]!.texto, "Muitas tentativas com este número. Você pode pedir um código de novo às *09:30*.");
  const aguarde = montar({ resultado: { acao: "AGUARDE" } });
  assertEquals((await aguarde.enviar(msg())).tratamento, "AGUARDE");
  assertEquals(aguarde.whatsapp.enviadas.length, 0);
});

Deno.test("sem número (LID), conversa comum, consulta e excesso de mensagens", async () => {
  assertEquals((await montar().enviar(msg({ phone: "123456789012345@lid" }))).tratamento, "SEM_NUMERO");
  assertEquals((await montar().enviar(msg({ text: { message: "Oi, tem a Limone?" } }))).tratamento, "CONVERSA");
  assertEquals((await montar().enviar(msg({ text: { message: "Minha reserva" } }))).tratamento, "MINHA_RESERVA");
  assertEquals((await montar({ limite: false }).enviar(msg())).tratamento, "LIMITE");
});

Deno.test("status de entrega atualiza a fila", async () => {
  const { enviar, rpcs } = montar();
  assertEquals((await enviar({ type: "MessageStatusCallback", status: "READ", ids: ["zapi-1"] })).tratamento, "STATUS");
  assertEquals(rpcs[0], { funcao: "outbox_delivery", args: { p_provider_message_id: "zapi-1", p_status: "LIDA" } });
  assertEquals(lerWebhookZapi({ type: "MessageStatusCallback", status: "SENT", ids: ["x"] }), { tipo: "OUTRO" });
});
