import { describe, expect, it } from "vitest";
import {
  candidatosDoRemetente,
  ehPedidoMinhaReserva,
  formatarHora,
  lerPedidoDeCodigo,
  linkWhatsApp,
  mensagemWhatsApp,
  textoPedidoCodigo,
} from "./mensagens.ts";

describe("o que a cliente escreve", () => {
  it("lê a referência do pedido de código, mesmo com o texto mexido", () => {
    expect(lerPedidoDeCodigo(textoPedidoCodigo("K7Q2"))).toEqual({ ref: "K7Q2", finalidade: "RESERVA" });
    expect(lerPedidoDeCodigo("quero meu codigo REF K7Q2")).toEqual({ ref: "K7Q2", finalidade: "RESERVA" });
    expect(lerPedidoDeCodigo(textoPedidoCodigo("AB3D", "CONSULTA"))).toEqual({ ref: "AB3D", finalidade: "CONSULTA" });
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
  });

  it("hora sempre no fuso da loja", () => {
    expect(formatarHora(new Date("2026-10-10T03:05:00Z"))).toBe("00:05");
  });
});
