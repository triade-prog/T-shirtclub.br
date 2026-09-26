// Schemas do catálogo e das promoções: o que o painel envia (validado na api-admin antes de
// ir ao banco) e o que o banco devolve para o motor de preço (pricing_promotions).

import { z } from "zod";
import { idSchema, cupomSchema } from "./schemas.ts";
import type { Promocao } from "./preco.ts";

const slugSchema = z.string().trim().toLowerCase().max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "VALIDATION_ERROR");
const caminhoSchema = z.string().regex(/^[a-z0-9][a-z0-9/_.-]{1,200}$/, "VALIDATION_ERROR");
const altSchema = z.string().trim().min(1).max(200);
const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const centavos = z.number().int().min(1).max(10_000_000);

export const CORES_COLECAO = ["TOMATE", "LIMAO", "MEDITERRANEO", "LAVANDA", "MENTA"] as const;
export const TIPOS_FOTO = ["FRENTE", "COSTAS", "DETALHE", "VESTIDA", "CAMPANHA"] as const;
export const TIPOS_BLOCO = ["CAMPANHA", "NOVIDADES", "COLECOES", "LOOKS", "MONTE_SEU_CLUB", "PRODUTOS"] as const;

const imagemSchema = z.object({ caminho: caminhoSchema, alt: altSchema });

// ─── Painel: catálogo ────────────────────────────────────────────────────────────────

export const colecaoEntradaSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  slug: slugSchema,
  descricao: textoOpcional(160),
  cor: z.enum(CORES_COLECAO),
  capa: imagemSchema.nullish().transform((v) => v ?? null),
  posicao: z.number().int().min(0).max(1000).default(0),
  ativa: z.boolean().default(true),
});

export const produtoEntradaSchema = z.object({
  colecaoId: idSchema,
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "VALIDATION_ERROR"),
  slug: slugSchema,
  nome: z.string().trim().min(1).max(80),
  precoCentavos: centavos,
  descricao: textoOpcional(2000),
  composicao: textoOpcional(200),
  modelagem: textoOpcional(200),
  /** Medidas em cm ou texto curto, ex.: { "busto": 104, "comprimento": 68 }. */
  medidas: z
    .record(z.string().trim().min(1).max(40), z.union([z.number().min(0).max(1000), z.string().trim().max(60)]))
    .refine((m) => Object.keys(m).length <= 20, "VALIDATION_ERROR")
    .default({}),
  cuidados: textoOpcional(500),
  ativo: z.boolean().default(true),
  publicado: z.boolean().default(false),
});

/** POST /v1/admin/products/:id/images — o arquivo vai direto ao Storage, sempre em WebP. */
export const fotoEntradaSchema = z.object({
  tipo: z.enum(TIPOS_FOTO),
  alt: altSchema,
  largura: z.number().int().min(1).max(10_000),
  altura: z.number().int().min(1).max(10_000),
});

export const fotoEdicaoSchema = z.object({ tipo: z.enum(TIPOS_FOTO), alt: altSchema });

export const ordemFotosSchema = z.object({
  ids: z.array(idSchema).min(1).max(10).refine((ids) => new Set(ids).size === ids.length, "VALIDATION_ERROR"),
});

/** Capa de coleção ou foto de look: a rota gera o caminho e devolve a URL assinada. */
export const envioArquivoSchema = z.object({ destino: z.enum(["colecao", "look"]) });

