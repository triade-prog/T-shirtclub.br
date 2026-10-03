import { describe, expect, it } from "vitest";
import type { Promocao } from "./preco.ts";
import {
  AVISOS_LOJA,
  candidatosDoRemetente,
  DIAS_TROCA,
  ehPedidoMinhaReserva,
  ehPedidoOfertas,
  ehPedidoTroca,
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

  it("reconhece o pedido de ofertas, sozinho na mensagem", () => {
    for (const t of ["oferta", "Ofertas", "PROMOÇÃO", "promoções!", "promocoes?"]) expect(ehPedidoOfertas(t)).toBe(true);
    for (const t of ["a promoção não funcionou no meu pedido", "tem oferta de moletom?", "minha reserva"]) expect(ehPedidoOfertas(t)).toBe(false);
  });

  it("reconhece quem fala em troca ou devolução, também no meio da frase", () => {
    for (const t of ["troca", "Quero TROCAR a Limone", "como faço a devolução?", "posso devolver?", "Trocas", "devoluções"]) expect(ehPedidoTroca(t)).toBe(true);
    for (const t of ["tem troco para 50?", "trocaram o endereço", "minha reserva", "ofertas", "Oi, tem a Limone?"]) expect(ehPedidoTroca(t)).toBe(false);
  });

  it("reconhece o pedido de consulta", () => {
    expect(ehPedidoMinhaReserva("Minha reserva")).toBe(true);
    expect(ehPedidoMinhaReserva("  MINHAS RESERVAS! ")).toBe(true);
    expect(ehPedidoMinhaReserva("status")).toBe(true);
    expect(ehPedidoMinhaReserva("qual o status do meu pedido de ontem")).toBe(false);
  });

  it("remetente com e sem o nono dígito; LID não é telefone", () => {
    expect(candidatosDoRemetente("557798128809")).toEqual(["+5577998128809"]);
    expect(candidatosDoRemetente("5577998128809")).toEqual(["+5577998128809"]);
    // Celular novo (9 seguido de 1 a 5) também chega sem o nono dígito
    expect(candidatosDoRemetente("553141234567")).toEqual(["+5531941234567"]);
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
  const expira = new Date("2026-10-10T17:32:00Z"); // 14:32 na loja
  const link = "https://tshirtclub.vercel.app/r#abc";

  it("código: uma versão oficial, neutra, com a validade", () => {
    for (const sorteio of [0, 0.99]) {
      expect(mensagemWhatsApp("codigo_verificacao", { codigo: "482193", minutos: 5 }, sorteio)).toBe(
        "Seu código da T-shirt Club é *482193*.\n\nEle vale por 5 minutos. Não compartilhe este código com ninguém.",
      );
    }
    expect(mensagemWhatsApp("codigo_bloqueado", { ate: expira })).toBe(
      "Foram feitas muitas tentativas com este número.\n\nVocê poderá solicitar um novo código às *14:32*.",
    );
    expect(mensagemWhatsApp("referencia_invalida", {})).toContain("*Receber código no WhatsApp*");
  });

  it("reserva criada: 1 peça, 2 com a oferta do Club e 3 ou mais, com o primeiro nome", () => {
    const base = { nome: "Marina Souza", numero: 1048, expiraEm: expira, link };
    expect(mensagemWhatsApp("reserva_criada", { ...base, pecas: 3, totalCentavos: 11999 })).toBe(
      "Oi, Marina! 💖 Seu Club está reservado.\n\nAs 3 peças ficam guardadas até *14:32*.\n\nReserva #1048 · R$ 119,99\n\nFinalize o pagamento:\nhttps://tshirtclub.vercel.app/r#abc",
    );
    expect(mensagemWhatsApp("reserva_criada", { ...base, pecas: 1, totalCentavos: 4999 })).toBe(
      "Oi, Marina! 💖 Sua T-shirt está reservada.\n\nEla fica guardada até *14:32*.\n\nReserva #1048 · R$ 49,99\n\nFinalize o pagamento:\nhttps://tshirtclub.vercel.app/r#abc",
    );
    expect(mensagemWhatsApp("reserva_criada", { ...base, pecas: 2, totalCentavos: 9998, grupo: { qtd: 3, precoCentavos: 11999 } })).toBe(
      "Oi, Marina! 💖 Suas 2 T-shirts estão reservadas.\n\nElas ficam guardadas até *14:32*.\n\nReserva #1048 · R$ 99,98\n\nCom mais 1 peça você completa o Club: 3 por R$ 119,99.\n\nFinalize por aqui:\nhttps://tshirtclub.vercel.app/r#abc",
    );
    const semOferta = mensagemWhatsApp("reserva_criada", { ...base, pecas: 2, totalCentavos: 9998 });
    expect(semOferta).not.toContain("completa o Club");
    expect(semOferta).toContain("Finalize o pagamento:");
    expect(semOferta).not.toContain("Souza");
  });

  it("lembrete com o nome quando o banco manda, e expiração", () => {
    expect(mensagemWhatsApp("reserva_lembrete_5min", { numero: 1048, expiraEm: expira, nome: "Marina Souza", pecas: 3 })).toBe(
      "Marina, faltam só *5 minutos* para a reserva #1048 expirar.\n\nSuas peças ficam separadas até *14:32*.\n\nSe você já pagou, pode ignorar esta mensagem. 💖",
    );
    expect(mensagemWhatsApp("reserva_lembrete_5min", { numero: 1048, expiraEm: expira, pecas: 1 })).toMatch(/^Faltam só \*5 minutos\*[\s\S]*Sua peça fica separada/);
    expect(mensagemWhatsApp("reserva_expirada", { numero: 1048, expiradaEm: expira })).toBe(
      "O prazo da reserva #1048 terminou às *14:32* e nenhuma cobrança foi feita.\n\nAs peças voltaram a ficar disponíveis no Club.\n\nSe ainda quiser, você pode reservar novamente:\ntshirtclub.vercel.app",
    );
  });

  it("pagamento confirmado e em análise (sem pedir outro pagamento)", () => {
    expect(mensagemWhatsApp("pagamento_confirmado", { nome: "Marina Souza", numero: 1048, totalCentavos: 11999, forma: "PIX" })).toBe(
      "Pagamento confirmado! ✦\n\nMarina, suas peças agora são suas. 💖\n\nPedido #1048\nR$ 119,99 · PIX\n\nFalta só escolher como você quer receber:\ntshirtclub.vercel.app",
    );
    expect(mensagemWhatsApp("pagamento_confirmado", { nome: "Marina", numero: 1048, totalCentavos: 4999, forma: "CARTAO", pecas: 1 }))
      .toContain("Marina, sua peça agora é sua. 💖\n\nPedido #1048\nR$ 49,99 · Cartão");
    // Venda manual já paga (0470): a forma pelo nome e, com retirada combinada, sem pedir a entrega
    const balcao = mensagemWhatsApp("pagamento_confirmado", { nome: "Marina", numero: 1050, totalCentavos: 11999, forma: "DINHEIRO", retirada: true });
    expect(balcao).toContain("R$ 119,99 · Dinheiro");
    expect(balcao).toContain("Você retira na loja. Avisamos por aqui assim que o pedido estiver pronto.");
    expect(balcao).not.toContain("Falta só escolher");
    expect(mensagemWhatsApp("pagamento_confirmado", { nome: "Marina", numero: 1050, totalCentavos: 4999, forma: "PIX_DIRETO" })).toContain("PIX na conta da loja");
    expect(mensagemWhatsApp("pagamento_confirmado", { nome: "Marina", numero: 1050, totalCentavos: 4999, forma: "MAQUININHA" })).toContain("Falta só escolher");
    expect(mensagemWhatsApp("pagamento_em_analise", { numero: 1048 })).toBe(
      "Recebemos um pagamento relacionado à reserva #1048 depois do prazo.\n\nNossa equipe vai conferir o pagamento e falar com você por aqui.\n\nNão é necessário pagar novamente.",
    );
    expect(mensagemWhatsApp("pagamento_em_analise", { numero: 1048, valorDivergente: true })).toMatch(/^Recebemos um pagamento da reserva #1048 com valor diferente do total\./);
    expect(mensagemWhatsApp("pagamento_em_analise", { numero: 1048, frete: true })).toContain("Não faça outro pagamento até receber nosso retorno.");
  });

  it("cancelamento: recebido, aprovado e recusado", () => {
    expect(mensagemWhatsApp("cancelamento_recebido", { numero: 1048, expiraEm: expira })).toBe(
      "Recebemos seu pedido de cancelamento da reserva #1048.\n\nNossa equipe vai analisar e responder por aqui.\n\nEnquanto o cancelamento não for aprovado, a reserva continua válida até *14:32*.",
    );
    expect(mensagemWhatsApp("cancelamento_aprovado", { numero: 1048 })).toBe(
      "Cancelamento aprovado.\n\nA reserva #1048 foi encerrada e nenhuma cobrança foi feita.",
    );
    expect(mensagemWhatsApp("cancelamento_recusado", { numero: 1048, expiraEm: expira })).toBe(
      "O pedido de cancelamento da reserva #1048 não foi aprovado.\n\nA reserva continua válida até *14:32*.\n\nSe precisar entender o motivo, pode responder esta mensagem.",
    );
  });

  it("pós-pagamento: entrega, frete, retirada organizada, envio e entregue", () => {
    expect(mensagemWhatsApp("entrega_confirmada", { numero: 1048, modalidade: "RETIRADA" })).toBe(
      "Combinado! 💖\n\nO pedido #1048 será retirado na loja.\n\nAvisamos por aqui assim que ele estiver pronto.",
    );
    expect(mensagemWhatsApp("entrega_confirmada", { numero: 1048, modalidade: "MOTOBOY" })).toContain("Agora vamos calcular o frete do pedido #1048.");
    expect(mensagemWhatsApp("frete_calculado", { numero: 1048, valorCentavos: 1200, pagarAte: new Date("2026-10-10T19:32:00Z") })).toBe(
      "O frete do pedido #1048 ficou em *R$ 12,00*.\n\nPara manter esta opção de entrega, pague até *16:32*:\n\ntshirtclub.vercel.app\n\nDepois da confirmação, começamos a preparar o envio. ✦",
    );
    expect(mensagemWhatsApp("pronto_retirada", { numero: 1048, codigo: "Q4K7MX", endereco: "Rua da Loja, 10", horario: "seg a sáb, 9h às 18h" })).toBe(
      "Seu pedido está pronto! 💖\n\n*Pedido:* #1048\n*Código de retirada:* *Q4K7MX*\n\n*Endereço:*\nRua da Loja, 10\n\n*Horário:*\nseg a sáb, 9h às 18h\n\nNa retirada, informe seu nome, este WhatsApp e o código acima.",
    );
    expect(mensagemWhatsApp("pronto_retirada", { numero: 1048, codigo: "Q4K7MX" })).not.toContain("Endereço");
    expect(mensagemWhatsApp("pedido_enviado", { numero: 1048 })).toBe("Seu pedido #1048 foi enviado! 💖");
    expect(mensagemWhatsApp("pedido_enviado", { numero: 1048, rastreio: "AB123456789BR" })).toBe(
      "Seu pedido #1048 foi enviado! 💖\n\n*Código de rastreio:*\n*AB123456789BR*\n\nVocê já pode acompanhar a entrega pelo rastreamento da transportadora.",
    );
    expect(mensagemWhatsApp("pedido_entregue", { numero: 1048, nome: "Marina Souza" })).toBe(
      "Pedido #1048 entregue. 💖\n\nObrigada por fazer parte do Club, Marina!\n\nTroca em até 7 dias, com a peça sem uso e com a etiqueta. Se precisar, é só responder esta mensagem.",
    );
    expect(mensagemWhatsApp("pedido_entregue", { numero: 1048 })).toContain("Obrigada por fazer parte do Club!");
  });

  it("bloqueio sem tom de julgamento", () => {
    expect(mensagemWhatsApp("telefone_bloqueado", {})).toContain("temporariamente pausadas porque 3 reservas expiraram sem pagamento nos últimos 30 dias");
    expect(mensagemWhatsApp("telefone_liberado", {})).toBe(
      "Tudo certo! 💖\n\nAs reservas deste número foram liberadas e você já pode reservar suas T-shirts novamente.\n\ntshirtclub.vercel.app",
    );
  });

  it("minha reserva: abertas com prazo ou andamento, e nada quando não há", () => {
    const texto = mensagemWhatsApp("minhas_reservas", {
      reservas: [
        { numero: 1049, status: "RESERVADO", pecas: 3, totalCentavos: 11999, expiraEm: expira },
        { numero: 1048, status: "PAGAMENTO_CONFIRMADO", totalCentavos: 4999, substatus: "PRONTO_PARA_RETIRADA" },
      ],
    });
    expect(texto).toBe(
      "Achei! Estas são suas reservas recentes:\n\n• #1049 · reservada até *14:32* · 3 peças · R$ 119,99\n• #1048 · paga · pronta para retirada\n\n" +
        "Suas peças estão guardadas até o horário acima. Finalize o pagamento pelo link que chegou aqui quando você reservou, pra não perder ✦\n\n" +
        "Para ver todos os detalhes:\ntshirtclub.vercel.app",
    );
    expect(mensagemWhatsApp("minhas_reservas", { reservas: [{ numero: 1047, status: "EXPIRADO", motivoEncerramento: "CANCELAMENTO_APROVADO", totalCentavos: 4999 }] }))
      .toBe("Achei! Esta é sua reserva recente:\n\n• #1047 · encerrada (cancelamento aprovado)\n\nPara ver todos os detalhes:\ntshirtclub.vercel.app");
    // A paga que falta escolher a entrega ganha o próximo passo
    expect(mensagemWhatsApp("minhas_reservas", { reservas: [{ numero: 1046, status: "PAGAMENTO_CONFIRMADO", totalCentavos: 4999, substatus: "AGUARDANDO_MODALIDADE" }] }))
      .toContain("\n\nFalta só escolher como você quer receber, e é rapidinho pelo site 💖\n\n");
    expect(mensagemWhatsApp("minhas_reservas", { reservas: [] })).toBe(
      "Procurei aqui e ainda não achei reservas neste número 🤔\n\nQue tal escolher as suas? As peças estão aqui:\ntshirtclub.vercel.app",
    );
  });

  it("ofertas: promoções e cupons vigentes, uma linha cada, e a regra de não somar", () => {
    const periodo = { inicio: new Date("2026-09-01T00:00:00Z"), fim: new Date("2026-12-31T00:00:00Z") };
    const promocoes: Promocao[] = [
      { ...periodo, id: "p1", nome: "Club", tipo: "COMPRE_MAIS", modo: "PRECO_POR_GRUPO", escopo: "TODOS", produtos: [], umaPorCliente: false, grupo: { qtd: 3, precoCentavos: 11999 } },
      { ...periodo, id: "p2", nome: "Leve mais", tipo: "COMPRE_MAIS", modo: "NIVEIS", escopo: "ESPECIFICOS", produtos: ["x"], umaPorCliente: false, niveis: [{ qtdMin: 2, pct: 10 }, { qtdMin: 4, pct: 20 }] },
      { ...periodo, id: "p3", nome: "Queima", tipo: "DESCONTO_PRODUTO", produtos: { a: { modo: "PERCENTUAL", valor: 20 }, b: { modo: "PERCENTUAL", valor: 30 } } },
      { ...periodo, id: "p4", nome: "Boas-vindas", tipo: "CUPOM", escopo: "TODOS", produtos: [], codigo: "BEMVINDA10", modo: "VALOR", valor: 1000, gastoMinimoCentavos: 9000,
        quantidadeTotal: 100, quantidadeUsada: 3, limitePorCliente: 1, validadeDias: 30 },
      { ...periodo, id: "p5", nome: "Insta", tipo: "CUPOM", escopo: "TODOS", produtos: [], codigo: "INSTA15", modo: "PERCENTUAL", valor: 15, descontoMaximoCentavos: 3000,
        quantidadeTotal: 100, quantidadeUsada: 0, limitePorCliente: 1, validadeDias: 30 },
    ];
    expect(mensagemWhatsApp("ofertas", { promocoes })).toBe(
      "Separei as ofertas de hoje pra você ✦\n\n" +
        "• *Club*: 3 peças por R$ 119,99\n" +
        "• *Leve mais*: 2 peças com 10% de desconto · 4 peças com 20% de desconto em peças selecionadas\n" +
        "• *Queima*: até 30% de desconto em peças selecionadas\n" +
        "• Cupom *BEMVINDA10*: R$ 10,00 de desconto em compras a partir de R$ 90,00\n" +
        "• Cupom *INSTA15*: 15% de desconto (até R$ 30,00)\n\n" +
        "Vale sempre a oferta mais vantajosa para você: os descontos não se somam.\n\n" +
        "Bora aproveitar? Escolhe suas peças aqui:\ntshirtclub.vercel.app",
    );
    expect(mensagemWhatsApp("ofertas", { promocoes: promocoes.slice(0, 1) })).not.toContain("não se somam");
    expect(mensagemWhatsApp("ofertas", { promocoes: [] })).toBe("Hoje não tem promoção ativa, mas tem peça linda te esperando 💖\n\nDá uma olhada:\ntshirtclub.vercel.app");
  });

  it("notificações do painel: toda mensagem da fila tem linha, e as essenciais não desligam", () => {
    const cobertos = new Set(NOTIFICACOES.flatMap((n) => n.modelos));
    for (const m of ["reserva_criada", "cancelamento_aprovado", "saiu_entrega", "bloqueio_mantido", "frete_confirmado"]) expect(cobertos.has(m as never)).toBe(true);
    expect(new Set(NOTIFICACOES.map((n) => n.id)).size).toBe(NOTIFICACOES.length);
    expect(NOTIFICACOES.filter((n) => n.essencial).map((n) => n.id)).toEqual(["codigo", "reserva_criada", "lembrete", "pagamento_confirmado", "reserva_expirada"]);
  });

  it("resposta automática a mensagem comum: o endereço da loja e a equipe, e dá para desligar no painel", () => {
    expect(mensagemWhatsApp("boas_vindas", {})).toBe(
      "Oi! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖\n\nPara ver as peças e reservar:\ntshirtclub.vercel.app\n\nPrecisa de ajuda com outra coisa? Pode escrever por aqui, que a equipe te responde assim que puder.",
    );
    expect(NOTIFICACOES.find((n) => n.id === "boas_vindas")).toMatchObject({ essencial: false, modelos: ["boas_vindas"] });
  });

  it("resposta sobre trocas: a política de 7 dias, o arrependimento, como pedir e o link", () => {
    expect(DIAS_TROCA).toBe(7);
    expect(mensagemWhatsApp("trocas", {})).toBe(
      "Sobre trocas, eu te explico! 💖\n\n" +
        "Você tem até *7 dias* depois de receber ou retirar o pedido, com a peça sem uso e com a etiqueta.\n\n" +
        "Comprou pelo site e desistiu? Nos mesmos 7 dias você devolve e recebe o valor de volta.\n\n" +
        "Para pedir, responda aqui com o número da reserva e o que quer trocar. A equipe te responde assim que puder.\n\n" +
        "A política completa:\ntshirtclub.vercel.app/trocas",
    );
    expect(NOTIFICACOES.find((n) => n.id === "trocas")).toMatchObject({ essencial: false, modelos: ["trocas"] });
  });

  it("nenhuma mensagem escreve Club.br (o WhatsApp faz link para club.br, que não é da loja)", () => {
    const amostras = [
      mensagemWhatsApp("codigo_verificacao", { codigo: "482193", minutos: 5 }),
      mensagemWhatsApp("telefone_liberado", {}),
      mensagemWhatsApp("boas_vindas", {}),
      mensagemWhatsApp("trocas", {}),
      mensagemWhatsApp("mensagem_teste", {}),
      mensagemWhatsApp("pedido_entregue", { numero: 1048 }),
      mensagemWhatsApp("reserva_criada", { nome: "Marina", pecas: 3, numero: 1048, totalCentavos: 11999, expiraEm: expira, link }),
    ];
    for (const t of amostras) expect(t).not.toMatch(/club\.br/i);
  });

  it("hora sempre no fuso da loja", () => {
    expect(formatarHora(new Date("2026-10-10T03:05:00Z"))).toBe("00:05");
  });
});

describe("avisos para a equipe (0510)", () => {
  const expira = new Date("2026-10-10T17:32:00Z");
  it("nova reserva: número, primeiro nome, peças, valor, entrega e prazo, com o endereço do painel", () => {
    expect(mensagemWhatsApp("aviso_loja", { tipo: "nova_reserva", numero: 1048, nome: "Marina", pecas: 3, totalCentavos: 11999, retirada: false, expiraEm: expira })).toBe(
      "🛍️ *Nova reserva #1048*\n\nMarina · 3 peças · R$ 119,99\nQuer receber em casa · vale até 14:32\n\nadmin-tshirtclub.vercel.app",
    );
  });

  it("pagamento aprovado e frete pago", () => {
    expect(mensagemWhatsApp("aviso_loja", { tipo: "pagamento_aprovado", numero: 1048, nome: "Marina", valorCentavos: 11999, forma: "PIX", frete: false }))
      .toBe("✅ *Pagamento aprovado* · reserva #1048\n\nMarina · R$ 119,99 · PIX\n\nAgora é com a gente: separar as peças.");
    expect(mensagemWhatsApp("aviso_loja", { tipo: "pagamento_aprovado", numero: 1048, nome: "Marina", valorCentavos: 1800, forma: "CARTAO", frete: true }))
      .toContain("✅ *Frete pago* · pedido #1048");
  });

  it("lista VIP com e sem nome, com o total", () => {
    expect(mensagemWhatsApp("aviso_loja", { tipo: "lista_vip", nome: "Ana", origem: "POPUP", total: 42 }))
      .toBe("⭐ *Nova inscrição na lista VIP*: Ana\n\nPelo pop-up do site · 42 na lista");
    expect(mensagemWhatsApp("aviso_loja", { tipo: "lista_vip", nome: null, origem: "RODAPE", total: 1 })).toMatch(/^⭐ \*Nova inscrição na lista VIP\*\n\nPelo rodapé/);
  });

  it("todos os tipos do painel têm texto, sem telefone e sem Club.br", () => {
    const amostras: Record<string, Parameters<typeof mensagemWhatsApp<"aviso_loja">>[1]> = {
      nova_reserva: { tipo: "nova_reserva", numero: 1, nome: "A", pecas: 1, totalCentavos: 4999, retirada: true, expiraEm: expira },
      pagamento_aprovado: { tipo: "pagamento_aprovado", numero: 1, nome: "A", valorCentavos: 4999, forma: "PIX", frete: false },
      lista_vip: { tipo: "lista_vip", nome: null, origem: "POPUP", total: 1 },
      frete_calcular: { tipo: "frete_calcular", numero: 1, modalidade: "MOTOBOY" },
      cancelamento: { tipo: "cancelamento", numero: 1 },
      pagamento_analise: { tipo: "pagamento_analise", numero: 1, motivo: "VALOR_DIVERGENTE" },
      contestacao: { tipo: "contestacao", numero: 1, motivo: "CONTESTACAO" },
      troca: { tipo: "troca" },
      atendimento: { tipo: "atendimento", final: "8809", nome: null },
      sistema: { tipo: "sistema", mensagem: "Pagamentos sem confirmação há 30 minutos" },
    };
    for (const a of AVISOS_LOJA) {
      const texto = mensagemWhatsApp("aviso_loja", amostras[a.id]!);
      expect(texto.length).toBeGreaterThan(20);
      expect(texto).not.toMatch(/club\.br|\+55|undefined|null/i);
    }
    expect(mensagemWhatsApp("aviso_loja", { tipo: "teste" })).toContain("Teste dos avisos da loja");
  });
});
