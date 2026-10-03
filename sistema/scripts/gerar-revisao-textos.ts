// Gera docs/design/textos/revisao-de-textos.md com todos os textos que a cliente e a equipe
// leem: erros da loja e do painel, cupom, cartão recusado e as mensagens do WhatsApp, com
// exemplos preenchidos. Os textos saem do packages/domain, então o arquivo é sempre o que está
// no código. Rodar de sistema/:
//   node --experimental-strip-types scripts/gerar-revisao-textos.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CODIGOS_ERRO, type CodigoErro } from "../packages/domain/src/erros.ts";
import { textoCupom, textoErro, textoRecusaCartao, TEXTO_SEM_CONEXAO, type ContextoErro } from "../packages/domain/src/textos.ts";
import { mensagemWhatsApp, NOTIFICACOES } from "../packages/domain/src/mensagens.ts";
import type { MotivoCupom } from "../packages/domain/src/preco.ts";
import { EXEMPLOS_MENSAGENS } from "../packages/domain/src/exemplos-mensagens.ts";

const SAIDA = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/design/textos/revisao-de-textos.md");

// Quando cada erro aparece, em palavras da loja. "Painel" é só a equipe que vê.
const ERROS: Record<CodigoErro, { onde: "Loja" | "Painel" | "Loja e painel"; quando: string; exemplo?: ContextoErro }> = {
  PHONE_INVALID: { onde: "Loja", quando: "O número de WhatsApp digitado não é um celular válido." },
  NO_WHATSAPP: { onde: "Loja", quando: "O número não tem WhatsApp." },
  MAX_ITEMS: { onde: "Loja", quando: "Passou do limite de peças por reserva.", exemplo: { maxPecas: 9 } },
  MAX_PER_MODEL: { onde: "Loja", quando: "Mais peças do mesmo modelo do que o permitido.", exemplo: { maxPorProduto: 2 } },
  STOCK_UNAVAILABLE: { onde: "Loja", quando: "Uma peça acabou enquanto a cliente reservava.", exemplo: { produtos: ["Limoncello"] } },
  INSUFFICIENT_STOCK: { onde: "Loja", quando: "Não há peças suficientes daquele tamanho.", exemplo: { produtos: ["Limoncello", "Pomodoro"] } },
  PRICE_CHANGED: { onde: "Loja", quando: "O preço mudou entre a sacola e a reserva.", exemplo: { totalCentavos: 12499 } },
  COUPON_NOT_BEST: { onde: "Loja", quando: "Aviso, não erro: a cliente já tem um desconto maior que o do cupom." },
  COUPON_INVALID: { onde: "Loja", quando: "O cupom não vale. O texto muda pelo motivo; veja a seção de cupom.", exemplo: { motivoCupom: "ESGOTADO" } },
  ACTIVE_RESERVATION_EXISTS: { onde: "Loja", quando: "A cliente já tem uma reserva aberta.", exemplo: { numeroReserva: 1048, horario: "14:32" } },
  OTP_INVALID: { onde: "Loja", quando: "Código do WhatsApp errado.", exemplo: { tentativasRestantes: 2 } },
  OTP_EXPIRED: { onde: "Loja", quando: "O código do WhatsApp venceu." },
  OTP_LOCKED: { onde: "Loja", quando: "Muitas tentativas de código.", exemplo: { horario: "14:47" } },
  PHONE_BLOCKED: { onde: "Loja", quando: "O telefone está com as reservas pausadas (3 expiradas em 30 dias).", exemplo: { whatsappLoja: "(77) 99815-5772" } },
  ATTEMPT_NOT_VERIFIED: { onde: "Loja", quando: "Tentou confirmar a reserva sem digitar o código. (Novo, 30/09)" },
  UNAUTHORIZED: { onde: "Loja", quando: "A confirmação do aparelho venceu (no painel, volta para a tela de entrar). (Novo, 30/09)" },
  PHONE_VERIFICATION_REQUIRED: { onde: "Loja", quando: "Tentou mexer na entrega sem confirmar o WhatsApp." },
  NOT_FOUND: { onde: "Loja", quando: "Reserva não encontrada (link errado ou de outro telefone)." },
  RESERVATION_NOT_ACTIVE: { onde: "Loja", quando: "A reserva expirou ou foi encerrada e a cliente tentou pagar, cancelar ou escolher a entrega. (Novo, 30/09)" },
  ALREADY_REQUESTED: { onde: "Loja", quando: "Pediu o cancelamento de novo. (Novo, 30/09)" },
  DEADLINE_PASSED: { onde: "Loja", quando: "Tentou começar um pagamento depois do prazo." },
  METHOD_LOCKED: { onde: "Loja", quando: "Começou pelo PIX e tentou trocar para cartão (ou o contrário)." },
  PAYMENT_IN_PROGRESS: { onde: "Loja", quando: "Já tem um pagamento esperando resposta do banco." },
  NOT_PAID: { onde: "Loja", quando: "Tentou escolher a entrega antes de pagar." },
  SHIPPING_ALREADY_PAID: { onde: "Loja", quando: "Tentou mudar a entrega depois de pagar o frete." },
  DELIVERY_LOCKED: { onde: "Loja", quando: "A etapa da entrega mudou enquanto a página estava aberta." },
  QUOTE_EXPIRED: { onde: "Loja", quando: "O prazo de 2 horas para pagar o frete venceu." },
  RATE_LIMITED: { onde: "Loja e painel", quando: "Muitas tentativas seguidas." },
  TURNSTILE_REQUIRED: { onde: "Loja e painel", quando: "Falta a verificação anti-robô." },
  TURNSTILE_INVALID: { onde: "Loja e painel", quando: "A verificação anti-robô falhou." },
  WHATSAPP_OFFLINE: { onde: "Loja", quando: "O WhatsApp da loja está desconectado do sistema." },
  UPSTREAM_UNAVAILABLE: { onde: "Loja e painel", quando: "Sem conexão com o servidor ou com um fornecedor (Mercado Pago, Wafly)." },
  INVALID_CREDENTIALS: { onde: "Painel", quando: "E-mail ou senha errados no login." },
  MFA_REQUIRED: { onde: "Painel", quando: "Falta o código do aplicativo autenticador." },
  MFA_INVALID: { onde: "Painel", quando: "Código do autenticador errado." },
  LOGIN_BLOCKED: { onde: "Painel", quando: "5 senhas erradas da mesma rede.", exemplo: { horario: "15:10" } },
  PASSWORD_WEAK: { onde: "Painel", quando: "Senha nova fraca ou vazada." },
  STOCK_BELOW_COMMITTED: { onde: "Painel", quando: "Ajuste de estoque abaixo do que já está reservado ou vendido.", exemplo: { comprometido: 3 } },
  ALREADY_EXISTS: { onde: "Painel", quando: "Endereço (slug) ou código de peça repetido." },
  PRODUCT_NEEDS_IMAGE: { onde: "Painel", quando: "Publicar peça sem foto." },
  IMAGE_LIMIT: { onde: "Painel", quando: "Mais de 10 fotos na peça." },
  PROMOTION_OVERLAP: { onde: "Painel", quando: "A peça já está em outro desconto no mesmo período." },
  PROMOTION_ENDED: { onde: "Painel", quando: "Mexer numa promoção que já terminou." },
  NOT_READY: { onde: "Painel", quando: "Marcar como entregue antes de estar pronto, ter saído ou ter sido enviado." },
  DISPUTE_OPEN: { onde: "Painel", quando: "Marcar como entregue com estorno ou contestação aberta." },
  VALIDATION_ERROR: { onde: "Loja e painel", quando: "Algum campo chegou em formato inválido (a tela quase sempre avisa antes). Fica com o texto geral." },
  FORBIDDEN: { onde: "Loja e painel", quando: "Acesso negado por um problema técnico. Fica com o texto geral." },
  ALREADY_APPLIED: { onde: "Painel", quando: "Ação repetida (ex.: estorno já feito). Fica com o texto geral." },
  INTERNAL_ERROR: { onde: "Loja e painel", quando: "Erro inesperado do sistema. É o texto geral." },
};

