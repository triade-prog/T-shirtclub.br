// Política de trocas (29/09, pedido da loja): 7 dias, peça sem uso e com a etiqueta. O texto curto
// aparece na sacola, na página da peça e no rodapé, e a página /trocas explica o resto.

import { DIAS_TROCA } from "@tshirtclub/domain";

// Os dias moram no domínio, com as mensagens do WhatsApp: a loja e a resposta automática
// não podem dizer prazos diferentes
export { DIAS_TROCA };

/** A regra numa frase, para a sacola e a página da peça. */
export const RESUMO_TROCA = `Troca em até ${DIAS_TROCA} dias, com a peça sem uso e com a etiqueta.`;
