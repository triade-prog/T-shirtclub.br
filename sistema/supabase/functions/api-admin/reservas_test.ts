import { assertEquals, assertMatch } from "@std/assert";
import { ADMIN, erro, logado } from "./teste_util.ts";

// Reserva manual pelo painel (0470): o preço é o do site (o Club de 3 por R$ 119,99), mais o
// desconto manual com motivo; o banco recebe as linhas com a parte da promoção e a manual.
const A = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const B = "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
const A1 = "9c4d5e6f-7a8b-4c3d-9e4f-5a6b7c8d9e0f";
const B1 = "1e6f7a8b-9c0d-4e5f-9a6b-7c8d9e0f1a2b";
const club = {
  id: "club", tipo: "COMPRE_MAIS", nome: "Monte seu Club", inicio: "2026-01-01T00:00:00Z", fim: "2027-01-01T00:00:00Z",
  escopo: "TODOS", produtos: [], modo: "PRECO_POR_GRUPO", grupo: { qtd: 3, precoCentavos: 11999 }, umaPorCliente: false,
};

function catalogo(criar?: (args: Record<string, unknown>) => unknown) {
  return (funcao: string, args: Record<string, unknown>) => {
    switch (funcao) {
      case "cart_products":
        return {
          variantes: [{ id: A1, produtoId: A, nome: "Limone", rotulo: "Único", precoCentavos: 4999, disponivel: 2 },
            { id: B1, produtoId: B, nome: "Pomodoro", rotulo: "Único", precoCentavos: 4999, disponivel: 2 }]
            .filter((v) => (args.p_variant_ids as string[]).includes(v.id)),
          limites: { maxPecas: 9, maxPorProduto: 2 },
        };
      case "pricing_promotions":
        return [club];
      case "pricing_customer":
        return { usosDoCupom: 0, primeiroUsoDoCupom: null, promocoesUsadas: [] };
      case "admin_create_reservation":
        return criar?.(args) ?? { reserva: { id: "r1", numero: 1050, status: "RESERVADO" } };
    }
  };
}
const itens = [{ produtoId: A, varianteId: A1, qtd: 2 }, { produtoId: B, varianteId: B1, qtd: 1 }];
const reserva = { nome: "Ana Paula", telefone: "(77) 99812-8809", entrega: "RETIRADA", itens };

Deno.test("reserva manual: a cotação usa o preço do site e reparte o desconto manual", async () => {
  const m = await logado({ rpcExtra: catalogo() });
  const r = await (await m.pedir("/v1/admin/reservations/quote", { itens, descontoManualCentavos: 1999 })).json();
  assertEquals([r.subtotalCentavos, r.descontoCentavos, r.descontoManualCentavos, r.totalCentavos], [14997, 2998, 1999, 10000]);
  assertEquals(r.aplicada.promocaoId, "club");
  assertEquals(r.linhas.reduce((s: number, l: { descontoManualCentavos: number }) => s + l.descontoManualCentavos, 0), 1999);
  for (const l of r.linhas) assertEquals(l.descontoCentavos, l.descontoPromoCentavos + l.descontoManualCentavos);
});

