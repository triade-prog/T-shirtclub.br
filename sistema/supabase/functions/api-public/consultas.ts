// Consulta (F9): pelo site com código, pelo link da reserva e a lista do telefone
// (seções 07 e 11, regra 22, G6, G13, D13).
// 1. POST /v1/lookup-attempts: CONSULTA (telefone + Turnstile) ou ENTREGA (a partir do
//    link, telefone da sessão dele). Cria a referência; o cookie __Host-consulta prende a
//    consulta a este navegador. A cliente pede o código pelo WhatsApp (webhook-whatsapp).
// 2. POST .../verify: código certo abre a sessão do telefone (escopo TELEFONE).
// 3. GET /v1/me/reservations: as reservas do telefone da sessão.
// 4. POST /v1/r: a chave do fragmento do link abre a sessão só daquela reserva.

import type { Hono } from "hono";
import {
  COOKIES_LOJA,
  ErroDominio,
  consultaSchema,
  linkReservaSchema,
  linkWhatsApp,
  mascararTelefone,
  textoPedidoCodigo,
  verificarConsultaSchema,
} from "@tshirtclub/domain";
import { apagarCookie, gravarCookie } from "../_shared/cookies.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { hashCodigo, tokenAleatorio } from "../_shared/otp.ts";
import { ipDaCliente } from "../_shared/repasse.ts";
import { lerCorpo } from "../_shared/validar.ts";
import {
  COOKIE_SESSAO,
  comTelefoneMascarado,
  type DepsReserva,
  type ErroJson,
  falhou,
  idDaRota,
  limitar,
  sessaoDaReserva,
  sessaoDoCookie,
  sessaoOpcional,
  tokenDoCookie,
} from "./reservas.ts";

export const COOKIE_CONSULTA = COOKIES_LOJA.consulta;
const SESSAO_SEGUNDOS = 12 * 60 * 60;

