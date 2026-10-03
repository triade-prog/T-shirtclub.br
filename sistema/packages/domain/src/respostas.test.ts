import { describe, expect, it } from "vitest";
import { AVISOS_LOJA, mensagemWhatsApp, NOTIFICACOES } from "./mensagens.ts";
import {
  ehPedidoMenu,
  lerOpcaoDoMenu,
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
    expect(mensagemWhatsApp("menu", { opcoes })).toBe("Como posso te ajudar? É só responder com o número:\n*1* · Ver as peças\n*2* · Falar com a equipe");
    expect(mensagemWhatsApp("boas_vindas", { opcoes })).toBe(
      "Oi! Eu sou a Clubinha, a assistente virtual da T-shirt Club 💖\n\nPara ver as peças e reservar:\ntshirtclub.vercel.app\n\nComo posso te ajudar? É só responder com o número:\n*1* · Ver as peças\n*2* · Falar com a equipe",
    );
    expect(mensagemWhatsApp("resposta_rapida", { texto: "PIX ou cartão." })).toBe("PIX ou cartão.\n\nQuer ver as outras opções? É só mandar *menu* ✦");
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", final: "8809", nome: "Ana" })).toBe(
      "💬 *Ana quer falar com a equipe*\n\nNo WhatsApp da loja, a conversa do número com final 8809. O robô fica quieto nela enquanto vocês respondem.",
    );
    expect(mensagemWhatsApp("aviso_loja", { tipo: "atendimento", final: "8809", nome: null })).toMatch(/^💬 \*Uma cliente quer falar com a equipe\*/);
    expect(AVISOS_LOJA.some((a) => a.id === "atendimento")).toBe(true);
    expect(NOTIFICACOES.find((n) => n.id === "respostas")).toMatchObject({ essencial: false, modelos: ["resposta_rapida", "menu"] });
  });
});
