// Do "Seus dados" à reserva criada (seções 05, 07 e 11; F3 e F4).
// 1. POST /v1/reservation-attempts: confere tudo o que dá antes de gastar uma mensagem
//    (Turnstile, limites, sacola, preço, WhatsApp no ar, bloqueios) e cria a tentativa com a
//    referência curta; o cookie __Host-tentativa prende a tentativa a este navegador (G12).
// 2. A cliente pede o código pelo WhatsApp (webhook-whatsapp); a tela acompanha pelo GET.
// 3. POST .../confirm: confere o código e chama create_reservation, que decide o estoque.
//    Devolve a reserva e grava a sessão da cliente (__Host-sessao).

import type { Context, Hono } from "hono";
import {
  ErroDominio,
  ajustarItensSchema,
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
import { cotar, type DepsLoja } from "./catalogo.ts";

export const COOKIE_TENTATIVA = "__Host-tentativa";
export const COOKIE_SESSAO = "__Host-sessao";

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
}

type ErroJson = { erro?: string; detalhes?: Record<string, unknown> };

/** Resultado de negócio das funções SQL ({ erro, detalhes }) vira o erro da API. */
function falhou(r: ErroJson): void {
  if (!r.erro) return;
  throw new ErroDominio(ehCodigoErro(r.erro) ? r.erro : "INTERNAL_ERROR", r.detalhes);
}

function comTelefoneMascarado<T extends { telefone?: string }>(v: T): T {
  return v.telefone ? { ...v, telefone: mascararTelefone(v.telefone) } : v;
}

async function tokenDoCookie(c: Context, nome: string): Promise<string> {
  const token = lerCookie(c.req.raw.headers, nome);
  // Sem o cookie, a tentativa "não existe" para este navegador (G12).
  if (!token || token.length > 100) throw new ErroDominio("NOT_FOUND");
  return await sha256Hex(token);
}

function idDaRota(c: Context): string {
  const r = idSchema.safeParse(c.req.param("id"));
  if (!r.success) throw new ErroDominio("NOT_FOUND");
  return r.data;
}

export function rotasReserva(app: Hono, deps: DepsReserva): void {
  const agora = () => deps.agora?.() ?? new Date();

  async function limite(chave: string, janela: string, maximo: number): Promise<void> {
    if (!(await chamar<boolean>(deps.banco, "hit_rate_limit", { p_key: chave, p_window: janela, p_max: maximo }))) {
      throw new ErroDominio("RATE_LIMITED");
    }
  }

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

  // Reserva da cliente: só do telefone da sessão (ou a do link, F9). De outro telefone, 404.
  app.get("/v1/reservations/:id", async (c) => {
    const id = idDaRota(c);
    const token = lerCookie(c.req.raw.headers, COOKIE_SESSAO);
    if (!token || token.length > 100) throw new ErroDominio("UNAUTHORIZED");
    const sessao = await chamar<{ telefone: string; escopo: string } | null>(deps.banco, "customer_session_get", {
      p_token_hash: await sha256Hex(token),
    });
    if (!sessao) throw new ErroDominio("UNAUTHORIZED");
    if (sessao.escopo !== "TELEFONE" && sessao.escopo !== `RESERVA:${id}`) throw new ErroDominio("NOT_FOUND");
    const reserva = await chamar<{ telefone: string } | null>(deps.banco, "reservation_for_customer", { p_id: id, p_phone: sessao.telefone });
    if (!reserva) throw new ErroDominio("NOT_FOUND");
    return c.json(comTelefoneMascarado(reserva));
  });
}
