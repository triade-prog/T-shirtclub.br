// Do "Seus dados" à reserva criada (seções 05, 07 e 11; F3 e F4).
// 1. POST /v1/reservation-attempts: confere tudo o que dá antes de gastar uma mensagem
//    (Turnstile, limites, sacola, preço, WhatsApp no ar, bloqueios) e cria a tentativa com a
//    referência curta; o cookie __Host-tentativa prende a tentativa a este navegador (G12).
// 2. A cliente pede o código pelo WhatsApp (webhook-whatsapp); a tela acompanha pelo GET.
// 3. POST .../confirm: confere o código e chama create_reservation, que decide o estoque.
//    Devolve a reserva e grava a sessão da cliente (__Host-sessao).

import type { Context, Hono } from "hono";
import {
  COOKIES_LOJA,
  ErroDominio,
  ajustarItensSchema,
  entregaSchema,
  pagamentoSchema,
  pedidoCancelamentoSchema,
  confirmarTentativaSchema,
  criarTentativaSchema,
  ehCodigoErro,
  idSchema,
  linkWhatsApp,
  mascararTelefone,
  textoPedidoCodigo,
  type ItemCarrinho,
  type ResultadoPreco,
} from "@tshirtclub/domain";
import { apagarCookie, gravarCookie, lerCookie } from "../_shared/cookies.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { chaveLink, hashCodigo, tokenAleatorio } from "../_shared/otp.ts";
import { ipDaCliente } from "../_shared/repasse.ts";
import type { VerificadorTurnstile } from "../_shared/turnstile.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { WhatsAppProvider } from "../_shared/whatsapp.ts";
import type { PaymentProvider } from "../_shared/pagamentos.ts";
import { aplicar } from "../worker/pagamentos.ts";
import { cotar, type DepsLoja } from "./catalogo.ts";

export const COOKIE_TENTATIVA = COOKIES_LOJA.tentativa;
export const COOKIE_SESSAO = COOKIES_LOJA.sessao;

export interface DepsReserva extends DepsLoja {
  whatsapp: WhatsAppProvider;
  turnstile: VerificadorTurnstile;
  /** Segredo do HMAC do código (32+ caracteres). */
  pepper: string;
  /** WhatsApp da loja, para o link wa.me (ex.: 5577998155772). */
  numeroLoja: string;
  /** Endereço da loja, para o link da reserva (ex.: https://tshirtclub.pt). */
  urlLoja: string;
  /** Sal do hash do IP (G9). */
  salIp?: string;
  pagamentos: PaymentProvider;
}

export type ErroJson = { erro?: string; detalhes?: Record<string, unknown> };

/** Resultado de negócio das funções SQL ({ erro, detalhes }) vira o erro da API. */
export function falhou(r: ErroJson): void {
  if (!r.erro) return;
  throw new ErroDominio(ehCodigoErro(r.erro) ? r.erro : "INTERNAL_ERROR", r.detalhes);
}

export function comTelefoneMascarado<T extends { telefone?: string }>(v: T): T {
  return v.telefone ? { ...v, telefone: mascararTelefone(v.telefone) } : v;
}

export async function tokenDoCookie(c: Context, nome: string): Promise<string> {
  const token = lerCookie(c.req.raw.headers, nome);
  // Sem o cookie, a tentativa "não existe" para este navegador (G12).
  if (!token || token.length > 100) throw new ErroDominio("NOT_FOUND");
  return await sha256Hex(token);
}

export function idDaRota(c: Context): string {
  const r = idSchema.safeParse(c.req.param("id"));
  if (!r.success) throw new ErroDominio("NOT_FOUND");
  return r.data;
}

/** Limite de uso (hit_rate_limit, G20): passou do teto na janela, RATE_LIMITED. */
export async function limitar(banco: DepsReserva["banco"], chave: string, janela: string, maximo: number): Promise<void> {
  if (!(await chamar<boolean>(banco, "hit_rate_limit", { p_key: chave, p_window: janela, p_max: maximo }))) {
    throw new ErroDominio("RATE_LIMITED");
  }
}

