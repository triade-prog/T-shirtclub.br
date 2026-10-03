// Webhook da ferramenta do WhatsApp no formato da Z-API (Z-API ou Wafly; seção 07, G4).
// Sem assinatura da ferramenta: a URL tem um segmento secreto de 32+ caracteres, comparado
// em tempo constante e trocável sem deploy. Aviso que não é mensagem nem status vai para o
// log só com o tipo e os nomes dos campos (para conferir o formato de uma ferramenta nova).
// Descarta mensagens da própria loja (a equipe atende pelo celular), de grupos, status e
// canais, e as com mais de 10 min. Cada mensagem é tratada uma vez, com limite por
// remetente. O pedido de código é respondido na hora, na mesma conversa (fora da fila).
// Atendimento automático (0540): respostas rápidas do painel por palavra ou pelo número do
// menu, "menu" a qualquer hora e "falar com a equipe". Quando a equipe responde pelo celular
// (a mensagem "da loja" que não é do robô), o robô fica quieto naquela conversa por um tempo.

import { Hono } from "hono";
import {
  candidatosDoRemetente,
  ehPedidoMenu,
  ehPedidoMinhaReserva,
  ehPedidoOfertas,
  ehPedidoTroca,
  lerOpcaoDoMenu,
  lerPedidoDeCodigo,
  mensagemWhatsApp,
  type OpcaoMenu,
  type PecaLink,
  preencherResposta,
  type Promocao,
  promocaoDoBancoSchema,
  respostaPorPalavra,
  type RespostaRapida,
  type ResumoReserva,
  SITE_LOJA,
} from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { gerarCodigo, hashCodigo } from "../_shared/otp.ts";
import { relatarErro } from "../_shared/monitor.ts";
import { segredoConfere } from "../_shared/repasse.ts";
import { formaDoAviso, lerWebhookZapi, type EventoWhatsApp, type WhatsAppProvider } from "../_shared/whatsapp.ts";

export interface DepsWebhook {
  banco: Banco;
  whatsapp: WhatsAppProvider;
  pepper: string;
  segredo: string;
  agora?: () => Date;
  sorteio?: () => number;
}

/** O que o banco diz antes de responder uma mensagem comum (inbound_context, 0540). */
interface Contexto {
  ligadas: boolean;
  pausada: boolean;
  menuRecente: boolean;
  endereco: string | null;
  horario: string | null;
  /** Primeiro nome da última reserva do número e a coleção mais nova (0550). */
  nome?: string | null;
  novidade?: PecaLink | null;
  respostas: RespostaRapida[];
}

type Resultado = { acao: "ENVIAR_CODIGO"; telefone: string; validadeMinutos: number } | { acao: "NUMERO_DIFERENTE" | "REFERENCIA_INVALIDA" | "AGUARDE" } | { acao: "BLOQUEADO"; ate: string };

const DEZ_MINUTOS = 10 * 60 * 1000;
const LIMITE_CORPO = 256 * 1024;

