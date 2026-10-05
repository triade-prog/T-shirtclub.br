// Reserva manual pelo painel (0470): a equipe cadastra a reserva de quem pediu pelo WhatsApp,
// Instagram ou na loja. O preço é o do site (o mesmo motor de preço da loja, com o histórico do
// telefone para cupom e "uma por cliente"), mais um desconto manual opcional, sempre com motivo.
// Pelo link, a cliente recebe a mensagem e paga no site; já paga (dinheiro, PIX na conta da loja
// ou maquininha), a reserva nasce paga. O banco confere tudo de novo, com o estoque travado.

import type { Hono } from "hono";
import { ErroDominio, comDescontoManual, cotacaoManualSchema, ehCodigoErro, reservaManualSchema, type Cliente, type ItemCarrinho } from "@tshirtclub/domain";
import type { Banco } from "../_shared/banco.ts";
import { cotar } from "../_shared/cotacao.ts";
import { sha256Hex } from "../_shared/cripto.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { chaveLink } from "../_shared/otp.ts";
import { lerCorpo } from "../_shared/validar.ts";
import type { VarsAdmin } from "./auth.ts";

export interface DepsReservaManual {
  banco: Banco;
  /** Endereço da loja para o link da reserva (LOJA_URL). */
  urlLoja: string;
  agora?: () => Date;
}

type ErroJson = { erro?: string; detalhes?: Record<string, unknown> };

async function historico(banco: Banco, telefone: string | undefined, cupom: string | undefined): Promise<Cliente | undefined> {
  if (!telefone) return undefined;
  const h = await chamar<{ usosDoCupom: number; primeiroUsoDoCupom: string | null; promocoesUsadas: string[] }>(
    banco, "pricing_customer", { p_phone: telefone, p_coupon: cupom ?? null });
  return {
    usosDoCupom: h.usosDoCupom,
    primeiroUsoDoCupom: h.primeiroUsoDoCupom ? new Date(h.primeiroUsoDoCupom) : null,
    promocoesUsadas: new Set(h.promocoesUsadas),
  };
}

async function precoManual(deps: DepsReservaManual, d: { itens: ItemCarrinho[]; cupom?: string; telefone?: string; descontoManualCentavos: number }) {
  const preco = await cotar(deps.banco, d.itens, d.cupom, deps.agora?.() ?? new Date(), { cliente: await historico(deps.banco, d.telefone, d.cupom) });
  return { preco, manual: comDescontoManual(preco, d.descontoManualCentavos) };
}

export function rotasReservaManual(app: Hono<VarsAdmin>, deps: DepsReservaManual): void {
  // A tela mostra o total enquanto a equipe monta a reserva (não segura estoque)
  app.post("/v1/admin/reservations/quote", async (c) => {
    const dados = await lerCorpo(c, cotacaoManualSchema);
    const { preco, manual } = await precoManual(deps, dados);
    return c.json({
      linhas: manual.linhas,
      pecas: preco.pecas,
      subtotalCentavos: preco.subtotalCentavos,
      descontoCentavos: preco.descontoCentavos,
      descontoManualCentavos: manual.descontoManualCentavos,
      totalCentavos: manual.totalCentavos,
      aplicada: preco.aplicada,
      cupom: preco.cupom,
    });
  });

  app.post("/v1/admin/reservations", async (c) => {
    const dados = await lerCorpo(c, reservaManualSchema);
    const { preco, manual } = await precoManual(deps, dados);
    if (manual.totalCentavos !== dados.totalEsperadoCentavos) throw new ErroDominio("PRICE_CHANGED", { totalCentavos: manual.totalCentavos });

    const chave = chaveLink();
    const r = await chamar<ErroJson & { reserva: Record<string, unknown> }>(deps.banco, "admin_create_reservation", {
      p_admin: c.get("admin").userId,
      p: {
        nome: dados.nome,
        telefone: dados.telefone,
        entrega: dados.entrega,
        pagamento: dados.pagamento,
        linhas: manual.linhas.map((l) => ({
          produtoId: l.produtoId, varianteId: l.varianteId, qtd: l.qtd, precoTabelaCentavos: l.precoTabelaCentavos,
          descontoPromoCentavos: l.descontoPromoCentavos, descontoManualCentavos: l.descontoManualCentavos,
          descontoCentavos: l.descontoCentavos, totalCentavos: l.totalCentavos,
        })),
        subtotalCentavos: preco.subtotalCentavos,
        descontoCentavos: preco.descontoCentavos,
        descontoManualCentavos: manual.descontoManualCentavos,
        motivoDesconto: dados.motivoDesconto ?? null,
        totalCentavos: manual.totalCentavos,
        aplicada: preco.aplicada,
        chaveHash: await sha256Hex(chave),
        link: `${deps.urlLoja.replace(/\/+$/, "")}/r#${chave}`,
      },
    });
    if (r.erro) throw new ErroDominio(ehCodigoErro(r.erro) ? r.erro : "INTERNAL_ERROR", r.detalhes);
    // Motoboy ou envio já pago com o endereço (0590): a entrega já sai combinada. Se não der, a
    // reserva fica criada e a loja preenche o endereço na tela da reserva. Pelo link (0620), o
    // endereço fica guardado e a entrega nasce combinada quando ela pagar; se não der, a cliente
    // informa no site, como antes.
    if (dados.endereco && dados.entrega !== "RETIRADA" && dados.pagamento === "LINK") {
      try {
        await chamar(deps.banco, "admin_prefill_address", {
          p_admin: c.get("admin").userId, p_reservation_id: r.reserva.id, p_address: dados.endereco,
        });
      } catch {
        return c.json({ reserva: r.reserva, enderecoPendente: true }, 201);
      }
    } else if (dados.endereco && dados.entrega !== "RETIRADA") {
      try {
        await chamar(deps.banco, "admin_set_fulfillment", {
          p_admin: c.get("admin").userId, p_reservation_id: r.reserva.id, p_mode: dados.entrega, p_address: dados.endereco,
        });
      } catch {
        return c.json({ reserva: r.reserva, enderecoPendente: true }, 201);
      }
    }
    return c.json({ reserva: r.reserva }, 201);
  });
}
