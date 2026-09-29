// Política de trocas (29/09, pedido da loja): 7 dias, peça sem uso e com a etiqueta. O texto curto
// aparece na sacola, na página da peça e no rodapé, e a página /trocas explica o resto.

/** Dias para pedir a troca, contados de quando a cliente recebe ou retira a peça. */
export const DIAS_TROCA = 7;

/** A regra numa frase, para a sacola e a página da peça. */
export const RESUMO_TROCA = `Troca em até ${DIAS_TROCA} dias, com a peça sem uso e com a etiqueta.`;
