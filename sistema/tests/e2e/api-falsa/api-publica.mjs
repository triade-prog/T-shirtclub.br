// API falsa da api-public para a jornada da cliente (T26): responde no formato das rotas de
// supabase/functions/api-public, sem banco, e serve as fotos de docs/design/fotos como se
// fossem do Storage. Cada tentativa gera uma reserva própria (os testes rodam em paralelo).
// Uso: node tests/e2e/api-falsa/api-publica.mjs [porta]   (padrão 4010)
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORTA = Number(process.argv[2] ?? process.env.PORTA ?? 4010);
const FOTOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../docs/design/fotos");
const CODIGO = "123456";
const PRECO = 4999;

const colecao = { id: "c0000000-0000-4000-8000-000000000001", nome: "Limone", slug: "limone", descricao: "Sol, limão e aquele ar de férias que funciona até numa terça-feira.", chamada: "Limões, listras e o verão italiano que não acaba.", cor: "LIMAO", capa: { caminho: "campanha-limone.webp", alt: "Campanha Limone" }, produtos: 1 };
const cartao = {
  id: "p0000000-0000-4000-8000-000000000001", slug: "limone-amalfi-coast", nome: "Limone Amalfi Coast", precoCentavos: PRECO, precoPromocionalCentavos: null, noClub: true,
  colecao: { slug: "limone", nome: "Limone", cor: "LIMAO" }, capa: { caminho: "produtos/10-limone-amalfi-coast.webp", alt: "Camiseta Limone Amalfi Coast" }, disponivel: 8, selo: "DISPONIVEL",
  // Tamanhos (0370): os dois à venda, então o + do cartão leva à página para escolher
  tamanhos: [
    { id: "v0000000-0000-4000-8000-000000000001", tamanho: "UNICO", rotulo: "Único · P ao 42", disponivel: 5, selo: "DISPONIVEL" },
    { id: "v0000000-0000-4000-8000-000000000002", tamanho: "PLUS", rotulo: "Plus · 44 ao 48", disponivel: 3, selo: "DISPONIVEL" },
  ],
};
colecao.fotos = [cartao.capa];
colecao.slugsAntigos = ["limone-club"];
// Segunda coleção com capa de campanha (sem peças): o carrossel do início tem 2 slides.
const colecao2 = { id: "c0000000-0000-4000-8000-000000000002", nome: "Sardines Club", slug: "sardines-club", descricao: "A little salty.", chamada: null, cor: "MEDITERRANEO",
  capa: { caminho: "campanha-limone.webp", alt: "Mare, Amore! Riviera SS26" }, produtos: 0, fotos: [] };
// Coleção de campanha (0420, D35 e D36): paleta própria, campanha, foto do celular e 1 capítulo.
const colecao3 = { id: "c0000000-0000-4000-8000-000000000003", nome: "Estate Italiana", slug: "estate-italiana", descricao: "Limões, tomates e dias que parecem férias.",
  chamada: "Limões, listras e o verão italiano que não acaba.", cor: "LIMAO", capa: { caminho: "campanha-limone.webp", alt: "Duas amigas no terraço, de frente para o mar" },
  capaCelular: { caminho: "campanha-limone.webp", alt: "Uma amiga olhando o mar" }, campanha: "Ciao, Estate!", temporada: "SS26", edicao: "Coleção 01",
  paleta: "ESTATE_ITALIANA", produtos: 1, fotos: [], slugsAntigos: [],
  capitulos: [{ rotulo: "Mattina — Mercato", titulo: "Il mercato apre cedo.", foto: { caminho: "campanha-limone.webp", alt: "Mercado de manhã" }, produtos: ["p0000000-0000-4000-8000-000000000001"] }] };