Deno.test("reserva manual pelo link: linhas conferíveis, telefone em E.164 e o link da loja", async () => {
  let enviado: Record<string, unknown> = {};
  const m = await logado({ rpcExtra: catalogo((args) => { enviado = args; return undefined; }) });
  const r = await m.pedir("/v1/admin/reservations", { ...reserva, pagamento: "LINK", totalEsperadoCentavos: 11999 });
  assertEquals(r.status, 201);
  assertEquals((await r.json()).reserva.numero, 1050);
  const p = enviado.p as Record<string, unknown> & { linhas: Record<string, number>[] };
  assertEquals(enviado.p_admin, ADMIN);
  assertEquals([p.telefone, p.pagamento, p.totalCentavos, p.descontoCentavos, p.descontoManualCentavos], ["+5577998128809", "LINK", 11999, 2998, 0]);
  assertEquals(p.linhas.reduce((s, l) => s + l.totalCentavos, 0), 11999);
  assertMatch(String(p.link), /^https:\/\/tshirtclub\.vercel\.app\/r#[0-9A-Za-z]{22}$/);
  assertMatch(String(p.chaveHash), /^[0-9a-f]{64}$/);
});

Deno.test("reserva manual: desconto sem motivo, total que mudou e erro do banco", async () => {
  const m = await logado({ rpcExtra: catalogo() });
  const semMotivo = await m.pedir("/v1/admin/reservations", { ...reserva, pagamento: "DINHEIRO", descontoManualCentavos: 1000, totalEsperadoCentavos: 10999 });
  assertEquals((await erro(semMotivo)).codigo, "VALIDATION_ERROR");
  const mudou = await m.pedir("/v1/admin/reservations", { ...reserva, pagamento: "DINHEIRO", totalEsperadoCentavos: 14997 });
  assertEquals(await erro(mudou), { codigo: "PRICE_CHANGED", detalhes: { totalCentavos: 11999 } });
  const forma = await m.pedir("/v1/admin/reservations", { ...reserva, pagamento: "CHEQUE", totalEsperadoCentavos: 11999 });
  assertEquals((await erro(forma)).codigo, "VALIDATION_ERROR");

  const ocupada = await logado({ rpcExtra: catalogo(() => ({ erro: "ACTIVE_RESERVATION_EXISTS", detalhes: { numeroReserva: 1049 } })) });
  const r = await ocupada.pedir("/v1/admin/reservations", { ...reserva, pagamento: "LINK", totalEsperadoCentavos: 11999 });
  assertEquals(r.status, 409);
  assertEquals(await erro(r), { codigo: "ACTIVE_RESERVATION_EXISTS", detalhes: { numeroReserva: 1049 } });
});

Deno.test("reserva manual: com desconto e motivo, vai paga para o banco", async () => {
  let enviado: Record<string, unknown> = {};
  const m = await logado({ rpcExtra: catalogo((args) => { enviado = args; return { reserva: { id: "r2", numero: 1051, status: "PAGAMENTO_CONFIRMADO" } }; }) });
  const r = await m.pedir("/v1/admin/reservations", {
    ...reserva, pagamento: "MAQUININHA", descontoManualCentavos: 1999, motivoDesconto: "Cliente fiel", totalEsperadoCentavos: 10000,
  });
  assertEquals(r.status, 201);
  const p = enviado.p as Record<string, unknown>;
  assertEquals([p.pagamento, p.descontoManualCentavos, p.motivoDesconto, p.totalCentavos], ["MAQUININHA", 1999, "Cliente fiel", 10000]);
});

Deno.test("reserva manual pelo link com motoboy: o endereço fica guardado na reserva (0620)", async () => {
  const chamadas: [string, Record<string, unknown>][] = [];
  const base = catalogo();
  const m = await logado({ rpcExtra: (funcao: string, args: Record<string, unknown>) => {
    chamadas.push([funcao, args]);
    return funcao === "admin_prefill_address" ? { ok: true } : base(funcao, args);
  } });
  const endereco = { cep: "46400-000", rua: "R. Sátiro Santos", numero: "38", bairro: "Centro", cidade: "Caetité", uf: "ba" };
  const r = await m.pedir("/v1/admin/reservations", { ...reserva, entrega: "MOTOBOY", pagamento: "LINK", endereco, totalEsperadoCentavos: 11999 });
  assertEquals(r.status, 201);
  assertEquals((await r.json()).enderecoPendente, undefined);
  const guardar = chamadas.find(([f]) => f === "admin_prefill_address")?.[1];
  assertEquals(guardar?.p_reservation_id, "r1");
  assertEquals((guardar?.p_address as Record<string, string>).uf, "BA");
  assertEquals(chamadas.some(([f]) => f === "admin_set_fulfillment"), false);
});
