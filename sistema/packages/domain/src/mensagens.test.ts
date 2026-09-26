import { describe, expect, it } from "vitest";
import {
  candidatosDoRemetente,
  ehPedidoMinhaReserva,
  formatarHora,
  lerPedidoDeCodigo,
  linkWhatsApp,
  mensagemWhatsApp,
  NOTIFICACOES,
  textoPedidoCodigo,
} from "./mensagens.ts";

describe("o que a cliente escreve", () => {
  it("lê a referência do pedido de código, mesmo com o texto mexido", () => {
    expect(lerPedidoDeCodigo(textoPedidoCodigo("K7Q2"))).toEqual({ ref: "K7Q2", finalidade: "RESERVA" });
    expect(lerPedidoDeCodigo("quero meu codigo REF K7Q2")).toEqual({ ref: "K7Q2", finalidade: "RESERVA" });
    expect(lerPedidoDeCodigo(textoPedidoCodigo("AB3D", "CONSULTA"))).toEqual({ ref: "AB3D", finalidade: "CONSULTA" });
    expect(lerPedidoDeCodigo(textoPedidoCodigo("E5R2", "ENTREGA"))).toEqual({ ref: "E5R2", finalidade: "ENTREGA" });
    expect(lerPedidoDeCodigo("Oi, tem a camiseta Limone?")).toBeNull();
    expect(lerPedidoDeCodigo("ref. K0Q2")).toBeNull(); // 0 não existe na referência
  });

  it("reconhece o pedido de consulta", () => {
    expect(ehPedidoMinhaReserva("Minha reserva")).toBe(true);
    expect(ehPedidoMinhaReserva("  MINHAS RESERVAS! ")).toBe(true);
    expect(ehPedidoMinhaReserva("status")).toBe(true);
    expect(ehPedidoMinhaReserva("qual o status do meu pedido de ontem")).toBe(false);
  });

  it("remetente com e sem o nono dígito; LID não é telefone", () => {
    expect(candidatosDoRemetente("557798128809")).toEqual(["+557798128809", "+5577998128809"]);
    // Fixo (assinante começando com 2 a 5) não vira o celular de outra pessoa
    expect(candidatosDoRemetente("551134567890")).toEqual(["+551134567890"]);
    expect(candidatosDoRemetente("5577998128809")).toEqual(["+5577998128809", "+557798128809"]);
    expect(candidatosDoRemetente("123456789012345@lid")).toEqual([]);
    expect(candidatosDoRemetente(null)).toEqual([]);
  });

  it("link do WhatsApp com o texto pronto", () => {
    expect(linkWhatsApp("+55 77 99815-5772", textoPedidoCodigo("K7Q2"))).toBe(
      "https://wa.me/5577998155772?text=Quero%20meu%20c%C3%B3digo%20da%20reserva%20(ref.%20K7Q2)",
    );
  });
});