const medidas = { UNICO: { busto: 104, comprimento: 68 }, PLUS: { busto: 116, comprimento: 72 } };
const rotuloDe = (varianteId) => cartao.tamanhos.find((t) => t.id === varianteId);
const produto = {
  ...cartao, descricao: "O verão italiano no peito, e o resto do look fica por sua conta.", composicao: "100% algodão.", modelagem: "Modelagem confortável.",
  tamanhos: cartao.tamanhos.map((t) => ({ ...t, medidas: medidas[t.tamanho] })), cuidados: "Lavar do avesso.", colecao: { nome: "Limone", slug: "limone", descricao: colecao.descricao, cor: "LIMAO", capa: colecao.capa },
  fotos: [
    { caminho: "produtos/10-limone-amalfi-coast.webp", alt: "Camiseta Limone Amalfi Coast, frente", tipo: "FRENTE" },
    { caminho: "limone-detalhe.webp", alt: "Detalhe da estampa Limone", tipo: "DETALHE" },
  ],
  looks: [],
};
const club = { nome: "Monte seu Club", qtd: 3, precoCentavos: 11999, fim: "2027-01-01T00:00:00Z" };
// Uma peça acabando, para o bloco Almost Gone (0380) e o selo com a quantidade real
const acabando = {
  ...cartao, id: "p0000000-0000-4000-8000-000000000009", slug: "dog-parisienne", nome: "Dog Parisienne", disponivel: 1, selo: "ULTIMAS_UNIDADES",
  capa: { ...cartao.capa, alt: "Camiseta Dog Parisienne" },
  tamanhos: [{ id: "v0000000-0000-4000-8000-000000000009", tamanho: "UNICO", rotulo: "Único · P ao 42", disponivel: 1, selo: "ULTIMAS_UNIDADES" }],
};
const home = [
  { tipo: "NOVIDADES", titulo: "Club Picks", conteudo: [cartao] },
  { tipo: "QUASE_ESGOTADAS", titulo: "Almost Gone", conteudo: [acabando] },
  { tipo: "COLECOES", titulo: null, conteudo: [colecao] },
  { tipo: "MONTE_SEU_CLUB", titulo: null, conteudo: club },
];

const buscasRevalidacao = new Map();
const tentativas = new Map();
const reservas = new Map();
const pagamentos = new Map();
let numero = 1040;

function cotar(itens) {
  const linhas = itens.map((i) => ({ produtoId: i.produtoId, varianteId: i.varianteId, qtd: i.qtd, precoTabelaCentavos: PRECO, subtotalCentavos: PRECO * i.qtd, descontoCentavos: 0, totalCentavos: PRECO * i.qtd }));
  const total = linhas.reduce((s, l) => s + l.totalCentavos, 0);
  const pecas = linhas.reduce((s, l) => s + l.qtd, 0);
  return { linhas, pecas, subtotalCentavos: total, descontoCentavos: 0, totalCentavos: total, aplicada: null, cupom: null, proximoGrupo: pecas % 3 ? { faltam: 3 - (pecas % 3), qtd: 3, precoCentavos: club.precoCentavos, promocaoId: "club" } : null };
}

function reservaJson(r) {
  return { ...r, agora: new Date().toISOString() };
}

async function lerCorpo(req) {
  let texto = "";
  for await (const parte of req) texto += parte;
  return texto ? JSON.parse(texto) : {};
}