export function criarWebhookWhatsApp(deps: DepsWebhook) {
  const app = new Hono().basePath("/webhook-whatsapp");
  const agora = () => deps.agora?.() ?? new Date();
  const sorteio = () => deps.sorteio?.() ?? Math.random();

  async function marcar(id: string, como: string): Promise<string> {
    await deps.banco.rpc("inbound_mark", { p_wa_message_id: id, p_handled_as: como });
    return como;
  }

  async function responder(id: string, remetente: string, texto: string): Promise<void> {
    await responderPara(id, `+${remetente}`, texto);
  }

  async function responderPara(id: string, telefone: string, texto: string): Promise<void> {
    try {
      await registrarResposta(id, (await deps.whatsapp.enviarTexto(telefone, texto)).id);
    } catch (e) {
      await relatarErro(e, { tarefa: "resposta-na-conversa" });
    }
  }

  /**
   * O id da resposta fica na mensagem recebida: quando ela volta pelo webhook como "da loja",
   * o banco sabe que foi o robô, não a equipe. Sem ele, a conversa só pode pausar à toa.
   */
  async function registrarResposta(id: string, envio: string): Promise<void> {
    if (!envio) return;
    try {
      await deps.banco.rpc("inbound_reply_sent", { p_wa_message_id: id, p_reply_id: envio });
    } catch (e) {
      console.warn(`Id da resposta não registrado: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** "Minha reserva" (regra 22): o remetente é a prova; responde na conversa, sem código. */
  async function minhaReserva(id: string, remetente: string | null, menu = false): Promise<string> {
    const candidatos = candidatosDoRemetente(remetente);
    if (candidatos.length === 0 || !remetente) return await marcar(id, "SEM_NUMERO");
    const lista = await deps.banco.rpc<(Omit<ResumoReserva, "expiraEm"> & { expiraEm?: string; telefone: string })[]>(
      "whatsapp_my_reservations", { p_senders: candidatos },
    );
    if (lista.length === 0) {
      await responder(id, remetente, mensagemWhatsApp("minhas_reservas", { reservas: [], menu }));
      return await marcar(id, "MINHA_RESERVA");
    }
    // Para o número guardado na reserva (como o código): quem escreveu de um fixo que
    // coincide com o celular de outra pessoa não recebe nada dela
    const porTelefone = new Map<string, ResumoReserva[]>();
    for (const { telefone, expiraEm, ...r } of lista) {
      porTelefone.set(telefone, [...(porTelefone.get(telefone) ?? []), { ...r, expiraEm: expiraEm ? new Date(expiraEm) : undefined }]);
    }
    for (const [telefone, reservas] of porTelefone) await responderPara(id, telefone, mensagemWhatsApp("minhas_reservas", { reservas, menu }));
    return await marcar(id, "MINHA_RESERVA");
  }

  /** "Ofertas": as promoções e cupons vigentes do painel, na conversa. Linha que não lê é pulada. */
  async function ofertas(id: string, remetente: string | null, menu = false): Promise<string> {
    if (!remetente) return await marcar(id, "SEM_NUMERO");
    const linhas = await deps.banco.rpc<unknown[]>("whatsapp_offers");
    const promocoes = linhas.flatMap((l): Promocao[] => {
      const r = promocaoDoBancoSchema.safeParse(l);
      return r.success ? [r.data] : [];
    });
    await responder(id, remetente, mensagemWhatsApp("ofertas", { promocoes, menu }));
    return await marcar(id, "OFERTAS");
  }

  /**
   * Fala em troca ou devolução: a política e o link de /trocas, no máximo 1 vez a cada 24 h
   * por número (o banco decide e já marca; a loja pode desligar no painel). Repetida ou
   * desligada, fica como conversa, sem boas-vindas: quem pediu troca espera a equipe, não o site.
   */
  async function trocas(id: string, remetente: string | null, menu = false): Promise<string> {
    if (!remetente || !(await deps.banco.rpc<boolean>("inbound_exchange", { p_wa_message_id: id }))) return await marcar(id, "CONVERSA");
    await responder(id, remetente, mensagemWhatsApp("trocas", { menu }));
    return "TROCAS";
  }

  /**
   * Mensagem comum: a Clubinha se apresenta (pelo nome, quando sabe), mostra a coleção mais nova
   * e o menu, no máximo 1 vez a cada 24 h por número (o banco decide e já marca, e a loja pode
   * desligar no painel); a equipe segue atendendo pelo celular.
   */
  async function conversa(id: string, remetente: string, opcoes: OpcaoMenu[], ctx: Contexto): Promise<string> {
    if (!(await deps.banco.rpc<boolean>("inbound_welcome", { p_wa_message_id: id }))) return await marcar(id, "CONVERSA");
    await responder(id, remetente, mensagemWhatsApp("boas_vindas", { ...(opcoes.length ? { opcoes } : {}), nome: ctx.nome, novidade: ctx.novidade }));
    return "BOAS_VINDAS";
  }

  /** O banco decide e marca (inbound_answer): por palavra, a mesma resposta não se repete. */
  function liberada(id: string, como: "RESPOSTA" | "EQUIPE" | "TROCAS", r: RespostaRapida, explicita: boolean): Promise<boolean> {
    return deps.banco.rpc<boolean>("inbound_answer", { p_wa_message_id: id, p_handled_as: como, p_quick_reply: r.id, p_explicit: explicita });
  }

  /** Uma opção do menu, escolhida pelo número (explicita) ou por uma palavra da mensagem. */
  async function executar(id: string, remetente: string, r: RespostaRapida, explicita: boolean, ctx: Contexto): Promise<string> {
    switch (r.acao) {
      case "MINHA_RESERVA":
      case "OFERTAS":
        if (!explicita && !(await liberada(id, "RESPOSTA", r, false))) return await marcar(id, "CONVERSA");
        return r.acao === "OFERTAS" ? await ofertas(id, remetente, true) : await minhaReserva(id, remetente, true);
      case "TROCAS":
        await liberada(id, "TROCAS", r, true);
        await responder(id, remetente, mensagemWhatsApp("trocas", { menu: true }));
        return "TROCAS";
      case "TEXTO":
      case "EQUIPE": {
        const como = r.acao === "EQUIPE" ? "EQUIPE" : "RESPOSTA";
        if (!(await liberada(id, como, r, explicita))) return await marcar(id, "CONVERSA");
        const texto = preencherResposta(r.texto ?? "", { site: SITE_LOJA, endereco: ctx.endereco, horario: ctx.horario });
        await responder(id, remetente, como === "EQUIPE" ? texto : mensagemWhatsApp("resposta_rapida", { texto }));
        return como;
      }
    }
  }

  /**
   * Tudo que não é pedido de código, "minha reserva" nem "ofertas". Na ordem: "menu"; conversa
   * com a equipe (o robô fica quieto); número do menu recente; troca; palavra de uma resposta
   * rápida; e, por fim, as boas-vindas com o menu. Remetente sem número (LID) não recebe nada.
   */
  async function atendimento(id: string, remetente: string | null, texto: string, ctx: Contexto | null): Promise<string> {
    if (!remetente || !ctx) return await marcar(id, "CONVERSA");
    const respostas = ctx.ligadas ? ctx.respostas : [];
    const opcoes = respostas.map(({ numero, titulo }) => ({ numero, titulo }));
    if (opcoes.length && ehPedidoMenu(texto)) {
      await deps.banco.rpc("inbound_answer", { p_wa_message_id: id, p_handled_as: "MENU", p_quick_reply: null, p_explicit: true });
      await responder(id, remetente, mensagemWhatsApp("menu", { opcoes }));
      return "MENU";
    }
    if (ctx.pausada) return await marcar(id, "CONVERSA");
    const numero = lerOpcaoDoMenu(texto);
    const escolhida = numero !== null && ctx.menuRecente ? respostas.find((r) => r.numero === numero) : undefined;
    if (escolhida) return await executar(id, remetente, escolhida, true, ctx);
    if (ehPedidoTroca(texto)) return await trocas(id, remetente, opcoes.length > 0);
    const porPalavra = respostaPorPalavra(texto, respostas);
    if (porPalavra) return await executar(id, remetente, porPalavra, false, ctx);
    return await conversa(id, remetente, opcoes, ctx);
  }

  async function tratar(e: EventoWhatsApp): Promise<string> {
    if (e.tipo === "STATUS") {
      for (const id of e.ids) await deps.banco.rpc("outbox_delivery", { p_provider_message_id: id, p_status: e.status });
      return "STATUS";
    }
    if (e.tipo === "OUTRO" || e.grupo || e.canal) return "IGNORADA";
    const recente = !Number.isNaN(e.momento.getTime()) && agora().getTime() - e.momento.getTime() <= DEZ_MINUTOS;
    if (e.deMim) {
      // A equipe respondeu pelo celular: o robô dá um tempo nessa conversa (0540). Só o id e a
      // conversa vão para o banco, sem o texto. As da API são do próprio sistema.
      if (recente && e.remetente && !e.daApi) await deps.banco.rpc("inbound_from_store", { p_wa_message_id: e.id, p_chat: e.remetente });
      return "DA_LOJA";
    }
    if (!recente) return "ANTIGA";

    const reg = await deps.banco.rpc<{ novo: boolean; dentroDoLimite: boolean }>("inbound_register", {
      p_wa_message_id: e.id,
      p_from: e.remetente,
      p_text: e.texto,
    });
    if (!reg.novo) return "REPETIDA";
    if (!reg.dentroDoLimite) return await marcar(e.id, "LIMITE");

    const pedido = lerPedidoDeCodigo(e.texto);
    if (!pedido) {
      // O que o banco diz desta conversa (respostas, menu, pausa); sem número, nada a responder
      const ctx = e.remetente ? await deps.banco.rpc<Contexto>("inbound_context", { p_wa_message_id: e.id }) : null;
      const comMenu = !!ctx?.ligadas && ctx.respostas.length > 0;
      if (ehPedidoOfertas(e.texto)) return await ofertas(e.id, e.remetente, comMenu);
      if (ehPedidoMinhaReserva(e.texto)) return await minhaReserva(e.id, e.remetente, comMenu);
      return await atendimento(e.id, e.remetente, e.texto, ctx);
    }

    const candidatos = candidatosDoRemetente(e.remetente);
    if (candidatos.length === 0 || !e.remetente) return await marcar(e.id, "SEM_NUMERO");

    // A referência é da tentativa de reserva ou da consulta (site ou entrega pelo link). O
    // texto diz qual; se a cliente mexeu nele, tenta a outra antes de dar como inválida.
    const codigo = gerarCodigo();
    const args = {
      p_ref: pedido.ref,
      p_senders: candidatos,
      p_code_hash: await hashCodigo(deps.pepper, pedido.ref, codigo),
      p_wa_message_id: e.id,
    };
    const [primeira, segunda] = pedido.finalidade === "RESERVA"
      ? ["otp_issue_code", "otp_issue_lookup_code"]
      : ["otp_issue_lookup_code", "otp_issue_code"];
    let r = await deps.banco.rpc<Resultado>(primeira, args);
    if (r.acao === "REFERENCIA_INVALIDA") r = await deps.banco.rpc<Resultado>(segunda, args);

    switch (r.acao) {
      case "ENVIAR_CODIGO":
        try {
          const texto = mensagemWhatsApp("codigo_verificacao", { codigo, minutos: r.validadeMinutos }, sorteio());
          const envio = await deps.whatsapp.enviarCodigo(r.telefone, texto, codigo);
          await registrarResposta(e.id, envio.id);
          return await marcar(e.id, "CODIGO_ENVIADO");
        } catch (erro) {
          await relatarErro(erro, { tarefa: "enviar-codigo" });
          return await marcar(e.id, "FALHA_ENVIO");
        }
      case "NUMERO_DIFERENTE":
        await responder(e.id, e.remetente, mensagemWhatsApp("numero_diferente", {}));
        return await marcar(e.id, "NUMERO_DIFERENTE");
      case "REFERENCIA_INVALIDA":
        await responder(e.id, e.remetente, mensagemWhatsApp("referencia_invalida", {}));
        return await marcar(e.id, "REFERENCIA_INVALIDA");
      case "BLOQUEADO":
        await responder(e.id, e.remetente, mensagemWhatsApp("codigo_bloqueado", { ate: new Date(r.ate) }));
        return await marcar(e.id, "BLOQUEADO");
      default:
        return await marcar(e.id, "AGUARDE");
    }
  }

  app.post("/:segredo", async (c) => {
    if (deps.segredo.length < 32 || !segredoConfere(c.req.param("segredo"), deps.segredo)) {
      return c.json({ erro: { codigo: "NOT_FOUND" } }, 404);
    }
    // Aviso de texto tem poucos KB; corpo grande não chega a ser lido
    if (Number(c.req.header("content-length") ?? 0) > LIMITE_CORPO) return c.json({ erro: { codigo: "PAYLOAD_TOO_LARGE" } }, 413);
    const corpo = await c.req.json().catch(() => null);
    const evento = lerWebhookZapi(corpo);
    if (evento.tipo === "OUTRO") console.log(JSON.stringify({ funcao: "webhook-whatsapp", aviso: "evento ignorado", ...formaDoAviso(corpo) }));
    return c.json({ ok: true, tratamento: await tratar(evento) });
  });

  app.onError(async (err, c) => {
    await relatarErro(err, { rota: c.req.routePath, metodo: c.req.method });
    return c.json({ erro: { codigo: "INTERNAL_ERROR" } }, 500); // a Z-API reenvia; o registro evita tratar duas vezes
  });
  app.notFound((c) => c.json({ erro: { codigo: "NOT_FOUND" } }, 404));
  return app;
}