describe("o que a loja manda", () => {
  it("código nas duas versões aprovadas", () => {
    expect(mensagemWhatsApp("codigo_verificacao", { codigo: "482193", minutos: 5 }, 0)).toBe(
      "Seu código da T-shirt Club.br é *482193*. Vale por 5 minutos. Não passe para ninguém.",
    );
    expect(mensagemWhatsApp("codigo_verificacao", { codigo: "482193", minutos: 5 }, 0.99)).toContain("Código de confirmação: *482193*");
  });

  it("reserva criada: primeiro nome, horário da loja e total", () => {
    const texto = mensagemWhatsApp("reserva_criada", {
      nome: "Marina Souza", pecas: 3, numero: 1048, totalCentavos: 11999,
      expiraEm: new Date("2026-10-10T17:32:00Z"), link: "https://tshirtclub.pt/r#abc",
    }, 0);
    expect(texto).toBe("Oi, Marina! Suas 3 peças estão guardadas até *14:32* (reserva #1048, R$ 119,99). Pague por aqui: https://tshirtclub.pt/r#abc 💖");
    expect(texto).not.toContain("Souza");
  });

  it("lembrete e expiração nas versões aprovadas", () => {
    const expira = new Date("2026-10-10T17:32:00Z");
    expect(mensagemWhatsApp("reserva_lembrete_5min", { numero: 1048, expiraEm: expira }, 0)).toBe(
      "Faltam 5 minutos: a reserva #1048 fica guardada até *14:32*. Se já pagou, pode ignorar.",
    );
    expect(mensagemWhatsApp("reserva_expirada", { numero: 1048, expiradaEm: expira }, 0)).toBe(
      "A reserva #1048 terminou às 14:32 sem pagamento, e as peças voltaram para a loja. Se ainda quiser, é só reservar de novo: tshirtclub.pt",
    );
    expect(mensagemWhatsApp("telefone_bloqueado", {})).toContain("3 terminaram sem pagamento em 30 dias");
    expect(mensagemWhatsApp("pagamento_confirmado", { nome: "Marina", numero: 1048, totalCentavos: 11999, forma: "PIX" }, 0)).toBe(
      "Pagamento confirmado! Pedido #1048, R$ 119,99 no PIX. Agora escolha como quer receber, no site: tshirtclub.pt ✨",
    );
  });

  it("cancelamento: recebido, aprovado e recusado", () => {
    const expira = new Date("2026-10-10T17:32:00Z");
    expect(mensagemWhatsApp("cancelamento_recebido", { numero: 1048, expiraEm: expira })).toBe(
      "Recebemos seu pedido de cancelamento da reserva #1048. A loja responde em breve; o prazo continua correndo até *14:32*.",
    );
    expect(mensagemWhatsApp("cancelamento_aprovado", { numero: 1048 })).toBe("Cancelamento aprovado: a reserva #1048 foi encerrada e nada foi cobrado.");
    expect(mensagemWhatsApp("cancelamento_recusado", { numero: 1048, expiraEm: expira })).toBe("A loja manteve a reserva #1048. Ela segue valendo até *14:32*.");
  });

  it("pós-pagamento: frete, retirada com código, envio e entregue", () => {
    expect(mensagemWhatsApp("frete_calculado", { numero: 1048, valorCentavos: 1200, pagarAte: new Date("2026-10-10T19:32:00Z") })).toBe(
      "Frete do pedido #1048: R$ 12,00. Pague até *16:32* pelo site: tshirtclub.pt",
    );
    expect(mensagemWhatsApp("pronto_retirada", { numero: 1048, codigo: "Q4K7MX" })).toBe(
      "O pedido #1048 está pronto para retirada! Código: *Q4K7MX*. Leve também seu nome e este WhatsApp.",
    );
    expect(mensagemWhatsApp("pronto_retirada", { numero: 1048, codigo: "Q4K7MX", endereco: "Rua da Loja, 10", horario: "seg a sáb, 9h às 18h" }))
      .toContain("Endereço: Rua da Loja, 10. Horário: seg a sáb, 9h às 18h.");
    expect(mensagemWhatsApp("pedido_enviado", { numero: 1048 })).toBe("O pedido #1048 foi enviado.");
    expect(mensagemWhatsApp("pedido_enviado", { numero: 1048, rastreio: "AB123456789BR" })).toContain("*AB123456789BR*");
    expect(mensagemWhatsApp("entrega_confirmada", { numero: 1048, modalidade: "MOTOBOY" })).toContain("calcula o frete");
    expect(mensagemWhatsApp("pagamento_em_analise", { numero: 1048, frete: true })).toContain("frete do pedido #1048");
  });

  it("minha reserva: abertas com prazo ou andamento, e nada quando não há", () => {
    const texto = mensagemWhatsApp("minhas_reservas", {
      reservas: [
        { numero: 1049, status: "RESERVADO", pecas: 3, totalCentavos: 11999, expiraEm: new Date("2026-10-10T17:32:00Z") },
        { numero: 1048, status: "PAGAMENTO_CONFIRMADO", totalCentavos: 4999, substatus: "PRONTO_PARA_RETIRADA" },
      ],
    });
    expect(texto).toBe(
      "Suas reservas:\n• #1049: reservada até *14:32* · 3 peças, R$ 119,99\n• #1048: paga · pronta para retirada\nDetalhes e pagamento no site: tshirtclub.pt",
    );
    expect(mensagemWhatsApp("minhas_reservas", { reservas: [{ numero: 1047, status: "EXPIRADO", motivoEncerramento: "CANCELAMENTO_APROVADO", totalCentavos: 4999 }] }))
      .toContain("• #1047: encerrada (cancelamento aprovado)");
    expect(mensagemWhatsApp("minhas_reservas", { reservas: [] })).toBe("Não achamos reservas recentes neste número. Para reservar ou consultar: tshirtclub.pt");
  });

  it("notificações do painel: toda mensagem da fila tem linha, e as essenciais não desligam", () => {
    const cobertos = new Set(NOTIFICACOES.flatMap((n) => n.modelos));
    for (const m of ["reserva_criada", "cancelamento_aprovado", "saiu_entrega", "bloqueio_mantido", "frete_confirmado"]) expect(cobertos.has(m as never)).toBe(true);
    expect(new Set(NOTIFICACOES.map((n) => n.id)).size).toBe(NOTIFICACOES.length);
    expect(NOTIFICACOES.filter((n) => n.essencial).map((n) => n.id)).toEqual(["codigo", "reserva_criada", "lembrete", "pagamento_confirmado", "reserva_expirada"]);
  });

  it("hora sempre no fuso da loja", () => {
    expect(formatarHora(new Date("2026-10-10T03:05:00Z"))).toBe("00:05");
  });
});
