import { assertEquals, assertMatch } from "@std/assert";
import type { Banco } from "../_shared/banco.ts";
import { lerWebhookZapi, whatsappFalso } from "../_shared/whatsapp.ts";
import { criarWebhookWhatsApp } from "./app.ts";

const SEGREDO = "s".repeat(40);
const AGORA = new Date("2026-10-10T12:00:00Z");

interface Opcoes {
  resultado?: unknown;
  consulta?: unknown;
  reservas?: unknown[];
  limite?: boolean;
  boasVindas?: boolean;
  ofertas?: unknown[];
  trocas?: boolean;
  /** inbound_context (0540): sem respostas, o robô age como antes. */
  contexto?: Record<string, unknown>;
  /** inbound_answer: o banco libera a resposta. */
  liberada?: boolean;
}

function montar(opcoes: Opcoes = {}) {
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
          case "otp_issue_lookup_code":
            return opcoes.consulta ?? { acao: "REFERENCIA_INVALIDA" };
          case "whatsapp_my_reservations":
            return opcoes.reservas ?? [];
          case "inbound_welcome":
            return opcoes.boasVindas ?? false;
          case "inbound_exchange":
            return opcoes.trocas ?? false;
          case "whatsapp_offers":
            return opcoes.ofertas ?? [];
          case "inbound_context":
            return { ligadas: true, pausada: false, menuRecente: false, endereco: null, horario: null, respostas: [], ...opcoes.contexto };
          case "inbound_answer":
            return opcoes.liberada ?? true;
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
  return { app, enviar, rpcs, whatsapp };
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

Deno.test("corpo acima de 256 KB: 413 sem ler nem registrar; aviso desconhecido é ignorado", async () => {
  const { app, enviar, rpcs } = montar();
  const grande = await app.request(`/webhook-whatsapp/${SEGREDO}`, {
    method: "POST", headers: { "content-type": "application/json", "content-length": String(300 * 1024) }, body: "{}",
  });
  assertEquals(grande.status, 413);
  assertEquals((await enviar({ type: "DeliveryCallback", messageId: "x" })).tratamento, "IGNORADA");
  assertEquals((await enviar({ type: "ReceivedCallback" })).tratamento, "IGNORADA", "sem messageId não é processada");
  assertEquals(rpcs.length, 0);
});

Deno.test("descarta da loja, de grupo, de status/canal e antigas (G4)", async () => {
  const { enviar, rpcs } = montar();
  assertEquals((await enviar(msg({ fromMe: true, fromApi: true }))).tratamento, "DA_LOJA");
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
  assertEquals(pedido.p_senders, ["+5577998128809"]);
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
  assertEquals(bloqueado.whatsapp.enviadas[0]!.texto, "Foram feitas muitas tentativas com este número.\n\nVocê poderá solicitar um novo código às *09:30*.");
  const aguarde = montar({ resultado: { acao: "AGUARDE" } });
  assertEquals((await aguarde.enviar(msg())).tratamento, "AGUARDE");
  assertEquals(aguarde.whatsapp.enviadas.length, 0);
});

Deno.test("sem número (LID), conversa comum, consulta e excesso de mensagens", async () => {
  assertEquals((await montar().enviar(msg({ phone: "123456789012345@lid" }))).tratamento, "SEM_NUMERO");
  assertEquals((await montar().enviar(msg({ text: { message: "Oi, tem a Limone?" } }))).tratamento, "CONVERSA");
  assertEquals((await montar({ reservas: [] }).enviar(msg({ phone: "123456789012345@lid", text: { message: "Minha reserva" } }))).tratamento,
    "SEM_NUMERO");
  assertEquals((await montar({ limite: false }).enviar(msg())).tratamento, "LIMITE");
});

Deno.test("mensagem comum: resposta automática com o site quando o banco libera; senão, só conversa", async () => {
  const liberada = montar({ boasVindas: true });
  assertEquals((await liberada.enviar(msg({ text: { message: "Oi, tem a Limone?" } }))).tratamento, "BOAS_VINDAS");
  assertEquals(liberada.rpcs.find((x) => x.funcao === "inbound_welcome")!.args, { p_wa_message_id: "m1" });
  assertEquals(liberada.whatsapp.enviadas.length, 1);
  assertEquals(liberada.whatsapp.enviadas[0]!.telefone, "+5577998128809");
  assertMatch(liberada.whatsapp.enviadas[0]!.texto, /tshirtclub\.vercel\.app/);
  assertEquals(liberada.rpcs.some((x) => x.funcao === "inbound_mark"), false, "o banco já marcou BOAS_VINDAS");

  const jaRecebeu = montar({ boasVindas: false });
  assertEquals((await jaRecebeu.enviar(msg({ text: { message: "Oi, tem a Limone?" } }))).tratamento, "CONVERSA");
  assertEquals(jaRecebeu.whatsapp.enviadas.length, 0);

  const lid = montar({ boasVindas: true });
  assertEquals((await lid.enviar(msg({ phone: "123456789012345@lid", text: { message: "Oi" } }))).tratamento, "CONVERSA");
  assertEquals(lid.rpcs.some((x) => x.funcao === "inbound_welcome"), false);
  assertEquals(lid.whatsapp.enviadas.length, 0);
});

Deno.test("ofertas: responde com as promoções vigentes do banco, pulando o que não lê", async () => {
  const club = {
    id: "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f", tipo: "COMPRE_MAIS", modo: "PRECO_POR_GRUPO", nome: "Club", escopo: "TODOS", produtos: [],
    inicio: "2026-09-01T00:00:00Z", fim: "2026-12-31T00:00:00Z", situacao: "ATIVA", grupo: { qtd: 3, precoCentavos: 11999 }, umaPorCliente: false,
  };
  const { enviar, whatsapp, rpcs } = montar({ ofertas: [club, { tipo: "OUTRA_COISA" }] });
  assertEquals((await enviar(msg({ text: { message: "Promoções?" } }))).tratamento, "OFERTAS");
  assertEquals(rpcs.some((x) => x.funcao === "inbound_welcome"), false, "não conta como mensagem comum");
  assertEquals(whatsapp.enviadas.length, 1);
  assertMatch(whatsapp.enviadas[0]!.texto, /^Separei as ofertas de hoje para você ✦\n\n• \*Club\*: 3 peças por R\$ 119,99\n\n/);

  const vazio = montar();
  await vazio.enviar(msg({ text: { message: "oferta" } }));
  assertMatch(vazio.whatsapp.enviadas[0]!.texto, /^Hoje não tem oferta ativa/);
  assertEquals((await montar().enviar(msg({ phone: "123456789012345@lid", text: { message: "ofertas" } }))).tratamento, "SEM_NUMERO");
});

Deno.test("trocas: a política e o link quando o banco libera; repetida, fica para a equipe sem boas-vindas", async () => {
  const liberada = montar({ trocas: true, boasVindas: true });
  assertEquals((await liberada.enviar(msg({ text: { message: "Oi, quero trocar a Limone por um M" } }))).tratamento, "TROCAS");
  assertEquals(liberada.rpcs.find((x) => x.funcao === "inbound_exchange")!.args, { p_wa_message_id: "m1" });
  assertEquals(liberada.rpcs.some((x) => x.funcao === "inbound_welcome"), false, "não conta como mensagem comum");
  assertEquals(liberada.rpcs.some((x) => x.funcao === "inbound_mark"), false, "o banco já marcou TROCAS");
  assertEquals(liberada.whatsapp.enviadas.map((m) => m.telefone), ["+5577998128809"]);
  assertMatch(liberada.whatsapp.enviadas[0]!.texto, /até \*7 dias\*.*sem uso e com a etiqueta/);
  assertMatch(liberada.whatsapp.enviadas[0]!.texto, /tshirtclub\.vercel\.app\/trocas$/);

  const jaRecebeu = montar({ trocas: false, boasVindas: true });
  assertEquals((await jaRecebeu.enviar(msg({ text: { message: "Como faço a devolução?" } }))).tratamento, "CONVERSA");
  assertEquals(jaRecebeu.rpcs.some((x) => x.funcao === "inbound_welcome"), false);
  assertEquals(jaRecebeu.whatsapp.enviadas.length, 0);

  const lid = montar({ trocas: true });
  assertEquals((await lid.enviar(msg({ phone: "123456789012345@lid", text: { message: "troca" } }))).tratamento, "CONVERSA");
  assertEquals(lid.rpcs.some((x) => x.funcao === "inbound_exchange"), false);
  assertEquals(lid.whatsapp.enviadas.length, 0);

  // O pedido de código vem antes: a referência vale mesmo com "troca" no texto
  assertEquals((await montar({ trocas: true }).enviar(msg({ text: { message: "Quero confirmar a entrega do pedido (ref. K7Q2) e trocar" } }))).tratamento,
    "CODIGO_ENVIADO");
});

Deno.test("status de entrega atualiza a fila", async () => {
  const { enviar, rpcs } = montar();
  assertEquals((await enviar({ type: "MessageStatusCallback", status: "READ", ids: ["zapi-1"] })).tratamento, "STATUS");
  assertEquals(rpcs[0], { funcao: "outbox_delivery", args: { p_provider_message_id: "zapi-1", p_status: "LIDA" } });
  assertEquals(lerWebhookZapi({ type: "MessageStatusCallback", status: "SENT", ids: ["x"] }), { tipo: "OUTRO" });
});

Deno.test("consulta e entrega pelo link: código pela referência da consulta, com a reserva como reserva", async () => {
  const codigo = { acao: "ENVIAR_CODIGO", telefone: "+5577998128809", validadeMinutos: 5 };
  const consulta = montar({ consulta: codigo, resultado: { acao: "REFERENCIA_INVALIDA" } });
  assertEquals((await consulta.enviar(msg({ text: { message: "Quero consultar minhas reservas (ref. AB3D)" } }))).tratamento, "CODIGO_ENVIADO");
  assertEquals(consulta.rpcs.filter((r) => r.funcao.startsWith("otp_issue")).map((r) => r.funcao), ["otp_issue_lookup_code"]);

  const entrega = montar({ consulta: codigo });
  assertEquals((await entrega.enviar(msg({ text: { message: "Quero confirmar a entrega do pedido (ref. E5R2)" } }))).tratamento, "CODIGO_ENVIADO");
  assertEquals(entrega.rpcs.find((r) => r.funcao === "otp_issue_lookup_code")!.args.p_ref, "E5R2");

  // Texto mexido: a referência da reserva ainda funciona depois de não ser de consulta
  const mexido = montar();
  assertEquals((await mexido.enviar(msg({ text: { message: "consultar ref K7Q2" } }))).tratamento, "CODIGO_ENVIADO");
  assertEquals(mexido.rpcs.filter((r) => r.funcao.startsWith("otp_issue")).map((r) => r.funcao), ["otp_issue_lookup_code", "otp_issue_code"]);

  const nenhuma = montar({ resultado: { acao: "REFERENCIA_INVALIDA" } });
  assertEquals((await nenhuma.enviar(msg())).tratamento, "REFERENCIA_INVALIDA");
});

Deno.test("minha reserva: sem o nono dígito, acha as reservas e responde no número guardado", async () => {
  const { enviar, rpcs, whatsapp } = montar({
    reservas: [{ numero: 1049, status: "RESERVADO", pecas: 1, totalCentavos: 4999, expiraEm: "2026-10-10T12:15:00Z", telefone: "+5577998128809" }],
  });
  assertEquals((await enviar(msg({ phone: "557798128809", text: { message: "minhas reservas" } }))).tratamento, "MINHA_RESERVA");
  assertEquals(rpcs.find((r) => r.funcao === "whatsapp_my_reservations")!.args.p_senders, ["+5577998128809"]);
  assertEquals(whatsapp.enviadas.map((m) => [m.telefone, m.texto]), [
    ["+5577998128809", "Achei! Esta é sua reserva recente:\n\n• #1049 · reservada até *09:15* · 1 peça · R$ 49,99\n\nPara ver todos os detalhes:\ntshirtclub.vercel.app"],
  ], "vai para o número da reserva, sem o telefone no texto");
  const vazio = montar();
  await vazio.enviar(msg({ text: { message: "status" } }));
  assertMatch(vazio.whatsapp.enviadas[0]!.texto, /^Procurei aqui e não achei reservas recentes/);
});

// ─── Atendimento automático (0540) ──────────────────────────────────────────────────

const RESPOSTAS = [
  { id: "r1", numero: 1, acao: "TEXTO", titulo: "Ver as peças", palavras: ["catalogo"], texto: "As peças estão em {site}" },
  { id: "r2", numero: 2, acao: "TEXTO", titulo: "Entrega e frete", palavras: ["frete", "motoboy"], texto: "Retirada, motoboy ou envio." },
  { id: "r3", numero: 3, acao: "TEXTO", titulo: "Horário e endereço", palavras: ["onde fica"], texto: "📍 {endereco}\n🕒 {horario}" },
  { id: "r4", numero: 4, acao: "OFERTAS", titulo: "Ofertas", palavras: ["cupom"], texto: null },
  { id: "r5", numero: 5, acao: "TROCAS", titulo: "Trocas", palavras: [], texto: null },
  { id: "r6", numero: 6, acao: "EQUIPE", titulo: "Falar com a equipe", palavras: ["atendente"], texto: "Pronto! Já avisamos a equipe." },
];
const texto = (m: string) => msg({ text: { message: m } });
const respondida = (rpcs: { funcao: string; args: Record<string, unknown> }[]) => rpcs.find((r) => r.funcao === "inbound_answer")?.args;

Deno.test("menu: boas-vindas com as opções; o número escolhido depois responde, sempre", async () => {
  const primeira = montar({ boasVindas: true, contexto: { respostas: RESPOSTAS } });
  assertEquals((await primeira.enviar(texto("Oi"))).tratamento, "BOAS_VINDAS");
  assertMatch(primeira.whatsapp.enviadas[0]!.texto, /^Oi! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖\n\n.*É só responder com o número:\n\*1\* · Ver as peças\n\*2\* · Entrega e frete\n.*\n\*6\* · Falar com a equipe$/s);
  assertEquals(primeira.rpcs.find((r) => r.funcao === "inbound_reply_sent")!.args, { p_wa_message_id: "m1", p_reply_id: "falso-1" },
    "o id da resposta fica guardado: quando ela volta como da loja, não é a equipe");

  const escolha = montar({ contexto: { respostas: RESPOSTAS, menuRecente: true } });
  assertEquals((await escolha.enviar(texto("2"))).tratamento, "RESPOSTA");
  assertEquals(respondida(escolha.rpcs), { p_wa_message_id: "m1", p_handled_as: "RESPOSTA", p_quick_reply: "r2", p_explicit: true });
  assertEquals(escolha.whatsapp.enviadas[0]!.texto, "Retirada, motoboy ou envio.\n\nQuer ver as outras opções? É só mandar *menu* ✦");

  // Sem o menu recente, "2" é mensagem comum
  const semMenu = montar({ boasVindas: true, contexto: { respostas: RESPOSTAS } });
  assertEquals((await semMenu.enviar(texto("2"))).tratamento, "BOAS_VINDAS");
  assertEquals(respondida(semMenu.rpcs), undefined);
});

Deno.test("menu: \"menu\" a qualquer hora, mesmo com a equipe na conversa", async () => {
  const { enviar, rpcs, whatsapp } = montar({ contexto: { respostas: RESPOSTAS, pausada: true } });
  assertEquals((await enviar(texto("Menu"))).tratamento, "MENU");
  assertEquals(respondida(rpcs), { p_wa_message_id: "m1", p_handled_as: "MENU", p_quick_reply: null, p_explicit: true });
  assertMatch(whatsapp.enviadas[0]!.texto, /^Como posso te ajudar\? É só responder com o número:\n\*1\* · Ver as peças/);
  // Sem respostas ligadas, "menu" é mensagem comum
  assertEquals((await montar({ contexto: { respostas: RESPOSTAS, ligadas: false } }).enviar(texto("menu"))).tratamento, "CONVERSA");
});

Deno.test("palavra: a resposta da primeira palavra achada, uma vez; preenche site, endereço e horário", async () => {
  const frete = montar({ contexto: { respostas: RESPOSTAS } });
  assertEquals((await frete.enviar(texto("Boa tarde! Qual o valor do frete pra Caetité?"))).tratamento, "RESPOSTA");
  assertEquals(respondida(frete.rpcs)!.p_explicit, false);
  assertEquals(respondida(frete.rpcs)!.p_quick_reply, "r2");

  const repetida = montar({ boasVindas: true, contexto: { respostas: RESPOSTAS }, liberada: false });
  assertEquals((await repetida.enviar(texto("e o frete?"))).tratamento, "CONVERSA", "repetida: fica para a equipe, sem boas-vindas");
  assertEquals(repetida.whatsapp.enviadas.length, 0);
  assertEquals(repetida.rpcs.some((r) => r.funcao === "inbound_welcome"), false);

  const loja = montar({ contexto: { respostas: RESPOSTAS, endereco: "R. Sátiro Santos, 38", horario: "Seg a sáb, 9h às 18h" } });
  await loja.enviar(texto("onde fica a loja?"));
  assertMatch(loja.whatsapp.enviadas[0]!.texto, /^📍 R\. Sátiro Santos, 38\n🕒 Seg a sáb, 9h às 18h\n\n/);
  const site = montar({ contexto: { respostas: RESPOSTAS } });
  await site.enviar(texto("tem catálogo?"));
  assertMatch(site.whatsapp.enviadas[0]!.texto, /^As peças estão em tshirtclub\.vercel\.app/);

  // Ofertas por palavra: as promoções, sem repetir à toa
  const cupom = montar({ contexto: { respostas: RESPOSTAS } });
  assertEquals((await cupom.enviar(texto("tem cupom?"))).tratamento, "OFERTAS");
  assertEquals(respondida(cupom.rpcs), { p_wa_message_id: "m1", p_handled_as: "RESPOSTA", p_quick_reply: "r4", p_explicit: false });
  // Troca continua com as palavras e a regra dela, antes das respostas
  const troca = montar({ trocas: true, contexto: { respostas: RESPOSTAS } });
  assertEquals((await troca.enviar(texto("quero trocar o frete"))).tratamento, "TROCAS");
  assertEquals(troca.rpcs.some((r) => r.funcao === "inbound_answer"), false);
});

Deno.test("equipe: avisa pelo banco e responde com o texto do painel; trocas pelo menu sempre sai", async () => {
  const equipe = montar({ contexto: { respostas: RESPOSTAS } });
  assertEquals((await equipe.enviar(texto("quero falar com um atendente"))).tratamento, "EQUIPE");
  assertEquals(respondida(equipe.rpcs), { p_wa_message_id: "m1", p_handled_as: "EQUIPE", p_quick_reply: "r6", p_explicit: false });
  assertEquals(equipe.whatsapp.enviadas[0]!.texto, "Pronto! Já avisamos a equipe.");

  const trocas = montar({ contexto: { respostas: RESPOSTAS, menuRecente: true } });
  assertEquals((await trocas.enviar(texto("5️⃣"))).tratamento, "TROCAS");
  assertEquals(respondida(trocas.rpcs)!.p_handled_as, "TROCAS");
  assertEquals(trocas.rpcs.some((r) => r.funcao === "inbound_exchange"), false, "escolhida no menu, sem o limite de 24 h");
  assertMatch(trocas.whatsapp.enviadas[0]!.texto, /até \*7 dias\*/);
});

Deno.test("pausa: com a equipe na conversa, o robô fica quieto, menos o código", async () => {
  const quieto = montar({ boasVindas: true, trocas: true, contexto: { respostas: RESPOSTAS, pausada: true, menuRecente: true } });
  for (const [i, m] of ["2", "qual o frete?", "quero trocar", "Oi"].entries()) {
    assertEquals((await quieto.enviar(msg({ messageId: `p${i}`, text: { message: m } }))).tratamento, "CONVERSA");
  }
  assertEquals(quieto.whatsapp.enviadas.length, 0);
  assertEquals((await quieto.enviar(msg({ messageId: "p9" }))).tratamento, "CODIGO_ENVIADO");

  // A equipe respondeu pelo celular: só o id e a conversa vão para o banco
  const loja = montar();
  assertEquals((await loja.enviar(msg({ messageId: "e1", fromMe: true, text: { message: "Oi Ana, temos sim!" } }))).tratamento, "DA_LOJA");
  assertEquals(loja.rpcs, [{ funcao: "inbound_from_store", args: { p_wa_message_id: "e1", p_chat: "5577998128809" } }]);
  assertEquals((await loja.enviar(msg({ messageId: "e2", fromMe: true, momment: AGORA.getTime() - 11 * 60_000 }))).tratamento, "DA_LOJA");
  assertEquals((await loja.enviar(msg({ messageId: "e3", fromMe: true, phone: "123456789012345@lid" }))).tratamento, "DA_LOJA");
  assertEquals(loja.rpcs.length, 1, "antiga ou sem número: nada");
});

Deno.test("respostas desligadas: sem menu nas boas-vindas e sem resposta por palavra", async () => {
  const { enviar, whatsapp, rpcs } = montar({ boasVindas: true, contexto: { respostas: RESPOSTAS, ligadas: false } });
  assertEquals((await enviar(texto("qual o frete?"))).tratamento, "BOAS_VINDAS");
  assertEquals(rpcs.some((r) => r.funcao === "inbound_answer"), false);
  assertMatch(whatsapp.enviadas[0]!.texto, /a equipe te responde assim que puder\.$/);
});

Deno.test("menu ligado: trocas, ofertas e minha reserva terminam com a volta para o menu", async () => {
  const volta = /\n\nQuer ver as outras opções\? É só mandar \*menu\* ✦$/;
  const trocas = montar({ contexto: { respostas: RESPOSTAS, menuRecente: true } });
  await trocas.enviar(texto("5"));
  assertMatch(trocas.whatsapp.enviadas[0]!.texto, volta);

  const ofertas = montar({ contexto: { respostas: RESPOSTAS } });
  assertEquals((await ofertas.enviar(texto("ofertas"))).tratamento, "OFERTAS");
  assertMatch(ofertas.whatsapp.enviadas[0]!.texto, volta);

  const minha = montar({ contexto: { respostas: RESPOSTAS } });
  assertEquals((await minha.enviar(texto("minha reserva"))).tratamento, "MINHA_RESERVA");
  assertMatch(minha.whatsapp.enviadas[0]!.texto, volta);

  const palavra = montar({ trocas: true, contexto: { respostas: RESPOSTAS } });
  assertEquals((await palavra.enviar(texto("quero trocar"))).tratamento, "TROCAS");
  assertMatch(palavra.whatsapp.enviadas[0]!.texto, volta);

  // Sem as respostas rápidas (desligadas), "menu" não responde: nada de mandar a cliente para ele
  const desligadas = montar({ contexto: { respostas: RESPOSTAS, ligadas: false } });
  await desligadas.enviar(texto("ofertas"));
  assertEquals(volta.test(desligadas.whatsapp.enviadas[0]!.texto), false);
});
