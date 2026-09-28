// Lista VIP: textos e formatação, sem zod, para a loja importar no navegador sem levar o zod
// junto (o zod testa eval ao carregar, e a CSP bloqueia; F2.6). Os schemas ficam em vip.ts.

import { formatarReais } from "./dinheiro.ts";

export const TEXTO_CONSENTIMENTO_VIP = "Quero receber novidades, drops e ofertas da T-shirt Club pelo WhatsApp.";
export const ORIGENS_VIP = ["POPUP", "RODAPE"] as const;

export interface BeneficioVip { modo: "PERCENTUAL" | "VALOR"; valor: number; minimoCentavos: number | null }

/** "10% OFF" ou "R$ 10,00 OFF", do cupom de boas-vindas. */
export function textoBeneficioVip(b: BeneficioVip): string {
  return b.modo === "PERCENTUAL" ? `${b.valor}% OFF` : `${formatarReais(b.valor)} OFF`;
}

/** Condição do cupom para mostrar junto ("na primeira compra", "acima de R$ 99,00"). */
export function condicaoBeneficioVip(b: BeneficioVip): string {
  return b.minimoCentavos ? `na primeira compra acima de ${formatarReais(b.minimoCentavos)}` : "na primeira compra";
}