export interface SessaoCliente {
  telefone: string;
  /** TELEFONE (depois do código) ou RESERVA:<id> (aberta pelo link, G6). */
  escopo: string;
}

/** Sessão do cookie __Host-sessao; sem cookie ou vencida, UNAUTHORIZED. */
export async function sessaoDoCookie(banco: DepsReserva["banco"], c: Context): Promise<SessaoCliente> {
  const sessao = await sessaoOpcional(banco, c);
  if (!sessao) throw new ErroDominio("UNAUTHORIZED");
  return sessao;
}

export async function sessaoOpcional(banco: DepsReserva["banco"], c: Context): Promise<SessaoCliente | null> {
  const token = lerCookie(c.req.raw.headers, COOKIE_SESSAO);
  if (!token || token.length > 100) return null;
  return await chamar<SessaoCliente | null>(banco, "customer_session_get", { p_token_hash: await sha256Hex(token) });
}

/** Sessão que pode ver esta reserva: a do telefone ou a do link dela. De outra, 404. */
export async function sessaoDaReserva(banco: DepsReserva["banco"], c: Context, reservaId: string): Promise<SessaoCliente> {
  const sessao = await sessaoDoCookie(banco, c);
  if (sessao.escopo !== "TELEFONE" && sessao.escopo !== `RESERVA:${reservaId}`) throw new ErroDominio("NOT_FOUND");
  return sessao;
}

