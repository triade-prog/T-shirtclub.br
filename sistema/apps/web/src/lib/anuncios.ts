// Google Ads (tráfego pago): a página /pagamento-aprovado e a conversão da compra. A tag só
// carrega depois que a cliente aceita os cookies de anúncio (LGPD); antes disso nada sai do
// navegador. Sem GOOGLE_ADS_ID, nada disso existe: nem aviso, nem tag, nem domínio na CSP.

/** ID da conta do Google Ads (AW-…); formato estrito, porque entra na URL da tag e na CSP. */
export function idAnuncios(valor: string | undefined): string | null {
  return valor && /^AW-\d{6,15}$/.test(valor) ? valor : null;
}

/** Rótulo da ação de conversão "compra" (a parte depois da barra em AW-…/rótulo). */
export function rotuloConversao(valor: string | undefined): string | null {
  return valor && /^[A-Za-z0-9_-]{6,40}$/.test(valor) ? valor : null;
}

export const CHAVE_CONSENTIMENTO = "tc-cookies-anuncios";
export type Consentimento = "aceito" | "recusado";

export function lerConsentimento(): Consentimento | null {
  try {
    const v = localStorage.getItem(CHAVE_CONSENTIMENTO);
    return v === "aceito" || v === "recusado" ? v : null;
  } catch {
    return null;
  }
}

export function gravarConsentimento(v: Consentimento) {
  try { localStorage.setItem(CHAVE_CONSENTIMENTO, v); } catch { /* sem armazenamento: o aviso volta na próxima visita */ }
}

/** Evento de conversão da compra: valor dos produtos em reais e o número da reserva como transação (o Google descarta a repetida). */
export function eventoCompra(id: string, rotulo: string, reserva: { numero: number; totalCentavos: number }) {
  return ["event", "conversion", { send_to: `${id}/${rotulo}`, value: reserva.totalCentavos / 100, currency: "BRL", transaction_id: String(reserva.numero) }] as const;
}

type Janela = Window & { dataLayer?: unknown[]; tcCompraPendente?: readonly unknown[] };

// O gtag.js lê a fila com o objeto `arguments` de cada chamada, não com um array.
function gtag(..._args: unknown[]) {
  const w = window as Janela;
  w.dataLayer = w.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

/** Carrega a tag uma vez (depois do aceite) e envia a compra que estava esperando. */
export function carregarTag(id: string) {
  if (document.getElementById("tag-google")) return;
  gtag("js", new Date());
  gtag("config", id);
  const w = window as Janela;
  if (w.tcCompraPendente) {
    gtag(...w.tcCompraPendente);
    w.tcCompraPendente = undefined;
  }
  const s = document.createElement("script");
  s.id = "tag-google";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

/** Registra a compra: na hora, se a tag já carregou; senão fica esperando o aceite nesta página. */
export function registrarCompra(id: string, rotulo: string, reserva: { numero: number; totalCentavos: number }) {
  const evento = eventoCompra(id, rotulo, reserva);
  if (lerConsentimento() === "aceito" && document.getElementById("tag-google")) gtag(...evento);
  else (window as Janela).tcCompraPendente = evento;
}