export const lookEntradaSchema = z.object({
  titulo: z.string().trim().min(1).max(60),
  foto: imagemSchema,
  posicao: z.number().int().min(0).max(1000).default(0),
  ativo: z.boolean().default(true),
  produtos: z
    .array(z.object({ produtoId: idSchema, x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .max(20)
    .refine((ps) => new Set(ps.map((p) => p.produtoId)).size === ps.length, "VALIDATION_ERROR")
    .default([]),
});

export const blocosInicioSchema = z.object({
  blocos: z
    .array(z.object({
      tipo: z.enum(TIPOS_BLOCO),
      refId: idSchema.nullish().transform((v) => v ?? null),
      titulo: textoOpcional(60),
      ativo: z.boolean().default(true),
    }))
    .max(20),
});

// ─── Painel: promoções (regra 28, telas 14 a 17) ─────────────────────────────────────

const dataHora = z.iso.datetime({ offset: true });

const periodo = {
  nome: z.string().trim().min(1).max(50),
  inicio: dataHora,
  fim: dataHora,
};

const produtosEscopo = z.array(z.object({ produtoId: idSchema })).max(500).default([]);

const descontoProdutoEntrada = z.object({
  tipo: z.literal("DESCONTO_PRODUTO"),
  ...periodo,
  produtos: z
    .array(z.object({
      produtoId: idSchema,
      modo: z.enum(["PERCENTUAL", "PRECO_FIXO"]),
      valor: z.number().int().min(1),
    }).refine((p) => p.modo !== "PERCENTUAL" || p.valor <= 90, "VALIDATION_ERROR"))
    .min(1)
    .max(500),
});

const compreMaisEntrada = z.object({
  tipo: z.literal("COMPRE_MAIS"),
  ...periodo,
  escopo: z.enum(["TODOS", "ESPECIFICOS"]).default("TODOS"),
  produtos: produtosEscopo,
  umaPorCliente: z.boolean().default(false),
  orcamentoCentavos: centavos.nullish().transform((v) => v ?? null),
  modo: z.enum(["NIVEIS", "PRECO_POR_GRUPO"]),
  niveis: z.array(z.object({ qtdMin: z.number().int().min(2).max(9), pct: z.number().int().min(1).max(90) })).max(3).default([]),
  grupo: z.object({ qtd: z.number().int().min(2).max(9), precoCentavos: centavos }).nullish().transform((v) => v ?? null),
});

const cupomEntrada = z.object({
  tipo: z.literal("CUPOM"),
  ...periodo,
  escopo: z.enum(["TODOS", "ESPECIFICOS"]).default("TODOS"),
  produtos: produtosEscopo,
  cupom: z.object({
    codigo: cupomSchema,
    modo: z.enum(["VALOR", "PERCENTUAL"]),
    valor: z.number().int().min(1),
    descontoMaximoCentavos: centavos.nullish().transform((v) => v ?? null),
    gastoMinimoCentavos: centavos.nullish().transform((v) => v ?? null),
    quantidadeTotal: z.number().int().min(1).max(9_999_999),
    limitePorCliente: z.number().int().min(1).max(99).default(1),
    validadeDias: z.number().int().min(1).max(90),
  }).refine((c) => c.modo === "VALOR" ? c.valor <= 10_000_000 && !c.descontoMaximoCentavos : c.valor <= 90, "VALIDATION_ERROR"),
});

export const promocaoEntradaSchema = z
  .discriminatedUnion("tipo", [descontoProdutoEntrada, compreMaisEntrada, cupomEntrada])
  .superRefine((p, ctx) => {
    const erro = () => ctx.addIssue({ code: "custom", message: "VALIDATION_ERROR" });
    if (Date.parse(p.fim) <= Date.parse(p.inicio)) erro();
    if (p.tipo !== "DESCONTO_PRODUTO" && p.escopo === "ESPECIFICOS" && p.produtos.length === 0) erro();
    if (p.tipo === "COMPRE_MAIS") {
      if (p.modo === "PRECO_POR_GRUPO" && (!p.grupo || p.niveis.length > 0)) erro();
      if (p.modo === "NIVEIS") {
        const ok = p.niveis.length > 0 && !p.grupo &&
          p.niveis.every((n, i) => i === 0 || (n.qtdMin > p.niveis[i - 1]!.qtdMin && n.pct > p.niveis[i - 1]!.pct));
        if (!ok) erro();
      }
    }
  })
  .transform((p) => ({ ...p, escopo: p.tipo === "DESCONTO_PRODUTO" ? "ESPECIFICOS" as const : p.escopo }));

export type PromocaoEntrada = z.infer<typeof promocaoEntradaSchema>;

// ─── Loja: cotação da sacola ─────────────────────────────────────────────────────────

/** POST /v1/cart/quote. Os limites de peças vêm de app_settings e são conferidos na rota. */
export const cotacaoSchema = z.object({
  itens: z
    .array(z.object({ produtoId: idSchema, qtd: z.number().int().min(1).max(9) }))
    .min(1)
    .max(9)
    .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, "VALIDATION_ERROR"),
  /** Cupom digitado; se não tiver o formato, o motor responde "não encontrado". */
  cupom: z.string().trim().max(40).optional(),
});

// ─── Banco → motor de preço ──────────────────────────────────────────────────────────

const data = z.coerce.date();
const baseDb = { id: z.string(), nome: z.string(), inicio: data, fim: data, encerradaEm: data.nullish() };
const escopoDb = { escopo: z.enum(["TODOS", "ESPECIFICOS"]), produtos: z.array(z.string()) };
const compreMaisDb = {
  ...baseDb,
  ...escopoDb,
  tipo: z.literal("COMPRE_MAIS"),
  umaPorCliente: z.boolean().default(false),
  orcamento: z.object({ totalCentavos: z.number().int(), usadoCentavos: z.number().int() }).nullish(),
};

/** Uma linha de pricing_promotions() no formato de preco.ts. */
export const promocaoDoBancoSchema: z.ZodType<Promocao> = z.union([
  z.object({
    ...baseDb,
    tipo: z.literal("DESCONTO_PRODUTO"),
    produtos: z.record(z.string(), z.object({ modo: z.enum(["PERCENTUAL", "PRECO_FIXO"]), valor: z.number().int() })),
  }),
  z.object({ ...compreMaisDb, modo: z.literal("NIVEIS"), niveis: z.array(z.object({ qtdMin: z.number().int(), pct: z.number().int() })) }),
  z.object({ ...compreMaisDb, modo: z.literal("PRECO_POR_GRUPO"), grupo: z.object({ qtd: z.number().int(), precoCentavos: z.number().int() }) }),
  z.object({
    ...baseDb,
    ...escopoDb,
    tipo: z.literal("CUPOM"),
    codigo: z.string(),
    modo: z.enum(["VALOR", "PERCENTUAL"]),
    valor: z.number().int(),
    descontoMaximoCentavos: z.number().int().nullish(),
    gastoMinimoCentavos: z.number().int().nullish(),
    quantidadeTotal: z.number().int(),
    quantidadeUsada: z.number().int(),
    limitePorCliente: z.number().int(),
    validadeDias: z.number().int(),
  }),
]);
