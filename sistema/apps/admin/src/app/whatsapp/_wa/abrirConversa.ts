// Abrir uma conversa na aba Atendimento a partir de outra tela (a reserva, 0580): o número vai
// pela sessão do navegador, não pelo endereço, para ficar fora do histórico e dos registros.

const CHAVE = "painel:conversa";

export function pedirConversa(chat: string): void {
  try { sessionStorage.setItem(CHAVE, chat); } catch { /* sem sessão: abre a caixa de entrada */ }
}

/** A conversa pedida (lida sem apagar: o React pode chamar duas vezes ao montar). */
export function conversaPedida(): string | null {
  try {
    const chat = sessionStorage.getItem(CHAVE);
    return chat && /^[0-9A-Za-z@._:-]{3,60}$/.test(chat) ? chat : null;
  } catch {
    return null;
  }
}

/** Depois de aberta, a conversa pedida sai da sessão (vale uma vez só). */
export function esquecerConversaPedida(): void {
  try { sessionStorage.removeItem(CHAVE); } catch { /* nada a apagar */ }
}