const MOTIVOS_CUPOM: [MotivoCupom, string, ContextoErro?][] = [
  ["NAO_ENCONTRADO", "O código não existe."],
  ["AGENDADO", "O cupom ainda não começou.", { horario: "10/10 às 09:00" }],
  ["ENCERRADO", "O cupom terminou."],
  ["VENCIDO", "Passou a validade em dias contada do primeiro uso."],
  ["ESGOTADO", "Acabou a quantidade do cupom."],
  ["GASTO_MINIMO", "A compra não chegou ao valor mínimo.", { gastoMinimoCentavos: 9000 }],
  ["SEM_PRODUTOS", "O cupom é de outras peças."],
  ["LIMITE_CLIENTE", "A cliente já usou o máximo de vezes."],
];

const RECUSAS: [string, string][] = [
  ["cc_rejected_insufficient_amount", "Sem limite"],
  ["cc_rejected_bad_filled_security_code", "CVV errado"],
  ["cc_rejected_bad_filled_date", "Validade errada"],
  ["cc_rejected_bad_filled_card_number", "Número ou outro dado errado"],
  ["cc_rejected_call_for_authorize", "Banco pede autorização"],
  ["cc_rejected_card_disabled", "Cartão bloqueado"],
  ["cc_rejected_duplicated_payment", "Pagamento repetido"],
  ["cc_rejected_high_risk", "Recusado pela análise de segurança"],
  ["cc_rejected_max_attempts", "Tentativas demais"],
  ["outro", "Qualquer outro motivo"],
];