export function rotasConsulta(app: Hono, deps: DepsReserva): void {
  async function abrirSessao(telefone: string, escopo: string): Promise<string> {
    const token = tokenAleatorio();
    await chamar(deps.banco, "create_customer_session", { p_phone: telefone, p_token_hash: await sha256Hex(token), p_scope: escopo });
    return gravarCookie(COOKIE_SESSAO, token, SESSAO_SEGUNDOS);
  }

  app.post("/v1/lookup-attempts", async (c) => {
    const dados = await lerCorpo(c, consultaSchema);
    const ip = ipDaCliente(c.req.raw.headers);
    const ipHash = await sha256Hex(`${deps.salIp ?? ""}:${ip ?? "sem-ip"}`);

    let telefone: string;
    let reservaId: string | null = null;
    if (dados.motivo === "CONSULTA") {
      if (!(await deps.turnstile.verificar(dados.turnstileToken, ip))) throw new ErroDominio("TURNSTILE_INVALID");
      await limitar(deps.banco, `consulta_ip:${ipHash}`, "1 hour", 60); // teto alto por causa do CGNAT (G11)
      telefone = dados.telefone;
    } else {
      // Pelo link: o telefone é o da reserva, e só quem abriu o link (ou a dona) chega aqui
      telefone = (await sessaoDaReserva(deps.banco, c, dados.reservaId)).telefone;
      reservaId = dados.reservaId;
    }
    await limitar(deps.banco, `consulta_tel:${await sha256Hex(telefone)}`, "30 minutes", 10);
    if (!(await deps.whatsapp.conectado())) throw new ErroDominio("WHATSAPP_OFFLINE");

    const token = tokenAleatorio();
    const r = await chamar<ErroJson & { id: string; ref: string }>(deps.banco, "create_lookup_attempt", {
      p_phone: telefone, p_reason: dados.motivo, p_reservation_id: reservaId, p_token_hash: await sha256Hex(token), p_ip_hash: ipHash,
    });
    falhou(r);

    const texto = textoPedidoCodigo(r.ref, dados.motivo);
    c.header("set-cookie", gravarCookie(COOKIE_CONSULTA, token, 60 * 60), { append: true });
    return c.json({
      id: r.id,
      ref: r.ref,
      telefone: mascararTelefone(telefone),
      whatsapp: { texto, url: linkWhatsApp(deps.numeroLoja, texto) },
    }, 201);
  });

  app.get("/v1/lookup-attempts/:id", async (c) => {
    const situacao = await chamar<{ telefone?: string } | null>(deps.banco, "lookup_status", {
      p_id: idDaRota(c),
      p_token_hash: await tokenDoCookie(c, COOKIE_CONSULTA),
    });
    if (!situacao) throw new ErroDominio("NOT_FOUND");
    return c.json(comTelefoneMascarado(situacao));
  });

  app.post("/v1/lookup-attempts/:id/verify", async (c) => {
    const id = idDaRota(c);
    const tokenHash = await tokenDoCookie(c, COOKIE_CONSULTA);
    const { codigo } = await lerCorpo(c, verificarConsultaSchema);
    const consulta = await chamar<{ ref: string } | null>(deps.banco, "lookup_status", { p_id: id, p_token_hash: tokenHash });
    if (!consulta) throw new ErroDominio("NOT_FOUND");

    const r = await chamar<ErroJson & { telefone: string; reservaId?: string }>(deps.banco, "verify_lookup", {
      p_id: id, p_token_hash: tokenHash, p_code_hash: await hashCodigo(deps.pepper, consulta.ref, codigo),
    });
    falhou(r);

    // Provou ser dona do número: sessão do telefone, que também libera a entrega (D13)
    c.header("set-cookie", await abrirSessao(r.telefone, "TELEFONE"), { append: true });
    c.header("set-cookie", apagarCookie(COOKIE_CONSULTA), { append: true });
    return c.json({ ok: true, ...(r.reservaId ? { reservaId: r.reservaId } : {}) });
  });

  // As reservas do telefone da sessão. A sessão do link vê só a reserva dela: para as
  // outras, a consulta com código.
  app.get("/v1/me/reservations", async (c) => {
    const sessao = await sessaoDoCookie(deps.banco, c);
    if (sessao.escopo !== "TELEFONE") throw new ErroDominio("PHONE_VERIFICATION_REQUIRED");
    return c.json({ reservas: await chamar(deps.banco, "customer_reservations", { p_phone: sessao.telefone }) });
  });

  // Link da reserva (G6): a página lê a chave do fragmento (#) e manda no corpo; ela nunca
  // passa pela URL, logs ou pré-visualização. Limite por IP contra tentativa e erro.
  app.post("/v1/r", async (c) => {
    const ipHash = await sha256Hex(`${deps.salIp ?? ""}:${ipDaCliente(c.req.raw.headers) ?? "sem-ip"}`);
    await limitar(deps.banco, `link_ip:${ipHash}`, "1 hour", 60);
    const { chave } = await lerCorpo(c, linkReservaSchema);
    const achada = await chamar<{ id: string; telefone: string } | null>(deps.banco, "reservation_by_key", { p_key_hash: await sha256Hex(chave) });
    if (!achada) throw new ErroDominio("NOT_FOUND");

    // Quem já tem a sessão do telefone dela não perde o acesso ao abrir o link
    const atual = await sessaoOpcional(deps.banco, c);
    const completa = atual?.escopo === "TELEFONE" && atual.telefone === achada.telefone;
    if (!completa) c.header("set-cookie", await abrirSessao(achada.telefone, `RESERVA:${achada.id}`), { append: true });

    const reserva = await chamar<{ telefone?: string }>(deps.banco, "reservation_for_customer", {
      p_id: achada.id, p_phone: achada.telefone, p_limited: !completa,
    });
    c.header("referrer-policy", "no-referrer");
    c.header("x-robots-tag", "noindex");
    return c.json({ reserva: comTelefoneMascarado(reserva), escopo: completa ? "TELEFONE" : "RESERVA" });
  });
}
