import { describe, expect, it } from "vitest";
import { AVISOS_LOJA, mensagemWhatsApp, NOTIFICACOES } from "./mensagens.ts";
import {
  ehPedidoMenu,
  lerComandoChamado,
  lerNota,
  lerOpcaoDoMenu,
  precisaDeAtendimento,
  normalizarPalavra,
  preencherResposta,
  respostaPorPalavra,
  respostaRapidaSchema,
  type RespostaRapida,
} from "./respostas.ts";

const r = (numero: number, acao: RespostaRapida["acao"], palavras: string[]): RespostaRapida => ({
  id: `r${numero}`, numero, acao, titulo: `Opção ${numero}`, palavras, texto: acao === "TEXTO" ? "texto" : null,
});
const RESPOSTAS = [r(1, "TEXTO", ["tamanho", "medidas"]), r(2, "TEXTO", ["frete", "onde fica"]), r(3, "TROCAS", ["troca"]), r(4, "EQUIPE", ["atendente"])];

describe("atendimento automático (0540)", () => {
  it("número do menu: só o número, sozinho, de 1 a 9", () => {
    expect(["3", " 3. ", "3)", "Opção 3", "opcao 3", "3️⃣"].map(lerOpcaoDoMenu)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(["0", "10", "3 camisetas", "quero a 3", "", "três"].map(lerOpcaoDoMenu)).toEqual([null, null, null, null, null, null]);
  });

  it("\"menu\" sozinho na mensagem", () => {
    expect(["menu", "Menu!", "opções", "Início", "voltar"].every(ehPedidoMenu)).toBe(true);
    expect(["qual o menu?", "menus"].some(ehPedidoMenu)).toBe(false);
  });

  it("palavra inteira, sem acento, na ordem do menu; trocas fica de fora", () => {
    expect(respostaPorPalavra("Qual o FRETE pra Caetité?", RESPOSTAS)?.numero).toBe(2);
    expect(respostaPorPalavra("Onde fica a loja?", RESPOSTAS)?.numero).toBe(2);
    expect(respostaPorPalavra("Que tamanho veste? E o frete?", RESPOSTAS)?.numero).toBe(1);
    expect(respostaPorPalavra("Quero falar com um atendente", RESPOSTAS)?.numero).toBe(4);
    expect(respostaPorPalavra("os fretes", RESPOSTAS)).toBeNull();
    expect(respostaPorPalavra("quero fazer uma troca", RESPOSTAS)).toBeNull();
    expect(respostaPorPalavra("👍", RESPOSTAS)).toBeNull();
  });

  it("preenche o site, o endereço e o horário, com um texto quando falta", () => {
    expect(preencherResposta("{site} · {endereco} · {horario}", { site: "loja.com", endereco: "Rua A, 1", horario: "9h às 18h" })).toBe("loja.com · Rua A, 1 · 9h às 18h");
    expect(preencherResposta("{endereco}", { site: "loja.com", endereco: null })).toBe("Pergunte aqui o endereço da loja.");
  });

  it("palavras do painel: normalizadas, sem repetir, no formato do banco", () => {
    expect(normalizarPalavra("  Cartão de Crédito! ")).toBe("cartao de credito");
    expect(respostaRapidaSchema.parse({ titulo: " Pagamento ", palavras: ["PIX", "pix", "Cartão", ""] })).toEqual({ titulo: "Pagamento", palavras: ["pix", "cartao"] });
    expect(respostaRapidaSchema.safeParse({ titulo: "Pagamento", palavras: ["a"] }).success).toBe(false);
    expect(respostaRapidaSchema.safeParse({ titulo: "Pagamento", palavras: ["uma frase longa demais aqui"] }).success).toBe(false);
    expect(respostaRapidaSchema.safeParse({ titulo: "Pagamento", palavras: Array.from({ length: 16 }, (_, i) => `p${i}`) }).success).toBe(false);
  });

  it("textos: menu, boas-vindas com o menu, resposta com a volta para o menu e o aviso da equipe", () => {
    const opcoes = [{ numero: 1, titulo: "Ver as peças" }, { numero: 2, titulo: "Falar com a equipe" }];
    expect(mensagemWhatsApp("menu", { opcoes })).toBe("Me conta, como posso te ajudar? É só responder com o número:\n*1* · Ver as peças\n*2* · Falar com a equipe");
    expect(mensagemWhatsApp("boas_vindas", { opcoes })).toBe(
      "Oi! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖\n\nPara ver as peças e reservar:\ntshirtclub.vercel.app\n\nMe conta, como posso te ajudar? É só responder com o número:\n*1* · Ver as peças\n*2* · Falar com a equipe",
    );
    // Pelo nome e com a coleção mais nova (0550)
    expect(mensagemWhatsApp("boas_vindas", { opcoes, nome: "Marina Lima", novidade: { nome: "Estate Italiana", slug: "estate-italiana" } })).toBe(
      "Oi, Marina! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖\n\nNossa coleção mais nova é a *Estate Italiana* ✦ Dá uma espiada:\ntshirtclub.vercel.app/colecao/estate-italiana\n\nMe conta, como posso te ajudar? É só responder com o número:\n*1* · Ver as peças\n*2* · Falar com a equipe",
    );
    expect(mensagemWhatsApp("resposta_rapida", { texto: "PIX ou cartão." })).toBe("PIX ou cartão.\n\nPosso te ajudar em mais alguma coisa? Manda *menu* que eu te mostro as opções ✦");
    // Trocas, ofertas e minha reserva terminam igual quando o menu está ligado; sem ele, não
    const volta = /\n\nPosso te ajudar em mais alguma coisa\? Manda \*menu\* que eu te mostro as opções ✦$/;
    expect(mensagemWhatsApp("trocas", { menu: true })).toMatch(volta);
    expect(mensagemWhatsApp("ofertas", { promocoes: [], menu: true })).toMatch(volta);
    expect(mensagemWhatsApp("minhas_reservas", { reservas: [], menu: true })).toMatch(volta);
    expect(mensagemWhatsApp("minhas_reservas", { reservas: [{ numero: 1, status: "ENTREGUE", totalCentavos: 4999 }], menu: true })).toMatch(volta);
    expect([mensagemWhatsApp("trocas", {}), mensagemWhatsApp("ofertas", { promocoes: [] }), mensagemWhatsApp("minhas_reservas", { reservas: [] })].some((t) => volta.test(t))).toBe(false);
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", final: "8809", nome: null })).toMatch(/^💬 \*Uma cliente quer falar com a equipe\*/);
    expect(AVISOS_LOJA.some((a) => a.id === "atendimento")).toBe(true);
    expect(NOTIFICACOES.find((n) => n.id === "respostas")).toMatchObject({ essencial: false, modelos: ["resposta_rapida", "menu"] });
  });
});

describe("Clubinha vendedora (0550)", () => {
  const cliente = {
    nome: "Marina", telefone: "+5577991112222", final: "2222",
    pedido: { numero: 1048, status: "PAGAMENTO_CONFIRMADO" as const, substatus: "EM_PREPARACAO" },
    mensagens: ["tem a Limone Capri no plus?"],
  };

  it("aviso da equipe: quem é, o telefone, o último pedido e o que ela escreveu", () => {
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", ...cliente })).toBe(
      "💬 *Marina quer falar com a equipe*\n\n📱 (77) 99111-2222\n🧾 Último pedido: #1048 · paga · em preparação\n\n" +
        "💭 O que a cliente escreveu:\n“tem a Limone Capri no plus?”\n\nResponda pelo WhatsApp da loja. O robô fica quieto nessa conversa enquanto vocês atendem.",
    );
    expect(mensagemWhatsApp("aviso_loja", { tipo: "troca", ...cliente, pedido: null, mensagens: [] })).toBe(
      "🔁 *Marina falou em troca ou devolução*\n\n📱 (77) 99111-2222\n🧾 Ainda sem pedido neste número\n\nA cliente já recebeu a política de trocas. Responda à Marina pelo WhatsApp da loja.",
    );
    // Depois de enviado, o aviso perde o telefone e as mensagens: fica o final
    expect(mensagemWhatsApp("aviso_loja", { tipo: "troca", nome: null, final: "2222" })).toMatch(/^🔁 \*Uma cliente falou em troca ou devolução\*\n\n📱 Número com final 2222\n/);
    expect(mensagemWhatsApp("aviso_loja", { tipo: "troca" })).toContain("📱 O WhatsApp não mostrou o número");
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", ...cliente, telefone: "+351912345678" })).toContain("📱 +351912345678");
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", ...cliente, lembrete: true, desde: new Date("2026-10-10T17:00:00Z") })).toMatch(
      /^⏰ \*Marina ainda espera a equipe\*[\s\S]*O chamado abriu às 14:00 e ninguém assumiu ainda\. A Clubinha avisou a cliente que vocês já respondem\.$/,
    );
  });

  it("reserva não paga: as peças que ainda estão à venda, com o link; sem convite se o número foi bloqueado", () => {
    const base = { numero: 1048, expiradaEm: new Date("2026-10-10T17:47:00Z"), nome: "Marina Lima" };
    expect(mensagemWhatsApp("reserva_expirada", { ...base, disponiveis: [{ nome: "Limone Amalfi", slug: "limone-amalfi" }] })).toBe(
      "Oi, Marina! Aqui é a Clubinha 💖\n\nO prazo da reserva #1048 terminou às *14:47* e nenhuma cobrança foi feita.\n\n" +
        "Boa notícia: essa peça ainda está aqui pra você\n• *Limone Amalfi*\ntshirtclub.vercel.app/produto/limone-amalfi\n\n" +
        "Quer garantir? É só reservar de novo pelo link ✦\n\nFicou alguma dúvida de tamanho, frete ou pagamento? Me chama aqui que eu te ajudo.",
    );
    expect(mensagemWhatsApp("reserva_expirada", { ...base, disponiveis: [] })).toContain("As peças dessa reserva já não estão disponíveis, mas tem mais coisa linda te esperando:");
    const pausada = mensagemWhatsApp("reserva_expirada", { ...base, pausada: true });
    expect(pausada).toBe("O prazo da reserva #1048 terminou às *14:47* e nenhuma cobrança foi feita.\n\nAs peças voltaram a ficar disponíveis no Club.");
  });

  it("equipe demorou e pós-entrega, e as duas se desligam no painel", () => {
    expect(mensagemWhatsApp("atendimento_lembrete", { nome: "Marina Lima" })).toBe(
      "Marina, já avisei a equipe de novo, e alguém te responde por aqui o quanto antes 💖\n\nSe quiser adiantar, conta pra gente o que você precisa: a peça, o tamanho ou o número do pedido.",
    );
    expect(mensagemWhatsApp("atendimento_lembrete", {})).toMatch(/^Já avisei a equipe de novo/);
    expect(mensagemWhatsApp("pos_venda", { nome: "Marina Lima", pecas: 3 })).toBe(
      "Oi, Marina! Aqui é a Clubinha, passando pra saber: gostou das suas T-shirts? 💖\n\n" +
        "Se postar uma foto usando, marca a T-shirt Club no Instagram: a gente ama ver ✦\n\nE pra saber das novidades antes de todo mundo, entra na lista VIP:\ntshirtclub.vercel.app",
    );
    expect(mensagemWhatsApp("pos_venda", {})).toMatch(/^Oi! Aqui é a Clubinha, passando pra saber: gostou da sua T-shirt\? 💖/);
    expect(NOTIFICACOES.filter((n) => ["atendimento_lembrete", "pos_venda"].includes(n.id)).map((n) => n.essencial)).toEqual([false, false]);
  });
});