function responder(res, status, corpo) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}
const erro = (res, status, codigo, detalhes) => responder(res, status, { erro: { codigo, mensagem: codigo, ...(detalhes ? { detalhes } : {}) } });

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/saude") return responder(res, 200, { ok: true });

    if (url.pathname.startsWith("/storage/v1/object/public/catalogo/")) {
      const arquivo = path.resolve(FOTOS, decodeURIComponent(url.pathname.slice("/storage/v1/object/public/catalogo/".length)));
      if (!arquivo.startsWith(FOTOS + path.sep)) return erro(res, 404, "NOT_FOUND");
      try {
        const dados = await readFile(arquivo);
        res.writeHead(200, { "content-type": "image/webp", "cache-control": "public, max-age=3600" });
        return res.end(dados);
      } catch {
        return erro(res, 404, "NOT_FOUND");
      }
    }

    const p = url.pathname.replace(/^\/api-public\//, "");
    const m = req.method;
    let x;

    if (m === "GET" && p === "v1/catalog/home") return responder(res, 200, home);
    if (m === "GET" && p === "v1/catalog/collections") return responder(res, 200, [colecao, colecao2, colecao3]);
    // Lista VIP (0390): cupom de boas-vindas de 10% valendo
    if (m === "GET" && p === "v1/catalog/vip") return responder(res, 200, { beneficio: { modo: "PERCENTUAL", valor: 10, minimoCentavos: null } });
    if (m === "POST" && p === "v1/vip") {
      const b = await lerCorpo(req);
      if (!b?.consentimento || !b?.privacidade || String(b?.telefone ?? "").replace(/\D/g, "").length < 10) return erro(res, 400, "VALIDATION_ERROR");
      return responder(res, 201, { novo: true, cupom: { codigo: "VIP10", modo: "PERCENTUAL", valor: 10, minimoCentavos: null } });
    }
    if (m === "GET" && p === "v1/catalog/products") return responder(res, 200, ["limone", "estate-italiana", null].includes(url.searchParams.get("collection")) ? [cartao] : []);
    // Peça só do teste da revalidação: o nome traz quantas vezes a loja buscou a peça aqui
    // (fora das listas, para não mexer nos outros testes).
    if (m === "GET" && (x = p.match(/^v1\/catalog\/products\/(revalidacao-[a-z0-9-]+)$/))) {
      const n = (buscasRevalidacao.get(x[1]) ?? 0) + 1;
      buscasRevalidacao.set(x[1], n);
      return responder(res, 200, { ...produto, slug: x[1], nome: `Peça da revalidação, busca ${n}` });
    }
    if (m === "GET" && (x = p.match(/^v1\/catalog\/products\/([a-z0-9-]+)$/))) return x[1] === cartao.slug ? responder(res, 200, produto) : erro(res, 404, "NOT_FOUND");
    if (m === "POST" && p === "v1/cart/quote") return responder(res, 200, cotar((await lerCorpo(req)).itens ?? []));

    // Reserva, passo 2: a cliente pede o código pelo WhatsApp (aqui, já "enviado").
    if (m === "POST" && p === "v1/reservation-attempts") {
      const b = await lerCorpo(req);
      if (!b.nome || !b.telefone || !b.entrega || !b.itens?.length) return erro(res, 400, "VALIDATION_ERROR");
      const id = randomUUID();
      const ref = id.slice(0, 4).toUpperCase();
      const texto = `Quero meu código da reserva (ref. ${ref})`;
      tentativas.set(id, { id, ref, entrega: b.entrega, nome: b.nome, itens: b.itens });
      return responder(res, 201, { id, ref, telefone: "(77) •••••-8809", whatsapp: { texto, url: `https://wa.me/5577998155772?text=${encodeURIComponent(texto)}` } });
    }
    if (m === "GET" && (x = p.match(/^v1\/reservation-attempts\/([0-9a-f-]{36})$/))) {
      const t = tentativas.get(x[1]);
      if (!t) return erro(res, 404, "NOT_FOUND");
      return responder(res, 200, { ref: t.ref, situacao: t.reservaId ? "CONVERTIDA" : "CODIGO_ENVIADO", telefone: "(77) •••••-8809",
        codigo: { expiraEm: new Date(Date.now() + 5 * 60_000).toISOString(), tentativasRestantes: 2, codigosRestantes: 2 }, reservaId: t.reservaId });
    }
    if (m === "POST" && (x = p.match(/^v1\/reservation-attempts\/([0-9a-f-]{36})\/confirm$/))) {
      const t = tentativas.get(x[1]);
      if (!t) return erro(res, 404, "NOT_FOUND");
      if ((await lerCorpo(req)).codigo !== CODIGO) return erro(res, 422, "OTP_INVALID", { tentativasRestantes: 1 });
      const cot = cotar(t.itens);
      const agora = Date.now();
      const r = {
        id: randomUUID(), numero: ++numero, status: "RESERVADO", motivoEncerramento: null, entrega: t.entrega,
        subtotalCentavos: cot.subtotalCentavos, descontoCentavos: 0, totalCentavos: cot.totalCentavos,
        criadaEm: new Date(agora).toISOString(), expiraEm: new Date(agora + 15 * 60_000).toISOString(), toleranciaAte: null, expiradaEm: null,
        itens: t.itens.map((i) => ({ produtoId: i.produtoId, varianteId: i.varianteId, nome: cartao.nome, tamanho: rotuloDe(i.varianteId)?.tamanho,
                                     rotuloTamanho: rotuloDe(i.varianteId)?.rotulo, qtd: i.qtd, totalCentavos: PRECO * i.qtd })),
        descontos: [], cancelamento: null, logistica: null,
      };
      reservas.set(r.id, r);
      t.reservaId = r.id;
      return responder(res, 200, { reserva: { id: r.id, numero: r.numero } });
    }

    // Como customer_reservations: o resumo que a consulta e a reserva usam
    if (m === "GET" && p === "v1/me/reservations") {
      return responder(res, 200, { reservas: [...reservas.values()].map((r) => ({
        id: r.id, numero: r.numero, status: r.status, motivoEncerramento: r.motivoEncerramento ?? undefined, totalCentavos: r.totalCentavos, criadaEm: r.criadaEm,
        pecas: r.itens.reduce((s, i) => s + i.qtd, 0), expiraEm: r.status === "RESERVADO" ? r.expiraEm : undefined, substatus: r.logistica?.substatus, modalidade: r.logistica?.modalidade, cancelamentoPendente: false,
      })) });
    }
    if (m === "GET" && (x = p.match(/^v1\/reservations\/([0-9a-f-]{36})$/))) {
      const r = reservas.get(x[1]);
      return r ? responder(res, 200, reservaJson(r)) : erro(res, 404, "NOT_FOUND");
    }

    // PIX: nasce pendente e é aprovado na primeira consulta (como se a cliente tivesse pago).
    if (m === "POST" && (x = p.match(/^v1\/reservations\/([0-9a-f-]{36})\/payments$/))) {
      const r = reservas.get(x[1]);
      if (!r) return erro(res, 404, "NOT_FOUND");
      const pg = { id: randomUUID(), reservaId: r.id, forma: "PIX", status: "PENDENTE", valorCentavos: r.totalCentavos,
        pix: { copiaECola: "00020126360014BR.GOV.BCB.PIX0114+5577998155772520400005303986540549.995802BR5913TSHIRT CLUB6009SALVADOR62070503***6304ABCD", qrBase64: null, expiraEm: r.expiraEm } };
      pagamentos.set(pg.id, pg);
      const { reservaId: _, ...publico } = pg;
      return responder(res, 201, { pagamento: publico });
    }
    if (m === "GET" && (x = p.match(/^v1\/reservations\/([0-9a-f-]{36})\/payments\/([0-9a-f-]{36})$/))) {
      const pg = pagamentos.get(x[2]);
      const r = reservas.get(x[1]);
      if (!pg || !r || pg.reservaId !== r.id) return erro(res, 404, "NOT_FOUND");
      if (pg.status === "PENDENTE") {
        pg.status = "APROVADO";
        r.status = "PAGAMENTO_CONFIRMADO";
        r.logistica = { substatus: "AGUARDANDO_MODALIDADE" };
      }
      const { reservaId: _, ...publico } = pg;
      return responder(res, 200, publico);
    }

    // Entrega escolhida: retirada vai para preparação; motoboy e envio esperam o frete.
    if (m === "PUT" && (x = p.match(/^v1\/reservations\/([0-9a-f-]{36})\/fulfillment$/))) {
      const r = reservas.get(x[1]);
      if (!r || r.status !== "PAGAMENTO_CONFIRMADO") return erro(res, 404, "NOT_FOUND");
      const b = await lerCorpo(req);
      if (!["RETIRADA", "MOTOBOY", "ENVIO"].includes(b.modalidade)) return erro(res, 400, "VALIDATION_ERROR");
      r.logistica = { modalidade: b.modalidade, substatus: b.modalidade === "RETIRADA" ? "EM_PREPARACAO" : "AGUARDANDO_CALCULO_FRETE", confirmadaEm: new Date().toISOString(),
        ...(b.endereco ? { endereco: b.endereco } : {}) };
      return responder(res, 200, { ok: true });
    }

    return erro(res, 404, "NOT_FOUND");
  } catch {
    return erro(res, 500, "INTERNAL_ERROR");
  }
}).listen(PORTA, "127.0.0.1", () => console.log(`api-public falsa em http://127.0.0.1:${PORTA}`));
