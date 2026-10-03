// Google Ads (tráfego pago): a página /pagamento-aprovado e a conversão da compra. A tag só
// carrega depois que a cliente aceita os cookies de anúncio (LGPD); antes disso nada sai do
// navegador. Sem GOOGLE_ADS_ID, nada disso existe: nem aviso, nem tag, nem domínio na CSP.

/**
 * ID da tag que a loja carrega: a conta do Google Ads (AW-…) ou a tag do Google (G-…), que o
 * Google Ads passou a criar nas contas novas (03/10) e que envia as conversões para a conta
 * ligada a ela. Formato estrito, porque entra na URL da tag e na CSP.
 */
export function idAnuncios(valor: string | undefined): string | null {
  return valor && /^(AW-\d{6,15}|G-[A-Z0-9]{6,15})$/.test(valor) ? valor : null;
}

const ROTULO = /^[A-Za-z0-9_-]{6,40}$/;
const DESTINO = /^AW-\d{6,15}\/[A-Za-z0-9_-]{6,40}$/;

/**
 * Para onde vai a conversão da compra (send_to do evento): o GOOGLE_ADS_ROTULO_COMPRA inteiro
 * como o Google mostra no snippet do evento (AW-…/rótulo) ou só o rótulo, quando o ID da loja é
 * a própria conta (AW-…). Com a tag G- e só o rótulo, não há conta para montar: null, e a compra
 * fica contada só pela visita a /pagamento-aprovado (conversão por endereço, sem o valor).
 */
export function destinoCompra(id: string, valor: string | undefined): string | null {
  if (!valor) return null;
  if (DESTINO.test(valor)) return valor;
  return ROTULO.test(valor) && id.startsWith("AW-") ? `${id}/${valor}` : null;
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

type Evento = readonly unknown[];

/**
 * Eventos da compra, com o valor em reais e o número da reserva como transação (o Google descarta
 * a repetida): a conversão do Google Ads, quando há destino (AW-…/rótulo), e, com a tag do Google
 * (G-…), a compra no formato do Google Analytics ("purchase"), que o Google Ads importa de lá.
 */
export function eventosCompra(id: string, destino: string | null, reserva: { numero: number; totalCentavos: number }): Evento[] {
  const dados = { value: reserva.totalCentavos / 100, currency: "BRL", transaction_id: String(reserva.numero) };
  return [
    ...(destino ? [["event", "conversion", { send_to: destino, ...dados }]] : []),
    ...(id.startsWith("G-") ? [["event", "purchase", dados]] : []),
  ];
}

type Janela = Window & { dataLayer?: unknown[]; tcCompraPendente?: Evento[] };

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
    for (const evento of w.tcCompraPendente) gtag(...evento);
    w.tcCompraPendente = undefined;
  }
  const s = document.createElement("script");
  s.id = "tag-google";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

/** Registra a compra: na hora, se a tag já carregou; senão fica esperando o aceite nesta página. */
export function registrarCompra(id: string, destino: string | null, reserva: { numero: number; totalCentavos: number }) {
  const eventos = eventosCompra(id, destino, reserva);
  if (eventos.length === 0) return;
  if (lerConsentimento() === "aceito" && document.getElementById("tag-google")) for (const evento of eventos) gtag(...evento);
  else (window as Janela).tcCompraPendente = eventos;
}