describe("chamados (0550)", () => {
  it("comando da equipe: assumir e finalizar, com o número do chamado", () => {
    expect(["assumi 12", "Assumi #12", "atendendo 12", "assumir chamado 12"].map(lerComandoChamado)).toEqual(Array(4).fill({ acao: "ASSUMIR", numero: 12 }));
    expect(["resolvido 12", "Resolvido #12!", "finalizado 12", "fechar 12", "encerrado: 12"].map(lerComandoChamado)).toEqual(Array(5).fill({ acao: "RESOLVER", numero: 12 }));
    expect(["resolvido", "assumi", "12", "já resolvi o 12", "resolvido 12 obrigada"].map(lerComandoChamado)).toEqual(Array(5).fill(null));
  });

  it("nota de 1 a 5", () => {
    expect(["5", "nota 4", "3 estrelas", "2/5", "⭐⭐⭐⭐⭐", "1!"].map(lerNota)).toEqual([5, 4, 3, 2, 5, 1]);
    expect(["0", "6", "10", "5 camisetas", "nota", "⭐ linda"].map(lerNota)).toEqual([null, null, null, null, null, null]);
  });

  it("dúvida que pede uma pessoa: pergunta ou frase; cumprimento e agradecimento, não", () => {
    expect(["vocês fazem embrulho?", "quero a camiseta azul", "Tem no plus?", "prazo pra Guanambi"].every(precisaDeAtendimento)).toBe(true);
    expect(["Obrigada!", "ok", "bom dia", "oi, tudo bem?", "👍", "valeu, até mais", "amei"].some(precisaDeAtendimento)).toBe(false);
  });

  it("textos: dúvida passada, encerramento com a nota, agradecimento e a resposta à equipe", () => {
    expect(mensagemWhatsApp("chamado_aberto", {})).toBe("Essa eu vou deixar com a equipe, tá? Já passei sua mensagem, e alguém te responde por aqui o quanto antes 💖");
    expect(mensagemWhatsApp("atendimento_encerrado", { nome: "Ana Paula" })).toBe(
      "Prontinho, Ana! A equipe finalizou seu atendimento 💖\n\nDe 1 a 5, quanto você dá para o nosso atendimento? É só responder com o número ✦",
    );
    expect(mensagemWhatsApp("avaliacao_recebida", { nota: 5, menu: true })).toBe(
      "Obrigada pela nota *5*! Fico muito feliz 💖\n\nPosso te ajudar em mais alguma coisa? Manda *menu* que eu te mostro as opções ✦",
    );
    expect(mensagemWhatsApp("avaliacao_recebida", { nota: 2 })).toBe("Obrigada pela sinceridade! Vou passar pra equipe, pra gente melhorar 💖");
    expect(mensagemWhatsApp("chamado_equipe", { resultado: "ASSUMIDO", numero: 12, nome: "Ana" })).toBe("👍 Chamado #12 da Ana é seu. Ao terminar, mande *resolvido 12*.");
    expect(mensagemWhatsApp("chamado_equipe", { resultado: "RESOLVIDO", numero: 12, nome: "Ana", notaPedida: true })).toBe(
      "✅ Chamado #12 da Ana finalizado. A Clubinha agradeceu e pediu a nota do atendimento.",
    );
    expect(mensagemWhatsApp("chamado_equipe", { resultado: "NAO_ENCONTRADO", numero: 99 })).toBe("Não achei o chamado #99. Confira o número no aviso.");
  });

  it("avisos do chamado: o número, o motivo e como assumir e finalizar", () => {
    const cliente = { nome: "Ana", telefone: "+5577998128809", pedido: null, mensagens: ["vocês fazem embrulho?"] };
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", chamado: 12, motivo: "DUVIDA", ...cliente })).toBe(
      "🎫 *Chamado #12* · Ana mandou uma dúvida que a Clubinha não soube responder\n\n📱 (77) 99812-8809\n🧾 Ainda sem pedido neste número\n\n" +
        "💭 O que a cliente escreveu:\n“vocês fazem embrulho?”\n\nResponda à Ana pelo WhatsApp da loja. Aqui, mande *assumi 12* ao começar e *resolvido 12* ao terminar.",
    );
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", chamado: 12, motivo: "EQUIPE", ...cliente, nome: null })).toMatch(
      /^🎫 \*Chamado #12\* · Uma cliente quer falar com a equipe\n[\s\S]*Responda à cliente pelo WhatsApp da loja\./,
    );
    expect(mensagemWhatsApp("aviso_loja", { tipo: "troca", chamado: 13, ...cliente })).toMatch(/^🎫 \*Chamado #13\* · Ana falou em troca ou devolução\n[\s\S]*\*resolvido 13\* ao terminar\.$/);
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", chamado: 12, lembrete: true, ...cliente })).toMatch(/^⏰ \*Chamado #12\* · Ana ainda espera a equipe[\s\S]*Mande \*assumi 12\* ao começar\.$/);
    expect(mensagemWhatsApp("aviso_loja", { tipo: "avaliacao", chamado: 12, nome: "Ana", nota: 2 })).toBe(
      "⭐ *Nota 2 de 5* · chamado #12\n\nAna avaliou o atendimento. Vale falar com ela para entender o que faltou.",
    );
    expect(AVISOS_LOJA.some((a) => a.id === "avaliacao")).toBe(true);
    expect(NOTIFICACOES.find((n) => n.id === "chamados")).toMatchObject({ essencial: false, modelos: ["chamado_aberto", "atendimento_encerrado", "avaliacao_recebida"] });
  });
});