export function rotasReserva(app: Hono, deps: DepsReserva): void {
  const agora = () => deps.agora?.() ?? new Date();
  const limite = (chave: string, janela: string, maximo: number) => limitar(deps.banco, chave, janela, maximo);

  /** Preço atual da sacola; o total precisa ser o que a cliente viu. */
  function conferirTotal(r: ResultadoPreco, esperado: number): void {
    if (r.totalCentavos !== esperado) throw new ErroDominio("PRICE_CHANGED", { totalCentavos: r.totalCentavos });
  }

  app.post("/v1/reservation-attempts", async (c) => {
    const dados = await lerCorpo(c, criarTentativaSchema);
    const ip = ipDaCliente(c.req.raw.headers);
    const ipHash = await sha256Hex(`${deps.salIp ?? ""}:${ip ?? "sem-ip"}`);

    if (!(await deps.turnstile.verificar(dados.turnstileToken, ip))) throw new ErroDominio("TURNSTILE_INVALID");
    // Por IP, só um teto alto (CGNAT, G11); o limite fino é por telefone.
    await limite(`tentativa_ip:${ipHash}`, "1 hour", 60);
    await limite(`tentativa_tel:${await sha256Hex(dados.telefone)}`, "30 minutes", 10);

    const preco = await cotar(deps.banco, dados.itens, dados.cupom, agora());
    if (dados.cupom && preco.cupom?.situacao === "INVALIDO") {
      throw new ErroDominio("COUPON_INVALID", {
        motivoCupom: preco.cupom.motivo,
        ...(preco.cupom.gastoMinimoCentavos ? { gastoMinimoCentavos: preco.cupom.gastoMinimoCentavos } : {}),
      });
    }
    conferirTotal(preco, dados.totalEsperadoCentavos);
    if (!(await deps.whatsapp.conectado())) throw new ErroDominio("WHATSAPP_OFFLINE");

    const token = tokenAleatorio();
    const r = await chamar<ErroJson & { id: string; ref: string }>(deps.banco, "create_reservation_attempt", {
      p: {
        nome: dados.nome,
        telefone: dados.telefone,
        entrega: dados.entrega,
        itens: dados.itens,
        cupom: dados.cupom ?? null,
        totalEsperadoCentavos: dados.totalEsperadoCentavos,
        ipHash,
        tokenHash: await sha256Hex(token),
      },
    });
    falhou(r);

    const texto = textoPedidoCodigo(r.ref);
    c.header("set-cookie", gravarCookie(COOKIE_TENTATIVA, token, 60 * 60), { append: true });
    return c.json({
      id: r.id,
      ref: r.ref,
      telefone: mascararTelefone(dados.telefone),
      whatsapp: { texto, url: linkWhatsApp(deps.numeroLoja, texto) },
    }, 201);
  });

  app.get("/v1/reservation-attempts/:id", async (c) => {
    const situacao = await chamar<{ telefone?: string } | null>(deps.banco, "attempt_status", {
      p_attempt_id: idDaRota(c),
      p_token_hash: await tokenDoCookie(c, COOKIE_TENTATIVA),
    });
    if (!situacao) throw new ErroDominio("NOT_FOUND");
    return c.json(comTelefoneMascarado(situacao));
  });

  app.post("/v1/reservation-attempts/:id/confirm", async (c) => {
    const id = idDaRota(c);
    const tokenHash = await tokenDoCookie(c, COOKIE_TENTATIVA);
    const { codigo } = await lerCorpo(c, confirmarTentativaSchema);

    const a = await chamar<{
      ref: string; status: string; verificadaAte: string | null; telefone: string; itens: ItemCarrinho[]; cupom: string | null;
    } | null>(deps.banco, "attempt_for_confirm", { p_attempt_id: id, p_token_hash: tokenHash });
    if (!a) throw new ErroDominio("NOT_FOUND");

    const verificada = a.status === "CONVERTIDA" ||
      (["VERIFICADA", "FALHOU_ESTOQUE"].includes(a.status) && a.verificadaAte !== null && Date.parse(a.verificadaAte) > agora().getTime());
    if (!verificada) {
      if (!codigo) throw new ErroDominio("ATTEMPT_NOT_VERIFIED");
      falhou(await chamar<ErroJson>(deps.banco, "otp_verify", {
        p_attempt_id: id,
        p_token_hash: tokenHash,
        p_code_hash: await hashCodigo(deps.pepper, a.ref, codigo),
      }));
    }

    const historico = await chamar<{ usosDoCupom: number; primeiroUsoDoCupom: string | null; promocoesUsadas: string[] }>(
      deps.banco, "pricing_customer", { p_phone: a.telefone, p_coupon: a.cupom });
    const preco = await cotar(deps.banco, a.itens, a.cupom ?? undefined, agora(), {
      conferirEstoque: false, // o estoque quem decide é create_reservation, com os produtos travados
      cliente: {
        usosDoCupom: historico.usosDoCupom,
        primeiroUsoDoCupom: historico.primeiroUsoDoCupom ? new Date(historico.primeiroUsoDoCupom) : null,
        promocoesUsadas: new Set(historico.promocoesUsadas),
      },
    });

    const chave = chaveLink();
    const r = await chamar<ErroJson & { reserva: { telefone: string } & Record<string, unknown> }>(deps.banco, "create_reservation", {
      p_attempt_id: id,
      p_token_hash: tokenHash,
      p: {
        linhas: preco.linhas.map((l) => ({
          produtoId: l.produtoId, qtd: l.qtd, precoTabelaCentavos: l.precoTabelaCentavos,
          descontoCentavos: l.descontoCentavos, totalCentavos: l.totalCentavos,
        })),
        subtotalCentavos: preco.subtotalCentavos,
        descontoCentavos: preco.descontoCentavos,
        totalCentavos: preco.totalCentavos,
        aplicada: preco.aplicada,
        chaveHash: await sha256Hex(chave),
        link: `${deps.urlLoja}/r#${chave}`,
      },
    });
    if (r.erro === "PRICE_CHANGED" && !r.detalhes) r.detalhes = { totalCentavos: preco.totalCentavos };
    falhou(r);

    // Sessão da cliente (escopo TELEFONE): ela acabou de provar que é dona do número.
    const sessao = tokenAleatorio();
    await chamar(deps.banco, "create_customer_session", {
      p_phone: r.reserva.telefone,
      p_token_hash: await sha256Hex(sessao),
      p_scope: "TELEFONE",
    });
    c.header("set-cookie", gravarCookie(COOKIE_SESSAO, sessao, 12 * 60 * 60), { append: true });
    c.header("set-cookie", apagarCookie(COOKIE_TENTATIVA), { append: true });
    return c.json({ reserva: comTelefoneMascarado(r.reserva) }, 201);
  });

  app.put("/v1/reservation-attempts/:id/items", async (c) => {
    const id = idDaRota(c);
    const tokenHash = await tokenDoCookie(c, COOKIE_TENTATIVA);
    const dados = await lerCorpo(c, ajustarItensSchema);
    const preco = await cotar(deps.banco, dados.itens, dados.cupom, agora());
    conferirTotal(preco, dados.totalEsperadoCentavos);
    const r = await chamar<ErroJson & { ok: boolean; verificadaAte: string }>(deps.banco, "attempt_update_items", {
      p_attempt_id: id,
      p_token_hash: tokenHash,
      p: { itens: dados.itens, totalEsperadoCentavos: dados.totalEsperadoCentavos, cupom: dados.cupom ?? null },
    });
    falhou(r);
    return c.json(r);
  });

  async function telefoneDaSessao(c: Context, reservaId: string): Promise<string> {
    return (await sessaoDaReserva(deps.banco, c, reservaId)).telefone;
  }

  // Reserva da cliente: só do telefone da sessão ou a do link. De outro telefone, 404. Pelo
  // link, passados 30 dias do fim, só número e estado (G6).
  app.get("/v1/reservations/:id", async (c) => {
    const id = idDaRota(c);
    const sessao = await sessaoDaReserva(deps.banco, c, id);
    const reserva = await chamar<{ telefone?: string } | null>(deps.banco, "reservation_for_customer", {
      p_id: id,
      p_phone: sessao.telefone,
      p_limited: sessao.escopo !== "TELEFONE",
    });
    if (!reserva) throw new ErroDominio("NOT_FOUND");
    return c.json(comTelefoneMascarado(reserva));
  });

  // Pedido de cancelamento (regra 12): só enquanto RESERVADO, um pendente por vez. O
  // relógio continua; a loja aprova ou recusa pelo painel.
  app.post("/v1/reservations/:id/cancellation-request", async (c) => {
    const id = idDaRota(c);
    const telefone = await telefoneDaSessao(c, id);
    const { observacao } = await lerCorpo(c, pedidoCancelamentoSchema);
    const r = await chamar<ErroJson & { cancelamento: unknown }>(deps.banco, "request_cancellation", {
      p_reservation_id: id, p_phone: telefone, p_note: observacao ?? null,
    });
    falhou(r);
    return c.json({ cancelamento: r.cancelamento }, 201);
  });

  /**
   * Cobrança no provedor (seção 08): a função SQL registra a tentativa, e a chave de
   * idempotência no provedor é o id do pagamento. Serve aos produtos (F6) e ao frete (F8).
   */
  async function cobrar(c: Context, id: string, telefone: string, frete: boolean): Promise<Response> {
    const chave = idSchema.safeParse(c.req.header("idempotency-key"));
    if (!chave.success) throw new ErroDominio("VALIDATION_ERROR", { campo: "Idempotency-Key" });
    const dados = await lerCorpo(c, pagamentoSchema);

    const r = await chamar<ErroJson & { pagamento: { id: string; status: string; valorCentavos: number }; repetido?: boolean; pagarAte?: string }>(
      deps.banco, frete ? "register_shipping_payment" : "register_payment_attempt",
      { p_reservation_id: id, p_phone: telefone, p_method: dados.forma, p_idempotency_key: chave.data });
    falhou(r);
    const pagamento = r.pagamento;
    if (r.repetido || pagamento.status !== "CRIADO") {
      return c.json({ pagamento: await chamar(deps.banco, "payment_for_customer", { p_reservation_id: id, p_payment_id: pagamento.id, p_phone: telefone }) });
    }

    const reserva = await chamar<{ numero: number }>(deps.banco, "reservation_for_customer", { p_id: id, p_phone: telefone });
    const descricao = frete ? `T-shirt Club.br, frete do pedido #${reserva.numero}` : `T-shirt Club.br, reserva #${reserva.numero}`;
    // PIX nasce com o mínimo do Mercado Pago (30 min); o dos produtos é cancelado no fim da
    // tolerância (G14), e o do frete vale até o fim do prazo de 2 h, se for mais longo.
    const minimo = agora().getTime() + 30 * 60_000;
    const expiraEm = new Date(Math.max(minimo, r.pagarAte ? new Date(r.pagarAte).getTime() : 0));
    let resultado;
    try {
      resultado = dados.forma === "PIX"
        ? await deps.pagamentos.criarPix({ pagamentoId: pagamento.id, valorCentavos: pagamento.valorCentavos, descricao, expiraEm })
        : await deps.pagamentos.criarCartao({
          pagamentoId: pagamento.id, valorCentavos: pagamento.valorCentavos, descricao,
          token: dados.cartao!.token, metodo: dados.cartao!.paymentMethodId, emissor: dados.cartao!.issuerId, email: dados.cartao!.email,
        });
    } catch (e) {
      await chamar(deps.banco, "payment_failed", { p_payment_id: pagamento.id, p_error: String(e) });
      throw new ErroDominio("UPSTREAM_UNAVAILABLE");
    }

    await chamar(deps.banco, "payment_created", {
      p_payment_id: pagamento.id,
      p: {
        providerPaymentId: resultado.providerPaymentId,
        statusProvedor: resultado.statusProvedor,
        pixCopiaECola: resultado.pix?.copiaECola ?? null,
        pixQrBase64: resultado.pix?.qrBase64 ?? null,
        pixExpiraEm: resultado.pix?.expiraEm ?? null,
      },
    });
    // Cartão em binary_mode já volta aprovado ou recusado
    if (resultado.status !== "PENDENTE") await aplicar(deps.banco, resultado);

    return c.json({
      pagamento: await chamar(deps.banco, "payment_for_customer", { p_reservation_id: id, p_payment_id: pagamento.id, p_phone: telefone }),
      ...(resultado.status === "RECUSADO" && resultado.detalhe ? { recusa: resultado.detalhe } : {}),
    }, 201);
  }

  // Pagamento (seção 08, F6): PIX ou cartão, uma forma por reserva. O Idempotency-Key (um
  // por clique) devolve a mesma tentativa; a chave no provedor é o id do pagamento.
  app.post("/v1/reservations/:id/payments", async (c) => {
    const id = idDaRota(c);
    return await cobrar(c, id, await telefoneDaSessao(c, id), false);
  });

  // Entrega (regra 17, F8): confirmar ou trocar a modalidade e o endereço. Pelo link da
  // reserva, pede antes o código do WhatsApp (D13): só a sessão do telefone mexe aqui.
  app.put("/v1/reservations/:id/fulfillment", async (c) => {
    const id = idDaRota(c);
    const sessao = await sessaoDaReserva(deps.banco, c, id);
    if (sessao.escopo !== "TELEFONE") throw new ErroDominio("PHONE_VERIFICATION_REQUIRED");
    const dados = await lerCorpo(c, entregaSchema);
    const r = await chamar<ErroJson & { logistica: unknown }>(deps.banco, "set_fulfillment", {
      p_reservation_id: id, p_phone: sessao.telefone, p_mode: dados.modalidade, p_address: "endereco" in dados ? dados.endereco : null,
    });
    falhou(r);
    return c.json({ logistica: r.logistica });
  });

  // Frete: segundo pagamento, pela mesma forma dos produtos, dentro das 2 h.
  app.post("/v1/reservations/:id/shipping-payments", async (c) => {
    const id = idDaRota(c);
    return await cobrar(c, id, await telefoneDaSessao(c, id), true);
  });

  // A tela consulta a cada 3 s enquanto o pagamento está pendente.
  app.get("/v1/reservations/:id/payments/:pid", async (c) => {
    const id = idDaRota(c);
    const pid = idSchema.safeParse(c.req.param("pid"));
    if (!pid.success) throw new ErroDominio("NOT_FOUND");
    const pagamento = await chamar(deps.banco, "payment_for_customer", { p_reservation_id: id, p_payment_id: pid.data, p_phone: await telefoneDaSessao(c, id) });
    if (!pagamento) throw new ErroDominio("NOT_FOUND");
    return c.json(pagamento);
  });
}