const EXEMPLOS = EXEMPLOS_MENSAGENS;

const linha = (...c: string[]) => `| ${c.map((x) => x.replace(/\|/g, "\\|")).join(" | ")} |`;
const L: string[] = [];
const w = (s = "") => L.push(s);

w("# Revisão dos textos da T-shirt Club");
w();
w("Gerado do código em 30/09/2026 para a revisão da loja (item D4 do painel de execução). São todos os textos que a cliente e a equipe leem em situações de erro, aviso ou mensagem automática.");
w();
w("**Como revisar:** escreva a mudança logo abaixo do texto, ou marque ✔ quando estiver bom. Não precisa mexer no código: eu aplico o que vocês marcarem.");
w();
w("- Nos exemplos, nomes, números e horários são de mentira (Ana Paula, reserva #1048, 14:32). No sistema entram os dados reais.");
w("- Nas mensagens do WhatsApp, `*texto*` sai em **negrito** no celular.");
w("- Os textos de erro aparecem na tela, perto de onde a cliente estava.");
w();
w("## 1. Erros e avisos");
w();
for (const onde of ["Loja", "Loja e painel", "Painel"] as const) {
  w(`### ${onde === "Loja" ? "Na loja (a cliente vê)" : onde === "Painel" ? "No painel (só a equipe vê)" : "Na loja e no painel"}`);
  w();
  w(linha("Quando aparece", "Texto na tela", "Revisão"));
  w(linha("---", "---", "---"));
  for (const [codigo, info] of Object.entries(ERROS) as [CodigoErro, (typeof ERROS)[CodigoErro]][]) {
    if (info.onde !== onde) continue;
    w(linha(info.quando, textoErro(codigo, info.exemplo).mensagem, "☐"));
  }
  w();
}
const semDescricao = (Object.keys(CODIGOS_ERRO) as CodigoErro[]).filter((c) => !ERROS[c]);
if (semDescricao.length) throw new Error(`Códigos sem descrição: ${semDescricao.join(", ")}`);

w("### Cupom que não vale");
w();
w(linha("Motivo", "Texto na tela", "Revisão"));
w(linha("---", "---", "---"));
for (const [m, quando, ctx] of MOTIVOS_CUPOM) w(linha(quando, textoCupom(m, ctx), "☐"));
w();
w("### Cartão recusado");
w();
w(linha("Motivo do banco", "Texto na tela", "Revisão"));
w(linha("---", "---", "---"));
for (const [cod, quando] of RECUSAS) w(linha(quando, textoRecusaCartao(cod === "outro" ? undefined : cod), "☐"));
w();
w("### Sem internet");
w();
w(linha("Quando aparece", "Texto na tela", "Revisão"));
w(linha("---", "---", "---"));
w(linha("O celular da cliente fica sem conexão", TEXTO_SEM_CONEXAO.mensagem, "☐"));
w();
w("## 2. Mensagens do WhatsApp");
w();
w("Uma versão oficial por mensagem (decisão da loja de 27/09). As que o painel permite desligar estão marcadas; as essenciais saem sempre.");
w();
const noPainel = new Map(NOTIFICACOES.flatMap((n) => n.modelos.map((m) => [m, n] as const)));
for (const e of EXEMPLOS) {
  const n = noPainel.get(e.modelo);
  const selo = e.modelo === "aviso_loja"
    ? "vai para o WhatsApp da equipe; liga e desliga nos avisos da loja"
    : n ? (n.essencial ? "essencial, sempre ligada" : `a loja liga e desliga no painel ("${n.nome}")`) : "resposta da conversa";
  w(`### ${e.titulo}`);
  w();
  w(`*${selo}*`);
  w();
  w("```text");
  w(mensagemWhatsApp(e.modelo, e.p as never, 0));
  w("```");
  w();
  w("Revisão: ☐");
  w();
}

mkdirSync(dirname(SAIDA), { recursive: true });
writeFileSync(SAIDA, L.join("\n"));
console.log(`Gerado ${SAIDA}`);
